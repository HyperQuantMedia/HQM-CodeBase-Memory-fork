import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSizeMapSphereProbe } from "./useSizeMapSphereProbe";
import { NOTIFY_AFTER_MS, type SphereProbeReport } from "../lib/sizeMapSphereProbe";
import { RADII_FIT_QUANTILE } from "../lib/viewLayout";
import type { SphereProbeResponse } from "../workers/sizeMapSphereProbe.worker";

/* jsdom has no Worker, and spinning a real one would put the thing under test on the
 * other side of the boundary being tested. This stands in for the thread: the test
 * drives it, so the delegation rules — supersede, notify, apply — are observable. */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent<SphereProbeResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  /** Push a worker reply into the hook. */
  reply(response: SphereProbeResponse) {
    this.onmessage?.({ data: response } as MessageEvent<SphereProbeResponse>);
  }
}

const report = (over: Partial<SphereProbeReport> = {}): SphereProbeReport => ({
  corpus: "p",
  files: 10,
  shape: {
    files: 10,
    dirs: 2,
    dirsPerFile: 0.2,
    meanDepth: 3,
    maxDepth: 4,
    bytesP50: 1000,
    bytesP90: 2000,
    bytesP99: 3000,
    bytesMax: 4000,
    spread: 4,
  },
  measurements: [],
  recommended: 0.82,
  elapsedMs: 120,
  slow: false,
  ...over,
});

const INPUT = { name: "p", files: [{ path: "a.ts", bytes: 10 }] };

beforeEach(() => {
  FakeWorker.last = null;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSizeMapSphereProbe", () => {
  it("starts at the shipped dial and spawns no thread until asked", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
    expect(result.current.status).toBe("idle");
    expect(FakeWorker.last).toBeNull();
  });

  it("delegates the run to a worker", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));

    expect(result.current.status).toBe("running");
    expect(FakeWorker.last?.posted).toEqual([
      { type: "run", runId: 1, input: INPUT },
    ]);
  });

  it("adopts a recommendation", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() => FakeWorker.last?.reply({ type: "done", runId: 1, report: report() }));

    expect(result.current.status).toBe("done");
    expect(result.current.quantile).toBe(0.82);
  });

  /* The rule that matters: a measurement that found nothing acceptable must not move
   * the scene. Applying "the best of a bad set" is exactly the invented-metric
   * failure this whole probe exists to stop. */
  it("leaves the dial alone when no notch qualified, and says why", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() =>
      FakeWorker.last?.reply({
        type: "done",
        runId: 1,
        report: report({ recommended: null }),
      }),
    );

    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
    expect(result.current.notice).toContain("No spacing setting");
  });

  it("honours autoApply: false", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe({ autoApply: false }));
    act(() => result.current.measure(INPUT));
    act(() => FakeWorker.last?.reply({ type: "done", runId: 1, report: report() }));

    expect(result.current.report?.recommended).toBe(0.82);
    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
  });

  it("says what the view is showing once a run reports itself slow", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() =>
      FakeWorker.last?.reply({
        type: "progress",
        runId: 1,
        progress: { done: 3, total: 27, elapsedMs: 2400, slow: true },
      }),
    );

    expect(result.current.notice).toContain("3 of 27");
    expect(result.current.notice).toContain("previous spacing");
    expect(result.current.status).toBe("running");
  });

  /* Belt as well as braces. If the worker never reports at all — blocked on spawn,
   * killed by the browser — the silence is the failure the 2 s rule is against, so a
   * timer says it instead. */
  it("notifies past the threshold even if the worker goes quiet", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    expect(result.current.notice).toBeNull();

    act(() => vi.advanceTimersByTime(NOTIFY_AFTER_MS - 1));
    expect(result.current.notice).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.notice).toContain("Still measuring");
  });

  it("does not notify about a run that already finished", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() => FakeWorker.last?.reply({ type: "done", runId: 1, report: report() }));
    act(() => vi.advanceTimersByTime(NOTIFY_AFTER_MS * 2));

    expect(result.current.notice).toBeNull();
    expect(result.current.status).toBe("done");
  });

  /* A late reply from a superseded run describes a scene that no longer exists. */
  it("ignores replies from a superseded run", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() => result.current.measure(INPUT));
    act(() =>
      FakeWorker.last?.reply({
        type: "done",
        runId: 1,
        report: report({ recommended: 0.55 }),
      }),
    );

    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
    expect(result.current.status).toBe("running");

    act(() => FakeWorker.last?.reply({ type: "done", runId: 2, report: report() }));
    expect(result.current.quantile).toBe(0.82);
  });

  it("reuses the one worker across runs", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    const first = FakeWorker.last;
    act(() => result.current.measure(INPUT));
    expect(FakeWorker.last).toBe(first);
    expect(first?.posted).toHaveLength(2);
  });

  it("aborts through the worker and leaves the scene as it was", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() => result.current.cancel());

    expect(FakeWorker.last?.posted).toContainEqual({ type: "abort", runId: 1 });
    expect(result.current.status).toBe("idle");
    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
    expect(result.current.notice).toContain("unchanged");
  });

  it("surfaces a worker failure as a sentence, not a stack", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() =>
      FakeWorker.last?.reply({ type: "error", runId: 1, message: "out of memory" }),
    );

    expect(result.current.status).toBe("error");
    expect(result.current.notice).toBe(
      "Sphere density measurement failed: out of memory",
    );
  });

  it("reset returns the dial to the shipped value", () => {
    const { result } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    act(() => FakeWorker.last?.reply({ type: "done", runId: 1, report: report() }));
    act(() => result.current.reset());

    expect(result.current.quantile).toBe(RADII_FIT_QUANTILE);
    expect(result.current.status).toBe("idle");
    expect(result.current.notice).toBeNull();
  });

  /* A leaked worker keeps a whole corpus alive after the tab it belonged to is gone. */
  it("terminates the thread on unmount", () => {
    const { result, unmount } = renderHook(() => useSizeMapSphereProbe());
    act(() => result.current.measure(INPUT));
    const worker = FakeWorker.last;
    unmount();
    expect(worker?.terminated).toBe(true);
  });
});
