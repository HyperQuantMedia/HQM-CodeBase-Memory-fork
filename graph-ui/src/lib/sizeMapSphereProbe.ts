/* Size-map sphere-size probe.
 *
 * Answers the one question a screenshot cannot: at a given density dial, do the
 * spheres in the size map read as separate spheres? A size map whose radii encode
 * bytes is only honest if a neighbour does not bury half of one — that half-hidden
 * sphere misstates its own file's byte count, which is the single thing the view
 * exists to say.
 *
 * Three things make this file different from the throwaway rig it replaces
 * (`scratchpad/size-graph-probe/`):
 *
 * 1. **It brings its own corpus.** The rig loads 25 MB of `/api/file-sizes` JSON
 *    that exists on exactly one machine, so its numbers can never be re-checked. The
 *    corpus here is generated from a fixed seed, so any machine reproduces any
 *    figure this file ever printed. The real corpora stay available as an override —
 *    synthetic data calibrates, it does not replace the territory.
 * 2. **It measures the real layout.** `applyViewMode` takes the quantile as an
 *    argument, so a sweep drives the shipped code path. Re-deriving the scale factor
 *    from an already-fitted scene cannot be done faithfully — the fit clamps at 1 and
 *    never shrinks, so what a lower quantile would have done is not recoverable.
 * 3. **It yields.** The measurement is O(samples × nodes) per (view, quantile) pair
 *    and there are a dozen pairs, so run flat-out it janks a browser tab for seconds.
 *    Every stage is a resumable sub-job with a time slice, so the same code serves a
 *    Node run (take the whole budget) and a delegated worker run (hand the thread
 *    back constantly).
 *
 * Calibration is against the artifact already approved, never against an ideal —
 * see CALIBRATION below. That rule is the reason this file exists at all: an invented
 * "no spheres overlap" target was hit exactly, and produced a near-empty starfield.
 *
 * No React, no WebGL, no filesystem, no network — so it is unit-testable, and the
 * same module is safe to import inside a worker. */

import type { GraphEdge, GraphNode } from "./types";
import { buildSizeTree, type FileSize } from "./sizeMap";
import { drawnRadius, sizeTreeToGraph } from "./sizeGraph";
import {
  applyViewMode,
  DEFAULT_LAYOUT_PARAMS,
  RADII_FIT_QUANTILE,
  type LayoutParams,
  type ViewMode,
} from "./viewLayout";

/* ── The calibration target ────────────────────────────────────── */

/* The relationship graph's server force layout, measured over the 47k-node corpus
 * on 2026-07-30. It is the only reference that counts, because it is the scene the
 * owner has looked at and signed off: spheres interpenetrate constantly there and it
 * reads fine, because the corona rendering turns a dense cloud into a legible one.
 *
 * A size map wants to be *less* dense than this — a buried sphere lies about its
 * bytes — so the target is a band below the reference, not the reference itself. */
export const CALIBRATION = {
  /** Percent of sampled nodes intersecting a neighbour, in the approved graph. */
  overlappingPct: 57,
  /** Median clearance there, in median radii. Negative: typical pair overlaps. */
  clearanceInRadii: -0.32,
  /** Upper bound for a size view: denser than this and bytes stop being readable. */
  maxOverlappingPct: 25,
  /** Lower bound: sparser than this and the scene is the empty starfield again. */
  minOverlappingPct: 5,
  measured: "2026-07-30, approved relationship graph, 47k nodes",
} as const;

/* Past this, a delegated run stops being something the user can be left to
 * discover. The run is not cancelled — it is announced. */
export const NOTIFY_AFTER_MS = 2000;

/* Default slice a sub-job may hold the thread for. One 60 Hz frame is 16.7 ms;
 * half of that leaves the host room to render between slices. */
export const DEFAULT_SLICE_MS = 8;

/* The dial notches worth measuring. 0.70 is the shipped value and is always
 * included, so every sweep carries its own control. */
export const SWEEP_QUANTILES = [
  0.55, 0.6, 0.65, RADII_FIT_QUANTILE, 0.75, 0.8, 0.85, 0.9, 0.98,
] as const;

export const PROBE_VIEWS: Exclude<ViewMode, "default">[] = [
  "sphere",
  "cone",
  "tree",
];

/* ── Synthetic corpus ──────────────────────────────────────────── */

/* mulberry32. Chosen for being four lines and exactly reproducible across engines —
 * a probe whose fixture drifts with the JS runtime measures nothing. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticCorpusOptions {
  /** Fixed seed. Same seed, same corpus, on any machine, forever. */
  seed?: number;
  /** Files to emit. Default matches the 47k-node reference corpus. */
  fileCount?: number;
  /** Directories per file. Real trees measured 0.12 (26k files) to 0.23 (864). */
  dirRatio?: number;
  /** Mean nesting depth of a file. Real: 9.97 on the 26k tree. */
  meanDepth?: number;
  /** Deepest *directory* level. A file adds one segment, so 16 ⇒ paths of 17. */
  maxDepth?: number;
}

/* Byte-size mixture, calibrated against the two real corpora.
 *
 * One log-normal cannot do this. A real tree is not a distribution, it is four:
 * source files clustered around a couple of KB, ordinary assets three orders up,
 * build output and media three orders above *that*, and a handful of archives that
 * alone decide the scene's scale. Measured on the 26k-file tree: median 2,157 bytes,
 * p90 622 KB, p99 5.5 MB, p999 113 MB, max 2.6 GB — a max/median ratio of 1.2
 * million. A single log-normal wide enough to reach that has no median left.
 *
 * The first version of this fixture used one narrow log-normal with a small
 * multiplier tail, giving max/median ≈ 4,000. It swept *degenerately*: identical
 * numbers at every notch in `tree`, and a discontinuous jump in `sphere`. The real
 * corpus swept smoothly at the same node count, which is what identified the fixture
 * rather than the layout as the fault. Weights below are per-file probabilities. */
const SIZE_MIXTURE = [
  /* Source and text. The bulk of any tree, and the median. */
  { weight: 0.88, logMedian: Math.log(1_800), sigma: 1.2 },
  /* Ordinary assets: images, small data, lockfiles. Weight is set by the real p90,
   * not by intuition — 12% of a real tree is this class or heavier, and an earlier
   * 6% put the p90 down in the source tail at 28 KB against a measured 622 KB. */
  { weight: 0.11, logMedian: Math.log(1_200_000), sigma: 1.1 },
  /* Build output, media, vendored blobs. */
  { weight: 0.006, logMedian: Math.log(25_000_000), sigma: 1.0 },
  /* Archives and models. Rare, and they set the whole layout's scale. */
  { weight: 0.004, logMedian: Math.log(300_000_000), sigma: 0.8 },
] as const;

/* A file tree with a realistic byte distribution and a realistic shape.
 *
 * Both halves matter, and the second is easy to miss. The size graph caps at 8,000
 * nodes and emits heaviest-first, so a corpus with too many directories fills that
 * budget with fixed-radius folder nodes and stops measuring byte-driven radii at all
 * — the measurement then reports on a scene of near-uniform spheres, which is not the
 * scene the dial exists for. Depth and directory ratio are therefore calibrated
 * against the real trees too, not just the byte spread. */
export function syntheticSizeCorpus(
  options: SyntheticCorpusOptions = {},
): FileSize[] {
  const {
    seed = 0x5121,
    fileCount = 47_000,
    dirRatio = 0.12,
    meanDepth = 9,
    maxDepth = 16,
  } = options;
  const rand = mulberry32(seed);

  /* Box-Muller. Cached second deviate would be pointless here — the caller wants
   * reproducibility, not speed, and one draw per call keeps the stream simple. */
  const normal = () => {
    const u = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const KINDS = [
    ".ts", ".tsx", ".c", ".h", ".md", ".json", ".png", ".zip", ".pdf", ".csv",
  ];

  /* Directories as chains, not as a breadth-first fan.
   *
   * A fan of 1–6 per level to depth 7 gave a bushy, shallow tree — mean file depth
   * ~4 against a real 10. Growing each new directory from a randomly chosen existing
   * one produces the long thin runs real repositories have (`src/parser/internal/…`)
   * and reaches the measured depth without a special case. */
  const dirCount = Math.max(1, Math.round(fileCount * dirRatio));
  /* Directories bucketed by depth, so a file can be placed *at* a chosen depth
   * rather than at whatever depth a random directory happens to sit. Index 0 holds
   * the root, so `atDepth[d]` is every directory whose path has `d` segments. */
  const atDepth: string[][] = [[""]];
  let made = 0;
  for (let attempt = 0; made < dirCount && attempt < dirCount * 4; attempt++) {
    /* Grow from a directory one level up from a target depth, biased toward the
     * middle of the tree: chains extend the way real trees deepen, instead of the
     * root fanning out forever. */
    const want = 1 + Math.floor(Math.abs(normal()) * (maxDepth / 3));
    const parentDepth = Math.min(atDepth.length - 1, Math.max(0, want - 1));
    const siblings = atDepth[parentDepth];
    const parent = siblings[Math.floor(rand() * siblings.length)];
    const depth = parentDepth + 1;
    if (depth > maxDepth) continue;
    const path = parent === "" ? `d${made}` : `${parent}/d${made}`;
    if (!atDepth[depth]) atDepth[depth] = [];
    atDepth[depth].push(path);
    made++;
  }

  const files: FileSize[] = [];
  for (let i = 0; i < fileCount; i++) {
    /* A file's depth is drawn around `meanDepth` and clamped to what the tree has,
     * which is the direct way to hit a measured mean — biasing a flat directory list
     * toward "deep" is not, as the first version of this fixture demonstrated by
     * landing every file at depth 17. */
    const drawn = Math.round(meanDepth + normal() * 2.5);
    let depth = Math.min(maxDepth, Math.max(1, drawn));
    while (depth > 0 && !atDepth[depth]?.length) depth--;
    const bucket = atDepth[depth] ?? atDepth[0];
    const dir = bucket[Math.floor(rand() * bucket.length)];
    const kind = KINDS[Math.floor(rand() * KINDS.length)];
    const name = `f${i}${kind}`;

    let roll = rand();
    let component = SIZE_MIXTURE[SIZE_MIXTURE.length - 1];
    for (const candidate of SIZE_MIXTURE) {
      if (roll < candidate.weight) {
        component = candidate;
        break;
      }
      roll -= candidate.weight;
    }
    const bytes = Math.max(
      1,
      Math.round(Math.exp(component.logMedian + normal() * component.sigma)),
    );

    files.push({ path: dir === "" ? name : `${dir}/${name}`, bytes });
  }
  return files;
}

/* ── Corpus shape ──────────────────────────────────────────────── */

/* What the fixture actually is, measured rather than asserted.
 *
 * Reported alongside every sweep because the degenerate first run was a *fixture*
 * fault that looked exactly like a layout fault. A report that states its corpus's
 * spread and depth next to its numbers makes that visible in one read instead of one
 * afternoon. */
export interface CorpusShape {
  files: number;
  dirs: number;
  dirsPerFile: number;
  meanDepth: number;
  maxDepth: number;
  bytesP50: number;
  bytesP90: number;
  bytesP99: number;
  bytesMax: number;
  /** max/median. The one number that says whether the dial has anything to do. */
  spread: number;
}

export function describeCorpus(files: FileSize[]): CorpusShape {
  const dirs = new Set<string>();
  let depthSum = 0;
  let maxDepth = 0;
  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    depthSum += parts.length;
    if (parts.length > maxDepth) maxDepth = parts.length;
    for (let i = 0; i < parts.length - 1; i++) {
      dirs.add(parts.slice(0, i + 1).join("/"));
    }
  }
  const bytes = files
    .map((f) => f.bytes)
    .filter((b) => b > 0)
    .sort((a, b) => a - b);
  const p50 = quantileOf(bytes, 0.5) || 1;
  return {
    files: files.length,
    dirs: dirs.size,
    dirsPerFile: files.length === 0 ? 0 : dirs.size / files.length,
    meanDepth: files.length === 0 ? 0 : depthSum / files.length,
    maxDepth,
    bytesP50: p50,
    bytesP90: quantileOf(bytes, 0.9),
    bytesP99: quantileOf(bytes, 0.99),
    bytesMax: bytes.length === 0 ? 0 : bytes[bytes.length - 1],
    spread: bytes.length === 0 ? 0 : bytes[bytes.length - 1] / p50,
  };
}

/* ── Measurement ───────────────────────────────────────────────── */

export interface SphereProbeJob {
  view: Exclude<ViewMode, "default">;
  quantile: number;
}

export interface SphereProbeMeasurement extends SphereProbeJob {
  /** Nodes actually placed — the size graph caps by weight. */
  nodes: number;
  /** Sampled nodes whose nearest neighbour intersects them, as a percent. */
  overlappingPct: number;
  /** Median clearance in median radii. Negative: the typical pair overlaps. */
  clearanceInRadii: number;
  /** Worst clearance seen, in world units. */
  minClearance: number;
  /** Distance from the origin to the furthest node — the scene's framing job. */
  extent: number;
  /** True when this notch sits inside the calibration band. */
  withinBand: boolean;
}

export interface SphereProbeInput {
  /** Corpus name, used as the size tree's root label. */
  name: string;
  files: FileSize[];
  /** Nodes sampled for the nearest-neighbour distribution. */
  samples?: number;
  /** Node cap handed to the size graph. Defaults to the view's own. */
  maxNodes?: number;
  params?: LayoutParams;
}

/* Sub-job state. A measurement is O(samples × nodes), which at 400 × 8000 is 3.2M
 * distance evaluations per notch — comfortably past a frame on its own, so the
 * sample cursor has to survive being put down and picked up. */
export interface SphereProbeJobState {
  job: SphereProbeJob;
  placed: GraphNode[];
  radii: Float64Array;
  medianRadius: number;
  /** Strided sample indices into `placed`. */
  sampleAt: Int32Array;
  cursor: number;
  clearances: number[];
  extent: number;
  done: boolean;
}

function medianOf(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
}

function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/* Lay the corpus out once per job, at that job's quantile, through the real
 * `applyViewMode`. The layout itself is not chunked: it is a single pass over the
 * hierarchy and returns in tens of milliseconds even at 8k nodes, while the
 * nearest-neighbour sweep after it is the part that costs seconds. */
export function beginSphereProbeJob(
  input: SphereProbeInput,
  job: SphereProbeJob,
): SphereProbeJobState {
  const tree = buildSizeTree(input.files, input.name);
  const graph = sizeTreeToGraph(
    tree,
    input.maxNodes === undefined ? {} : { maxNodes: input.maxNodes },
  );
  const placed = applyViewMode(
    graph.nodes.map((n) => ({ ...n })),
    graph.edges,
    job.view,
    input.params ?? DEFAULT_LAYOUT_PARAMS,
    undefined,
    drawnRadius,
    job.quantile,
  );

  const radii = new Float64Array(placed.length);
  let extent = 0;
  for (let i = 0; i < placed.length; i++) {
    radii[i] = drawnRadius(placed[i]);
    const d = Math.hypot(placed[i].x, placed[i].y, placed[i].z);
    if (d > extent) extent = d;
  }

  const samples = Math.max(1, input.samples ?? 400);
  const step = Math.max(1, Math.floor(placed.length / samples));
  const sampleAt = new Int32Array(Math.ceil(placed.length / step));
  for (let i = 0, k = 0; i < placed.length; i += step, k++) sampleAt[k] = i;

  return {
    job,
    placed,
    radii,
    medianRadius: medianOf(radii) || 1,
    sampleAt,
    cursor: 0,
    clearances: [],
    extent,
    done: placed.length < 2,
  };
}

/* Advance one sub-job for at most `sliceMs`, then hand the thread back.
 *
 * The clock is read every 32 samples rather than every sample: `performance.now()`
 * is not free, and at 8k nodes an inner pass is ~8k distance evaluations, so 32 of
 * them is well inside one slice. Returns true when the job is finished. */
export function stepSphereProbeJob(
  state: SphereProbeJobState,
  sliceMs: number = DEFAULT_SLICE_MS,
  now: () => number = defaultNow,
): boolean {
  if (state.done) return true;
  const { placed, radii, sampleAt } = state;
  const deadline = now() + sliceMs;

  while (state.cursor < sampleAt.length) {
    const i = sampleAt[state.cursor];
    const p = placed[i];
    const pr = radii[i];
    let best = Infinity;
    for (let j = 0; j < placed.length; j++) {
      if (j === i) continue;
      const q = placed[j];
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) - pr - radii[j];
      if (d < best) best = d;
    }
    if (best < Infinity) state.clearances.push(best);
    state.cursor++;
    if ((state.cursor & 31) === 0 && now() >= deadline) return false;
  }

  state.done = true;
  return true;
}

export function finishSphereProbeJob(
  state: SphereProbeJobState,
): SphereProbeMeasurement {
  const sorted = [...state.clearances].sort((a, b) => a - b);
  const overlapping = sorted.filter((c) => c < 0).length;
  const overlappingPct =
    sorted.length === 0 ? 0 : (100 * overlapping) / sorted.length;
  return {
    ...state.job,
    nodes: state.placed.length,
    overlappingPct,
    clearanceInRadii: quantileOf(sorted, 0.5) / state.medianRadius,
    minClearance: sorted.length === 0 ? 0 : sorted[0],
    extent: state.extent,
    withinBand:
      overlappingPct >= CALIBRATION.minOverlappingPct &&
      overlappingPct <= CALIBRATION.maxOverlappingPct,
  };
}

/* ── The sweep ─────────────────────────────────────────────────── */

export function sphereProbeJobs(
  views: Exclude<ViewMode, "default">[] = PROBE_VIEWS,
  quantiles: readonly number[] = SWEEP_QUANTILES,
): SphereProbeJob[] {
  const out: SphereProbeJob[] = [];
  for (const view of views) for (const quantile of quantiles) out.push({ view, quantile });
  return out;
}

export interface SphereProbeProgress {
  /** Jobs finished, out of `total`. */
  done: number;
  total: number;
  elapsedMs: number;
  /** The measurement just completed, absent on the first tick. */
  last?: SphereProbeMeasurement;
  /** True once the run has passed NOTIFY_AFTER_MS — say so, do not cancel. */
  slow: boolean;
}

export interface SphereProbeReport {
  corpus: string;
  files: number;
  /** What the corpus itself looks like — spread and depth, measured. */
  shape: CorpusShape;
  measurements: SphereProbeMeasurement[];
  /** The notch to ship, or null when no notch landed inside the band. */
  recommended: number | null;
  elapsedMs: number;
  /** True when the run exceeded NOTIFY_AFTER_MS. */
  slow: boolean;
  /** Set when the caller aborted; `measurements` is then partial. */
  aborted?: boolean;
}

/* Pick the notch whose *worst* view still reads, then break ties toward density.
 *
 * Worst view rather than mean: the dial is one control shared by three projections
 * (the parity ruling), so a value that only works in `sphere` is not a value. Ties
 * break toward the denser end because the failure the owner actually overturned was
 * an empty scene, not a crowded one. */
export function recommendQuantile(
  measurements: SphereProbeMeasurement[],
): number | null {
  const byQuantile = new Map<number, SphereProbeMeasurement[]>();
  for (const m of measurements) {
    const list = byQuantile.get(m.quantile);
    if (list) list.push(m);
    else byQuantile.set(m.quantile, [m]);
  }

  let best: { quantile: number; worst: number } | null = null;
  for (const [quantile, list] of byQuantile) {
    if (!list.every((m) => m.withinBand)) continue;
    /* Worst = the most crowded view at this notch. */
    const worst = Math.max(...list.map((m) => m.overlappingPct));
    if (best === null || worst > best.worst) best = { quantile, worst };
  }
  return best?.quantile ?? null;
}

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}

/* Hand the thread back between slices.
 *
 * `scheduler.postTask` at user-blocking priority where it exists: this is work the
 * user is waiting on, and a plain `setTimeout(0)` is clamped and sits behind
 * lower-priority tasks, which is how a two-second job becomes a ten-second one. Node
 * has neither, so it falls through to a macrotask. */
type PostTask = (
  callback: () => void,
  options?: { priority?: string; signal?: AbortSignal },
) => Promise<unknown>;

function yieldToHost(signal?: AbortSignal): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { postTask?: PostTask } }).scheduler;
  if (scheduler?.postTask) {
    return scheduler
      .postTask(() => {}, { priority: "user-blocking" })
      .then(() => undefined, () => undefined);
  }
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    setTimeout(resolve, 0);
  });
}

export interface RunSphereProbeOptions {
  views?: Exclude<ViewMode, "default">[];
  quantiles?: readonly number[];
  /** Thread-hold budget per slice. Node runs want this large, a tab wants it small. */
  sliceMs?: number;
  onProgress?: (progress: SphereProbeProgress) => void;
  signal?: AbortSignal;
  now?: () => number;
}

/* Drive the whole sweep, yielding between slices.
 *
 * Async even though the arithmetic is synchronous, because the yielding is the
 * feature: the same call is a background job in a worker and a straight-line run in
 * a test, and only the slice size differs. */
export async function runSphereProbe(
  input: SphereProbeInput,
  options: RunSphereProbeOptions = {},
): Promise<SphereProbeReport> {
  const {
    views,
    quantiles,
    sliceMs = DEFAULT_SLICE_MS,
    onProgress,
    signal,
    now = defaultNow,
  } = options;

  const jobs = sphereProbeJobs(views, quantiles);
  const started = now();
  const measurements: SphereProbeMeasurement[] = [];
  let notified = false;

  const elapsed = () => now() - started;
  const report = (last?: SphereProbeMeasurement) => {
    const slow = elapsed() > NOTIFY_AFTER_MS;
    if (slow) notified = true;
    onProgress?.({
      done: measurements.length,
      total: jobs.length,
      elapsedMs: elapsed(),
      last,
      slow,
    });
  };

  report();
  for (const job of jobs) {
    if (signal?.aborted) break;
    const state = beginSphereProbeJob(input, job);
    while (!stepSphereProbeJob(state, sliceMs, now)) {
      if (signal?.aborted) break;
      await yieldToHost(signal);
    }
    if (signal?.aborted) break;
    measurements.push(finishSphereProbeJob(state));
    report(measurements[measurements.length - 1]);
    await yieldToHost(signal);
  }

  const aborted = signal?.aborted === true;
  return {
    corpus: input.name,
    files: input.files.length,
    shape: describeCorpus(input.files),
    measurements,
    recommended: aborted ? null : recommendQuantile(measurements),
    elapsedMs: elapsed(),
    slow: notified || elapsed() > NOTIFY_AFTER_MS,
    ...(aborted ? { aborted } : {}),
  };
}

/* ── Report ────────────────────────────────────────────────────── */

/* Fixed-width lines, because the whole point is comparing notches down a column.
 * Returned rather than logged: vitest 4 swallows `console.log` under `run`, and a
 * worker has no console the user reads. */
export function formatSphereProbeReport(report: SphereProbeReport): string[] {
  const s = report.shape;
  const lines: string[] = [
    `[${report.corpus}] ${report.files} files · ${report.measurements.length} measurements · ${report.elapsedMs.toFixed(0)} ms${report.slow ? " (slow)" : ""}`,
    `reference: approved relationship graph at ${CALIBRATION.overlappingPct}% overlapping, ` +
      `${CALIBRATION.clearanceInRadii}x median r — measured ${CALIBRATION.measured}`,
    `band: ${CALIBRATION.minOverlappingPct}%–${CALIBRATION.maxOverlappingPct}% overlapping`,
    /* The corpus's own shape, next to the numbers it produced. A degenerate sweep is
     * usually the fixture, and this is the line that says so. */
    `corpus: ${s.dirs} dirs (${s.dirsPerFile.toFixed(3)}/file) · depth mean ${s.meanDepth.toFixed(2)} max ${s.maxDepth} · ` +
      `bytes p50 ${s.bytesP50} p90 ${s.bytesP90} p99 ${s.bytesP99} max ${s.bytesMax} · spread ${Math.round(s.spread)}x`,
    "",
    "view     quantile  nodes  overlapping  clearance/r      min   extent  band",
  ];
  for (const m of report.measurements) {
    lines.push(
      `${m.view.padEnd(8)} ${m.quantile.toFixed(2).padStart(8)} ` +
        `${String(m.nodes).padStart(6)} ${`${m.overlappingPct.toFixed(1)}%`.padStart(12)} ` +
        `${m.clearanceInRadii.toFixed(2).padStart(12)} ${m.minClearance.toFixed(1).padStart(8)} ` +
        `${m.extent.toFixed(0).padStart(8)}  ${m.withinBand ? "yes" : "no"}`,
    );
  }
  lines.push("");
  lines.push(
    report.recommended === null
      ? `no notch put every view inside the band — widen the sweep or the band, and say which`
      : `recommended quantile: ${report.recommended.toFixed(2)} (shipped: ${RADII_FIT_QUANTILE.toFixed(2)})`,
  );
  return lines;
}

/* Re-exported so a caller measuring the *real* corpora feeds the same shape the
 * synthetic path produces. `/api/file-sizes` already returns `{ files: FileSize[] }`. */
export type { FileSize, GraphEdge, GraphNode };
