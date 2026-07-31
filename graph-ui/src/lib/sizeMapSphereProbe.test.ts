import { describe, expect, it } from "vitest";
import {
  beginSphereProbeJob,
  CALIBRATION,
  describeCorpus,
  finishSphereProbeJob,
  formatSphereProbeReport,
  NOTIFY_AFTER_MS,
  recommendQuantile,
  runSphereProbe,
  sphereProbeJobs,
  stepSphereProbeJob,
  syntheticSizeCorpus,
  type SphereProbeInput,
  type SphereProbeMeasurement,
} from "./sizeMapSphereProbe";
import { drawnRadius } from "./sizeGraph";
import { buildSizeTree } from "./sizeMap";
import { sizeTreeToGraph } from "./sizeGraph";
import { applyViewMode, DEFAULT_LAYOUT_PARAMS } from "./viewLayout";

/* Small enough to run in the suite, lopsided enough to still be the real question. */
const SMALL: SphereProbeInput = {
  name: "probe",
  files: syntheticSizeCorpus({ fileCount: 1500, seed: 7 }),
  samples: 40,
  maxNodes: 400,
};

describe("syntheticSizeCorpus", () => {
  it("is identical for a given seed", () => {
    const a = syntheticSizeCorpus({ fileCount: 200, seed: 42 });
    const b = syntheticSizeCorpus({ fileCount: 200, seed: 42 });
    expect(a).toEqual(b);
  });

  it("differs between seeds, so the seed is doing something", () => {
    const a = syntheticSizeCorpus({ fileCount: 200, seed: 1 });
    const b = syntheticSizeCorpus({ fileCount: 200, seed: 2 });
    expect(a).not.toEqual(b);
  });

  /* The fixture's whole job, and the assertion that would have caught the first
   * version. A corpus without the real spread sweeps degenerately — identical numbers
   * at every notch — which reads exactly like a broken layout.
   *
   * Bounds are the real corpora, measured 2026-07-31:
   *   p4    26,411 files · p50 2,157 · p90 622,488 · max 2.58 GB · spread 1,195,167x
   *   astra    864 files · p50 2,337 · p90  16,479 · max  274 MB · spread   117,533x
   * Asserted as an order of magnitude, not a value: this is a fixture standing in for
   * a class of corpus, not a copy of one tree. */
  it("matches the real corpora's byte spread to an order of magnitude", () => {
    const shape = describeCorpus(syntheticSizeCorpus({ fileCount: 20_000, seed: 3 }));
    expect(shape.bytesP50).toBeGreaterThan(500);
    expect(shape.bytesP50).toBeLessThan(10_000);
    /* The term that decides whether the dial has anything to do at all. */
    expect(shape.spread).toBeGreaterThan(100_000);
    expect(shape.bytesP90 / shape.bytesP50).toBeGreaterThan(20);
  });

  /* The other half, and the one that actually caused the degenerate run: the size
   * graph caps at 8,000 nodes and emits heaviest-first, so too many directories fill
   * that budget with fixed-radius folders and the measurement stops being about
   * byte-driven radii. */
  it("matches the real corpora's tree shape", () => {
    const shape = describeCorpus(syntheticSizeCorpus({ fileCount: 20_000, seed: 4 }));
    expect(shape.meanDepth).toBeGreaterThan(7);
    expect(shape.meanDepth).toBeLessThan(13);
    expect(shape.maxDepth).toBeLessThanOrEqual(17);
    expect(shape.dirsPerFile).toBeGreaterThan(0.05);
    expect(shape.dirsPerFile).toBeLessThan(0.3);
  });
});

describe("describeCorpus", () => {
  it("counts every ancestor directory once and ignores the filename", () => {
    const shape = describeCorpus([
      { path: "a/b/one.ts", bytes: 10 },
      { path: "a/b/two.ts", bytes: 20 },
      { path: "a/c/three.ts", bytes: 30 },
    ]);
    /* a, a/b, a/c — not the files. */
    expect(shape.dirs).toBe(3);
    expect(shape.files).toBe(3);
    expect(shape.meanDepth).toBe(3);
    expect(shape.maxDepth).toBe(3);
  });

  it("survives an empty corpus without dividing by zero", () => {
    const shape = describeCorpus([]);
    expect(shape.spread).toBe(0);
    expect(shape.meanDepth).toBe(0);
    expect(shape.bytesP50).toBe(1);
  });

  it("reads Windows separators as separators", () => {
    expect(describeCorpus([{ path: "a\\b\\one.ts", bytes: 1 }]).dirs).toBe(2);
  });
});

describe("the injected quantile reaches the real layout", () => {
  /* If this passes trivially the sweep measures nothing: every notch would return the
   * same scene and the recommendation would be whichever notch sorted first. */
  it("changes the fitted scene", () => {
    const graph = sizeTreeToGraph(buildSizeTree(SMALL.files, "probe"), {
      maxNodes: 400,
    });
    const extentAt = (quantile: number) => {
      const placed = applyViewMode(
        graph.nodes.map((n) => ({ ...n })),
        graph.edges,
        "sphere",
        DEFAULT_LAYOUT_PARAMS,
        undefined,
        drawnRadius,
        quantile,
      );
      let extent = 0;
      for (const n of placed) extent = Math.max(extent, Math.hypot(n.x, n.y, n.z));
      return extent;
    };
    expect(extentAt(0.95)).toBeGreaterThan(extentAt(0.55));
  });

  it("defaults to the shipped value when the argument is omitted", () => {
    const graph = sizeTreeToGraph(buildSizeTree(SMALL.files, "probe"), {
      maxNodes: 400,
    });
    const place = (quantile?: number) =>
      applyViewMode(
        graph.nodes.map((n) => ({ ...n })),
        graph.edges,
        "sphere",
        DEFAULT_LAYOUT_PARAMS,
        undefined,
        drawnRadius,
        quantile,
      ).map((n) => [n.x, n.y, n.z]);
    expect(place()).toEqual(place(0.7));
  });
});

describe("sub-jobs", () => {
  /* The chunking is the delegated-run feature, so a sliced run has to be the same
   * measurement as a straight one — otherwise the number depends on how busy the
   * thread was, which is not a number. */
  it("slicing does not change the result", () => {
    const job = { view: "sphere" as const, quantile: 0.7 };

    const flat = beginSphereProbeJob(SMALL, job);
    expect(stepSphereProbeJob(flat, 60_000)).toBe(true);

    const sliced = beginSphereProbeJob(SMALL, job);
    let slices = 0;
    /* A zero-length slice yields after every 32nd sample, which is the tightest
     * chunking the stepper can produce. */
    while (!stepSphereProbeJob(sliced, 0)) {
      slices++;
      expect(slices).toBeLessThan(1000);
    }

    expect(slices).toBeGreaterThan(0);
    expect(finishSphereProbeJob(sliced)).toEqual(finishSphereProbeJob(flat));
  });

  it("is idempotent once finished", () => {
    const state = beginSphereProbeJob(SMALL, { view: "cone", quantile: 0.7 });
    stepSphereProbeJob(state, 60_000);
    const first = finishSphereProbeJob(state);
    expect(stepSphereProbeJob(state, 60_000)).toBe(true);
    expect(finishSphereProbeJob(state)).toEqual(first);
  });

  it("reports the band membership it was measured against", () => {
    const state = beginSphereProbeJob(SMALL, { view: "sphere", quantile: 0.98 });
    stepSphereProbeJob(state, 60_000);
    const m = finishSphereProbeJob(state);
    expect(m.withinBand).toBe(
      m.overlappingPct >= CALIBRATION.minOverlappingPct &&
        m.overlappingPct <= CALIBRATION.maxOverlappingPct,
    );
  });
});

describe("sphereProbeJobs", () => {
  it("crosses every view with every notch", () => {
    expect(sphereProbeJobs(["sphere", "tree"], [0.6, 0.7])).toEqual([
      { view: "sphere", quantile: 0.6 },
      { view: "sphere", quantile: 0.7 },
      { view: "tree", quantile: 0.6 },
      { view: "tree", quantile: 0.7 },
    ]);
  });
});

describe("recommendQuantile", () => {
  const m = (
    view: "sphere" | "cone",
    quantile: number,
    overlappingPct: number,
  ): SphereProbeMeasurement => ({
    view,
    quantile,
    nodes: 100,
    overlappingPct,
    clearanceInRadii: 1,
    minClearance: 0,
    extent: 1000,
    withinBand:
      overlappingPct >= CALIBRATION.minOverlappingPct &&
      overlappingPct <= CALIBRATION.maxOverlappingPct,
  });

  /* One dial serves three projections, so a notch that only works in one view is not
   * a candidate at all — the parity ruling, expressed as a filter. */
  it("rejects a notch that fails any single view", () => {
    expect(
      recommendQuantile([m("sphere", 0.7, 20), m("cone", 0.7, 60)]),
    ).toBeNull();
  });

  /* Ties break toward density because the failure the owner overturned was an empty
   * scene, not a crowded one. */
  it("prefers the denser of two acceptable notches", () => {
    expect(
      recommendQuantile([
        m("sphere", 0.7, 22),
        m("cone", 0.7, 20),
        m("sphere", 0.9, 8),
        m("cone", 0.9, 7),
      ]),
    ).toBe(0.7);
  });

  it("returns null when nothing lands in the band", () => {
    expect(recommendQuantile([m("sphere", 0.6, 90), m("cone", 0.6, 91)])).toBeNull();
  });
});

describe("runSphereProbe", () => {
  it("measures every job and reports progress", async () => {
    const seen: number[] = [];
    const report = await runSphereProbe(SMALL, {
      views: ["sphere"],
      quantiles: [0.6, 0.7],
      sliceMs: 1,
      onProgress: (p) => seen.push(p.done),
    });
    expect(report.measurements).toHaveLength(2);
    expect(report.corpus).toBe("probe");
    expect(report.files).toBe(SMALL.files.length);
    /* First tick before any job, then one per completion. */
    expect(seen).toEqual([0, 1, 2]);
  });

  /* The 2 s rule: the run is announced, never cancelled. A user waiting on a
   * background job that silently takes six seconds has no way to tell it apart from
   * one that died. */
  it("flags a slow run past the notify threshold without stopping it", async () => {
    let clock = 0;
    const report = await runSphereProbe(SMALL, {
      views: ["sphere"],
      quantiles: [0.7],
      sliceMs: 1,
      now: () => (clock += NOTIFY_AFTER_MS),
      onProgress: () => {},
    });
    expect(report.slow).toBe(true);
    expect(report.measurements).toHaveLength(1);
  });

  it("does not flag a fast run", async () => {
    let clock = 0;
    const report = await runSphereProbe(SMALL, {
      views: ["sphere"],
      quantiles: [0.7],
      sliceMs: 1,
      now: () => (clock += 1),
    });
    expect(report.slow).toBe(false);
  });

  it("stops on abort and says the result is partial", async () => {
    const controller = new AbortController();
    const report = await runSphereProbe(SMALL, {
      views: ["sphere", "cone", "tree"],
      quantiles: [0.6, 0.7, 0.8],
      sliceMs: 1,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.done >= 1) controller.abort();
      },
    });
    expect(report.aborted).toBe(true);
    expect(report.recommended).toBeNull();
    expect(report.measurements.length).toBeLessThan(9);
  });
});

describe("formatSphereProbeReport", () => {
  it("names the reference it calibrated against", async () => {
    const report = await runSphereProbe(SMALL, {
      views: ["sphere"],
      quantiles: [0.7],
      sliceMs: 1,
    });
    const text = formatSphereProbeReport(report).join("\n");
    expect(text).toContain(`${CALIBRATION.overlappingPct}% overlapping`);
    expect(text).toContain(CALIBRATION.measured);
    expect(text).toContain("sphere");
  });

  it("states the corpus shape next to the numbers it produced", async () => {
    const report = await runSphereProbe(SMALL, {
      views: ["sphere"],
      quantiles: [0.7],
      sliceMs: 1,
    });
    const text = formatSphereProbeReport(report).join("\n");
    /* A degenerate sweep is usually the fixture, so the fixture is on the page. */
    expect(text).toContain("spread");
    expect(text).toContain("depth mean");
  });

  it("says so plainly when no notch qualified", () => {
    const text = formatSphereProbeReport({
      corpus: "x",
      files: 1,
      shape: describeCorpus([{ path: "a.ts", bytes: 1 }]),
      measurements: [],
      recommended: null,
      elapsedMs: 1,
      slow: false,
    }).join("\n");
    expect(text).toContain("no notch put every view inside the band");
  });
});
