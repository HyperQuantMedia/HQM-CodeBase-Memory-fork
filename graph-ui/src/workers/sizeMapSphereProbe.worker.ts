/* The sphere probe's thread.
 *
 * The measurement is O(samples × nodes) per notch across a dozen notches, which on a
 * real corpus is seconds of arithmetic. On the main thread that is a frozen tab —
 * and a frozen tab during a density measurement is the same failure the measurement
 * exists to prevent: the user cannot tell a slow answer from a broken view.
 *
 * The worker holds no state of its own beyond the run in flight. It does not own the
 * dial, does not decide when to apply a result, and does not talk to React — the host
 * decides all three, because "measure" and "change what is on screen" are different
 * authorities and the probe only has the first. */

import {
  runSphereProbe,
  type SphereProbeInput,
  type SphereProbeProgress,
  type SphereProbeReport,
  type RunSphereProbeOptions,
} from "../lib/sizeMapSphereProbe";

export interface SphereProbeRunMessage {
  type: "run";
  /** Correlates replies with the request, so a stale run's results are droppable. */
  runId: number;
  input: SphereProbeInput;
  options?: Pick<RunSphereProbeOptions, "views" | "quantiles" | "sliceMs">;
}

export interface SphereProbeAbortMessage {
  type: "abort";
  runId: number;
}

export type SphereProbeRequest = SphereProbeRunMessage | SphereProbeAbortMessage;

export type SphereProbeResponse =
  | { type: "progress"; runId: number; progress: SphereProbeProgress }
  | { type: "done"; runId: number; report: SphereProbeReport }
  | { type: "error"; runId: number; message: string };

/* One run at a time. A second request supersedes the first rather than queueing:
 * the corpus or the projection changed, so the earlier answer is about a scene that
 * no longer exists. */
let current: { runId: number; controller: AbortController } | null = null;

self.onmessage = (event: MessageEvent<SphereProbeRequest>) => {
  const message = event.data;

  if (message.type === "abort") {
    if (current?.runId === message.runId) current.controller.abort();
    return;
  }

  if (message.type !== "run") return;

  current?.controller.abort();
  const controller = new AbortController();
  current = { runId: message.runId, controller };

  const post = (response: SphereProbeResponse) => {
    /* Drop anything from a superseded run: the host would have to filter it anyway,
     * and a late "done" overwriting a fresh one is the bug that follows from not
     * doing it here. */
    if (current?.runId !== response.runId) return;
    self.postMessage(response);
  };

  runSphereProbe(message.input, {
    ...message.options,
    signal: controller.signal,
    onProgress: (progress: SphereProbeProgress) =>
      post({ type: "progress", runId: message.runId, progress }),
  })
    .then((report) => post({ type: "done", runId: message.runId, report }))
    .catch((error: unknown) =>
      post({
        type: "error",
        runId: message.runId,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    .finally(() => {
      if (current?.runId === message.runId) current = null;
    });
};
