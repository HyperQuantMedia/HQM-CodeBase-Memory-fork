/* Delegated sphere-probe run: start it, watch it, apply what it found.
 *
 * Three rules this hook exists to enforce, none of which belong in the probe itself:
 *
 * 1. **It runs off the main thread.** A worker, spawned on first use and kept, because
 *    a density sweep is seconds of arithmetic and a frozen tab is indistinguishable
 *    from a broken view.
 * 2. **Past two seconds the user is told.** Not cancelled — told. A background job
 *    that silently takes six seconds cannot be told apart from one that died, and the
 *    view is still showing the *old* density while it runs, so silence is a lie about
 *    what is on screen.
 * 3. **A result is applied, never assumed.** The probe recommends a notch; the caller
 *    decides whether the scene adopts it. When no notch put every projection inside
 *    the calibration band, nothing is applied and the reason is surfaced — the same
 *    rule as never closing a visual defect on a metric of my own choosing.
 *
 * The worker is created lazily so a session that never asks for a measurement never
 * pays for the thread. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTIFY_AFTER_MS,
  type SphereProbeInput,
  type SphereProbeProgress,
  type SphereProbeReport,
} from "../lib/sizeMapSphereProbe";
import { RADII_FIT_QUANTILE } from "../lib/viewLayout";
import type {
  SphereProbeRequest,
  SphereProbeResponse,
} from "../workers/sizeMapSphereProbe.worker";

export type SphereProbeStatus = "idle" | "running" | "done" | "error";

export interface SphereProbeState {
  status: SphereProbeStatus;
  progress: SphereProbeProgress | null;
  report: SphereProbeReport | null;
  /* Non-null once the run has passed NOTIFY_AFTER_MS, or on failure. Plain sentence,
   * because it is shown to a user who did not ask about quantiles. */
  notice: string | null;
  /** The notch currently applied to the scene. */
  quantile: number;
}

const IDLE: SphereProbeState = {
  status: "idle",
  progress: null,
  report: null,
  notice: null,
  quantile: RADII_FIT_QUANTILE,
};

export interface UseSizeMapSphereProbe extends SphereProbeState {
  /** Delegate a run. Supersedes any run in flight. */
  measure: (input: SphereProbeInput) => void;
  /** Stop the run in flight; the scene keeps whatever notch it had. */
  cancel: () => void;
  /** Put the dial back to the shipped value. */
  reset: () => void;
}

export function useSizeMapSphereProbe(options?: {
  /** Adopt the recommendation automatically when the run lands one. Default true. */
  autoApply?: boolean;
}): UseSizeMapSphereProbe {
  const autoApply = options?.autoApply ?? true;
  const [state, setState] = useState<SphereProbeState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current !== null) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

  /* One worker per mounted view, torn down with it. A leaked worker keeps a corpus
   * alive in memory long after the tab it belonged to is gone. */
  useEffect(() => {
    return () => {
      clearSlowTimer();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [clearSlowTimer]);

  const post = useCallback((message: SphereProbeRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  const measure = useCallback(
    (input: SphereProbeInput) => {
      const runId = ++runIdRef.current;

      if (!workerRef.current) {
        /* `new URL(..., import.meta.url)` is the form Vite can see statically, so the
         * worker is bundled rather than fetched from a path that only exists in dev. */
        const worker = new Worker(
          new URL("../workers/sizeMapSphereProbe.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (event: MessageEvent<SphereProbeResponse>) => {
          const message = event.data;
          /* A superseded run's replies are not the current answer. */
          if (message.runId !== runIdRef.current) return;

          if (message.type === "progress") {
            setState((prev) => ({
              ...prev,
              progress: message.progress,
              notice: message.progress.slow ? slowNotice(message.progress) : prev.notice,
            }));
            return;
          }

          clearSlowTimer();

          if (message.type === "error") {
            setState((prev) => ({
              ...prev,
              status: "error",
              notice: `Sphere density measurement failed: ${message.message}`,
            }));
            return;
          }

          const { report } = message;
          setState((prev) => ({
            status: "done",
            progress: prev.progress,
            report,
            quantile:
              autoApply && report.recommended !== null
                ? report.recommended
                : prev.quantile,
            notice: doneNotice(report),
          }));
        };
        worker.onerror = (event: ErrorEvent) => {
          clearSlowTimer();
          setState((prev) => ({
            ...prev,
            status: "error",
            notice: `Sphere density measurement failed: ${event.message}`,
          }));
        };
        workerRef.current = worker;
      }

      setState((prev) => ({
        ...prev,
        status: "running",
        progress: null,
        report: null,
        notice: null,
      }));

      /* Belt as well as braces: the worker reports `slow` itself, but if it never
       * reports at all — blocked on spawn, killed by the browser — the silence is
       * exactly what this rule is against. */
      clearSlowTimer();
      slowTimerRef.current = setTimeout(() => {
        setState((prev) =>
          prev.status === "running" && prev.notice === null
            ? { ...prev, notice: STILL_MEASURING }
            : prev,
        );
      }, NOTIFY_AFTER_MS);

      post({ type: "run", runId, input });
    },
    [autoApply, clearSlowTimer, post],
  );

  const cancel = useCallback(() => {
    clearSlowTimer();
    post({ type: "abort", runId: runIdRef.current });
    setState((prev) => ({
      ...prev,
      status: "idle",
      notice: "Sphere density measurement stopped. The view is unchanged.",
    }));
  }, [clearSlowTimer, post]);

  const reset = useCallback(() => {
    clearSlowTimer();
    runIdRef.current++;
    setState(IDLE);
  }, [clearSlowTimer]);

  return { ...state, measure, cancel, reset };
}

const STILL_MEASURING =
  "Still measuring sphere density — the view is showing the previous spacing until it finishes.";

function slowNotice(progress: SphereProbeProgress): string {
  return `Still measuring sphere density (${progress.done} of ${progress.total} settings) — the view is showing the previous spacing until it finishes.`;
}

function doneNotice(report: SphereProbeReport): string | null {
  if (report.aborted) return "Sphere density measurement stopped. The view is unchanged.";
  if (report.recommended === null) {
    return "No spacing setting kept every projection readable. The view is unchanged — the measurements are in the report.";
  }
  if (!report.slow) return null;
  return `Sphere spacing measured in ${(report.elapsedMs / 1000).toFixed(1)}s and applied.`;
}
