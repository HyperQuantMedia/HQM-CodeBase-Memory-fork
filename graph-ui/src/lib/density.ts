/* Visual density compensation.
 *
 * The white-blob-at-scale failure is dominated by EDGES: they blend
 * additively and a 15k-node graph carries ~80k long lines crossing the
 * center, so their glow stacks into an opaque wash. Nodes are far fewer and
 * discrete — their bloom halos are the whole "wow", so we keep those bright.
 *
 * Strategy: dim edges hard (they cause the blob), keep nodes and bloom near
 * full so the bright stars still pop; only ease nodes/bloom back on genuinely
 * huge clouds where even discrete points overlap. Highlighted elements are
 * never scaled — a selection stays bright against the dimmed rest. */

/* Edge counts at/below this render exactly as before. */
export const EDGE_REFERENCE_COUNT = 2500;
const EDGE_MIN_SCALE = 0.05;

export function edgeIntensityScale(edgeCount: number): number {
  if (edgeCount <= EDGE_REFERENCE_COUNT) return 1;
  /* ~1/sqrt(n): 4× the edges → each ~half as bright → total glow ~flat. */
  return Math.max(EDGE_MIN_SCALE, Math.sqrt(EDGE_REFERENCE_COUNT / edgeCount));
}

/* Node glow and bloom stay at full strength up to here — this covers the
 * common "load the whole repo" case (tens of thousands of nodes) so the
 * bright-star look is preserved. */
export const NODE_REFERENCE_COUNT = 25000;
/* …then ease gently toward these floors as the cloud grows past the fade end,
 * where even discrete point sprites start to overlap and over-bloom. */
const NODE_FADE_END = 250000;
const BLOOM_FLOOR = 0.7;
const NODE_BOOST_FLOOR = 0.8;

function fadeFactor(nodeCount: number): number {
  if (nodeCount <= NODE_REFERENCE_COUNT) return 0;
  return Math.min(
    1,
    (nodeCount - NODE_REFERENCE_COUNT) / (NODE_FADE_END - NODE_REFERENCE_COUNT),
  );
}

export function bloomIntensityScale(nodeCount: number): number {
  return 1 - fadeFactor(nodeCount) * (1 - BLOOM_FLOOR);
}

/* Per-node glow boost: full up to the reference count, then a gentle,
 * high-floored fade so large clouds don't merge into mush while moderate
 * graphs keep their halos. */
export function nodeBoostScale(nodeCount: number): number {
  return 1 - fadeFactor(nodeCount) * (1 - NODE_BOOST_FLOOR);
}

/* Colour-aware glow multiplier applied to each node before bloom.
 *
 * Nodes are coloured as star classes by degree: blue giants (high-degree
 * hubs) → white/yellow (mid) → red dwarfs (leaves). Bloom is luminance-
 * thresholded, and blue has a tiny luminance weight, so a naive
 * brightness-based boost makes white/yellow blow out while blue and red stay
 * flat. Instead we boost by *channel dominance*: a blue-dominant node gets the
 * strongest boost (the important hubs shine brightest), a red-dominant node a
 * modest one, and white/yellow — which need no help to bloom — the least.
 *
 * r, g, b are 0..1 colour channels. Returns a multiplier ≥ 1. */
const GLOW_BASE = 1.35;
const GLOW_BLUE_GAIN = 2.4;
const GLOW_RED_GAIN = 0.9;

export function nodeGlowBoost(r: number, g: number, b: number): number {
  /* Blue that exceeds both red and green → cool hub. Red that exceeds both
   * green and blue → warm leaf (green cutoff keeps yellow/orange out of the
   * red term so they are not boosted). */
  const blueness = Math.max(0, b - Math.max(r, g));
  const redness = Math.max(0, r - Math.max(g, b));
  return GLOW_BASE + blueness * GLOW_BLUE_GAIN + redness * GLOW_RED_GAIN;
}

/* ── Curved-link cost ─────────────────────────────────────────── */

/* Curving an edge multiplies its vertex count by the subdivision level, so past
 * this many edges the bow is dropped rather than quietly costing 3M vertices. */
export const EDGE_CURVE_MAX_EDGES = 60000;

/* Subdivisions per curved edge — enough that a bow reads as a curve, few enough
 * that a 60k-edge graph stays under a million vertices. */
export function edgeCurveSegments(edgeCount: number): number {
  if (edgeCount > EDGE_CURVE_MAX_EDGES) return 1;
  if (edgeCount > 20000) return 5;
  return 9;
}

/* The user-facing multipliers that ride on top of these scales live in
 * lib/appearance.ts, stored per theme — the dark and light stages are different
 * rendering models, so one shared set of knobs cannot serve both. */
