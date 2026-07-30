/* Alternate graph layouts, computed client-side.
 *
 * The backend (layout3d.c) ships one force-directed 3D position per node and
 * that stays the default. These are additional *views* of the same graph,
 * derived purely from its hierarchy — a port of the four projections the Astra
 * static map uses (HQM-Astra/src/tools/astra-map.js): radial, tidy tree,
 * sphere, cone. Nothing here touches or replaces the server layout; `"default"`
 * is a passthrough.
 *
 * One hierarchy derivation feeds four consumers: the three alt layouts, the
 * breadcrumb, and the path-to-root the comet animates along. */

import type { GraphEdge, GraphNode } from "./types";

export type ViewMode = "default" | "sphere" | "cone" | "tree";

export const VIEW_MODES: ViewMode[] = ["default", "sphere", "cone", "tree"];

export const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  default: "Web (server force)",
  sphere: "Nested spheres",
  cone: "Nested cones",
  tree: "Organic tree",
};

/* Toolbar-width labels for the cycle button. */
export const VIEW_MODE_SHORT: Record<ViewMode, string> = {
  default: "Web",
  sphere: "Sphere",
  cone: "Cone",
  tree: "Tree",
};

/* Edge types that mean "source structurally contains target", lowest number
 * winning when a node is claimed twice. The indexer builds a code hierarchy in
 * two vocabularies — folders and files nest with CONTAINS_*, but a file holds
 * its symbols with DEFINES / DEFINES_METHOD — so both belong here. Omitting the
 * DEFINES pair strands every function and method at the root, which flattens
 * all three projections and truncates the breadcrumb to a single level.
 *
 * Priority (rather than first-edge-wins) keeps the tree identical regardless of
 * the order edges arrive in. MEMBER_OF is deliberately absent: it points from
 * member to container, and treating a reversed edge as containment would invert
 * that branch of the tree. */
const CONTAINMENT_PRIORITY: Record<string, number> = {
  CONTAINS_PACKAGE: 0,
  CONTAINS_FOLDER: 1,
  CONTAINS_FILE: 2,
  DEFINES: 3,
  DEFINES_METHOD: 4,
};

/* ── Hierarchy ─────────────────────────────────────────────────── */

/* A position in the tree. `ids` are the real graph nodes sitting here — usually
 * one, but a path-derived slot can hold several (two nodes in the same file) and
 * a pure directory slot holds none. */
interface Slot {
  key: string;
  ids: number[];
  children: Slot[];
  leaves: number;
  depth: number;
  angle: number;
  row: number;
  parent: Slot | null;
  /* Position among its siblings, used to spread a sibling group across its
   * depth band instead of stacking every one of them on the same circle. */
  sibIndex: number;
  sibCount: number;
}

export interface Hierarchy {
  /** Synthetic root; never rendered itself. */
  root: Slot;
  /** Real node id → its slot. */
  slotOf: Map<number, Slot>;
  maxDepth: number;
  /** Leaf slots, i.e. how many rows the tidy tree needs. */
  leafCount: number;
  /** True when the tree came from containment edges rather than path strings. */
  fromEdges: boolean;
}

function makeSlot(key: string, parent: Slot | null): Slot {
  return {
    key,
    ids: [],
    children: [],
    leaves: 0,
    depth: parent ? parent.depth + 1 : 0,
    angle: 0,
    row: 0,
    parent,
    sibIndex: 0,
    sibCount: 1,
  };
}

/* Children sort: containers before leaves, then by name — the tidy-tree
 * convention the static map uses (sortIds), so re-runs are stable. */
function sortChildren(slot: Slot) {
  slot.children.sort((a, b) => {
    const ac = a.children.length > 0;
    const bc = b.children.length > 0;
    if (ac !== bc) return ac ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  for (const c of slot.children) sortChildren(c);
}

function countLeaves(slot: Slot): number {
  if (slot.children.length === 0) {
    slot.leaves = 1;
    return 1;
  }
  let sum = 0;
  for (const c of slot.children) sum += countLeaves(c);
  slot.leaves = sum;
  return sum;
}

/* Tree from containment edges: parent = edge source, child = edge target.
 * Returns null when the graph carries no containment edges at all. */
function buildFromEdges(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Hierarchy | null {
  const present = new Set(nodes.map((n) => n.id));
  const parentOf = new Map<number, number>();
  const parentRank = new Map<number, number>();
  let any = false;
  for (const e of edges) {
    const rank = CONTAINMENT_PRIORITY[e.type];
    if (rank === undefined) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    any = true;
    /* A node claimed twice keeps one position: the strongest containment. */
    const held = parentRank.get(e.target);
    if (held === undefined || rank < held) {
      parentOf.set(e.target, e.source);
      parentRank.set(e.target, rank);
    }
  }
  if (!any) return null;

  const root = makeSlot("", null);
  const slotOf = new Map<number, Slot>();
  const byId = new Map<number, GraphNode>();
  for (const n of nodes) byId.set(n.id, n);

  /* Depth-first from each root node (no parent), guarding against cycles. */
  const childrenOf = new Map<number, number[]>();
  for (const [child, parent] of parentOf) {
    const list = childrenOf.get(parent);
    if (list) list.push(child);
    else childrenOf.set(parent, [child]);
  }

  const visited = new Set<number>();
  const attach = (id: number, parentSlot: Slot) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = byId.get(id);
    const slot = makeSlot(node?.name ?? String(id), parentSlot);
    slot.ids.push(id);
    slotOf.set(id, slot);
    parentSlot.children.push(slot);
    for (const kid of childrenOf.get(id) ?? []) attach(kid, slot);
  };

  for (const n of nodes) {
    if (!parentOf.has(n.id)) attach(n.id, root);
  }
  /* Anything left over sat inside a cycle — hang it off the root so it still
   * gets a position rather than collapsing onto the origin. */
  for (const n of nodes) {
    if (!visited.has(n.id)) attach(n.id, root);
  }

  sortChildren(root);
  countLeaves(root);
  return { root, slotOf, maxDepth: 0, leafCount: 1, fromEdges: true };
}

/* Tree from file_path strings — the fallback for graphs with no containment
 * edges (an overlay-only corpus: Documents, Externals, Missing). Directory
 * segments become slots that hold no node of their own but shape the angles,
 * the same way real folder nodes do in the static map. */
function buildFromPaths(nodes: GraphNode[]): Hierarchy {
  const root = makeSlot("", null);
  const slotOf = new Map<number, Slot>();
  const byKey = new Map<string, Slot>();
  byKey.set("", root);

  const slotForPath = (segments: string[]): Slot => {
    let cur = root;
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      let next = byKey.get(acc);
      if (!next) {
        next = makeSlot(seg, cur);
        byKey.set(acc, next);
        cur.children.push(next);
      }
      cur = next;
    }
    return cur;
  };

  /* Deterministic order in, deterministic tree out. */
  const ordered = [...nodes].sort((a, b) => {
    const pa = a.file_path ?? "";
    const pb = b.file_path ?? "";
    return pa === pb ? a.name.localeCompare(b.name) : pa.localeCompare(pb);
  });

  for (const n of ordered) {
    const path = (n.file_path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = path ? path.split("/").filter(Boolean) : [];
    /* No path at all → a direct child of the root, keyed by its own name so
     * pathless nodes (an External URL node, say) still spread out. */
    const slot = segments.length
      ? slotForPath(segments)
      : slotForPath([n.name || String(n.id)]);
    slot.ids.push(n.id);
    slotOf.set(n.id, slot);
  }

  sortChildren(root);
  countLeaves(root);
  return { root, slotOf, maxDepth: 0, leafCount: 1, fromEdges: false };
}

/* Angle partition, ported from astra-map.js placeNode(): each slot owns an
 * angular wedge sized by its leaf count, and sits at the wedge's midpoint.
 * Also stamps tidy-tree leaf rows (treePlace) in the same walk. */
function assign(h: Hierarchy) {
  let maxDepth = 0;
  let rowCursor = 0;

  const walk = (slot: Slot, a0: number, a1: number) => {
    slot.angle = (a0 + a1) / 2;
    if (slot.depth > maxDepth) maxDepth = slot.depth;

    if (slot.children.length === 0) {
      slot.row = rowCursor++;
      return;
    }
    let a = a0;
    const span = a1 - a0;
    for (let i = 0; i < slot.children.length; i++) {
      const c = slot.children[i];
      c.sibIndex = i;
      c.sibCount = slot.children.length;
      const frac = slot.leaves > 0 ? c.leaves / slot.leaves : 0;
      walk(c, a, a + span * frac);
      a += span * frac;
    }
    /* A container sits at the midpoint of its children's rows — the tidy-tree
     * property that keeps parents visually centred over their subtree. */
    const first = slot.children[0];
    const last = slot.children[slot.children.length - 1];
    slot.row = (first.row + last.row) / 2;
  };

  /* Start at -PI/2 so depth-1 children fan out from straight up, matching the
   * static map's orientation. */
  walk(h.root, -Math.PI / 2, Math.PI * 1.5);
  h.maxDepth = maxDepth;
  h.leafCount = Math.max(1, rowCursor);
}

export function deriveHierarchy(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Hierarchy {
  const h = buildFromEdges(nodes, edges) ?? buildFromPaths(nodes);
  assign(h);
  return h;
}

/* ── Projections ───────────────────────────────────────────────── */

/* All three alternate views are *nested*: a slot's children form a cluster
 * around the slot itself, and each of those children forms its own cluster in
 * turn. The first implementation projected a flat (angle, depth) pair onto a
 * single global shell, which is why they read as wireframe hoops rather than
 * structure — 47k nodes across 8 depth levels put ~5.9k of them on one circle.
 *
 * Sizing is bottom-up and spacing-driven, and that is the load-bearing change.
 * The previous pass matched the server layout's outer *extent*, which looked
 * right on paper (aspect ratios 1.0–1.5:1) and was still unusable: a force
 * layout distributes nodes through its whole volume, whereas a projection piles
 * them onto shells and rings, so equal outer radius means a 3–90× denser
 * interior. Measured on a 47k-node corpus, median nearest-neighbour spacing came
 * out at 1.63 (sphere), 0.73 (cone) and 0.05 (tree) world units against the
 * server's 4.80 — and node spheres are 2–4 units in radius, so every node sat
 * buried inside its neighbours.
 *
 * So each slot computes an `outer` radius from its children's, guaranteeing that
 * no two sibling clusters can overlap, and the whole layout is built from a
 * target spacing rather than squeezed into a target box. The extent falls out of
 * that, and the camera reframes to whatever it turns out to be. */

type Vec3 = [number, number, number];

/* Golden angle — the phyllotaxis constant every distribution here uses, so
 * sibling groups spread evenly for any count without a special case. */
const PHI_ANGLE = 2.399963229728653;

/* Nearest-neighbour spacing of N points spread evenly over a sphere, as a
 * fraction of its radius. Each point owns 4π/N of surface; hexagonal packing
 * turns that into d = sqrt(8π/(N·√3)) ≈ 3.81/√N. */
const SPHERE_SPACING_K = 3.81;

/* Radius reserved for a single node, in units of the target spacing. */
const LEAF_RADIUS_K = 0.78;

/* Fraction of a parent's volume its children's balls may claim.
 *
 * Sphere packing tops out near 0.64 even when the spheres are free to arrange
 * themselves; here they are pinned to a Fibonacci lattice in an annulus, so the
 * usable share is lower. This is the term that sets the whole layout's scale, and
 * it is the one the measurements moved: a flat per-node volume budget ignored
 * that a parent must hold its children's *balls*, not merely their leaves, and
 * came out ~4× too dense (spacing 1.21 against a 4.63 target — every node inside
 * its neighbour again, just at a tidier aspect ratio). */
const PACKING = 0.5;

/* Inner edge of the annulus children occupy, as a fraction of the available
 * radius. Children are volume-distributed through the outer part of the ball
 * rather than pinned to its surface: a pure shell reads as a hollow hoop (which
 * is what the first version rendered as) and wastes the interior, while a solid
 * fill buries every cluster inside its parent. */
const ANNULUS_INNER = 0.55;

export interface LayoutParams {
  /** Spacing multiplier — 1 matches the source layout's own node spacing. */
  spread: number;
  /** Cone profile: drop per level as a fraction of that level's own radius. */
  coneSteep: number;
  /** Organic tree: how wide a branch fans its children, 0–1. */
  branchSpread: number;
  /** Organic tree: shape of an all-leaf cluster. */
  leafShape: LeafShape;
}

export type LeafShape = "auto" | "flower" | "bulb" | "spray";

export const LEAF_SHAPES: LeafShape[] = ["auto", "flower", "bulb", "spray"];

export const LEAF_SHAPE_LABEL: Record<LeafShape, string> = {
  auto: "mixed (per cluster)",
  flower: "flower — flat rosette",
  bulb: "bulb — sphere on the tip",
  spray: "spray — open fan",
};

export const DEFAULT_LAYOUT_PARAMS: LayoutParams = {
  spread: 1,
  coneSteep: 0.9,
  branchSpread: 0.55,
  leafShape: "auto",
};

export const LAYOUT_LIMITS = {
  spread: { min: 0.4, max: 2.5 },
  coneSteep: { min: 0.2, max: 2.5 },
  branchSpread: { min: 0.05, max: 1 },
} as const;

/* ── Small vector helpers ───────────────────────────────────────── */

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/* Two unit vectors perpendicular to `d` — the plane a cluster spreads in. */
function basis(d: Vec3): [Vec3, Vec3] {
  const up: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(d, up));
  return [u, cross(d, u)];
}

/* Stable per-slot pseudo-randomness. Deliberately hash-derived rather than
 * Math.random: the same corpus must project identically every time, or toggling
 * a filter would reshuffle the whole map. */
function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/* i-th of n points spread evenly over a unit sphere (Fibonacci lattice). */
function fibSphere(i: number, n: number): Vec3 {
  if (n <= 1) return [0, 1, 0];
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * PHI_ANGLE;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

/* i-th of n points spread evenly over a unit disc (sunflower). */
function sunflower(i: number, n: number, phase: number): [number, number] {
  const r = Math.sqrt((i + 0.5) / Math.max(1, n));
  const a = i * PHI_ANGLE + phase;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/* i-th of n directions spread evenly over a spherical cap of half-angle θ
 * around `d` — area-uniform in the polar term so a wide fan does not bunch at
 * the rim. */
function fibCap(i: number, n: number, theta: number, d: Vec3, u: Vec3, v: Vec3): Vec3 {
  const cosT = Math.cos(theta);
  const cosPhi = n <= 1 ? 1 : 1 - (1 - cosT) * ((i + 0.5) / n);
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const a = i * PHI_ANGLE;
  const ca = Math.cos(a) * sinPhi;
  const sa = Math.sin(a) * sinPhi;
  return [
    d[0] * cosPhi + u[0] * ca + v[0] * sa,
    d[1] * cosPhi + u[1] * ca + v[1] * sa,
    d[2] * cosPhi + u[2] * ca + v[2] * sa,
  ];
}

/* Radius, as a fraction of the available room, for the i-th of n children —
 * volume-uniform through the annulus so the density is even rather than piling
 * up at the rim. */
function annulusFrac(i: number, n: number): number {
  if (n <= 1) return 1;
  const a3 = ANNULUS_INNER ** 3;
  return Math.cbrt(a3 + (1 - a3) * ((i + 0.5) / n));
}

/* ── Source spacing ────────────────────────────────────────────── */

/* Median nearest-neighbour distance over a strided sample.
 *
 * This is the target every projection is built around, and taking it from the
 * incoming layout (rather than from node.size, or a constant) is what makes the
 * views transferable: whatever spacing the server's force layout chose already
 * looks right against the node radii it was drawn with, so matching it means the
 * alternate views inherit that calibration for free.
 *
 * Strided rather than random so the same graph always yields the same number. */
export function sampleSpacing(nodes: GraphNode[], samples = 120): number {
  if (nodes.length < 2) return 1;
  const step = Math.max(1, Math.floor(nodes.length / samples));
  const out: number[] = [];
  for (let i = 0; i < nodes.length; i += step) {
    const p = nodes[i];
    let best = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const q = nodes[j];
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (d < best) best = d;
    }
    /* Zero distances are dropped, not counted. Coincident nodes are common — a
     * graph can legitimately stack duplicates — and letting them into the median
     * drags the target toward 0, which scales the entire projection down to a
     * sub-unit blob. A layout with no extent at all carries no spacing
     * information, so 1 (one world unit per node) is the honest fallback. */
    if (best < Infinity && best > 0) out.push(Math.sqrt(best));
  }
  if (out.length === 0) return 1;
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)] || 1;
}

/* ── Cluster sizing ────────────────────────────────────────────── */

/* `outer` is the radius of the ball holding a slot and everything beneath it.
 *
 * The rule is recursive on volume: a parent must be big enough that its
 * children's balls fit inside it at the packing fraction, i.e.
 *
 *   outer³ ≥ Σ outer_child³ / PACKING
 *
 * which is self-consistent — a leaf reserves one node's worth, and every level up
 * inflates by exactly the packing loss. That works out to ×(1/PACKING)^(1/3) ≈
 * 1.26 per level of depth, so an 8-deep corpus is ~4× larger than its leaf count
 * alone would suggest and nothing compounds with *breadth*. Getting this wrong in
 * either direction is what broke the earlier versions: reserving a bounding
 * sphere per child compounded by √n per level and produced layouts 1e9 units
 * across, while budgeting only for leaves under-reserved by 4× and put every node
 * back inside its neighbour.
 *
 * Two floors sit alongside it:
 *
 *   surface — the immediate children have to land a target step apart on whatever
 *             shell they occupy: √n · target / 3.81.
 *   own     — a slot can hold several graph nodes (many symbols in one file);
 *             they are fanned out later and need their own room.
 */
function sizeClusters(h: Hierarchy, target: number): Map<Slot, number> {
  const outer = new Map<Slot, number>();
  /* Explicit stack: recursion would risk the call stack on a deep corpus, and
   * this visits every slot in the graph. */
  const order: Slot[] = [];
  const stack: Slot[] = [h.root];
  while (stack.length) {
    const s = stack.pop()!;
    order.push(s);
    for (const c of s.children) stack.push(c);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const slot = order[i];
    const n = slot.children.length;
    let childVolume = 0;
    for (const c of slot.children) {
      const co = outer.get(c)!;
      childVolume += co * co * co;
    }
    const packed = childVolume > 0 ? Math.cbrt(childVolume / PACKING) : 0;
    const leaf = target * LEAF_RADIUS_K;
    const surface = n > 1 ? (target * Math.sqrt(n)) / SPHERE_SPACING_K : 0;
    const own = target * 0.55 * Math.sqrt(Math.max(1, slot.ids.length));
    outer.set(slot, Math.max(packed, leaf, surface, own));
  }
  return outer;
}

/* ── Nested spheres ───────────────────────────────────────────── */

/* Every container becomes its own ball of children, and each of those a smaller
 * ball in turn — the sub-clustering the flat single-shell version could not
 * express. A package reads as a globe, its folders as globes within it, its files
 * as globes within those. */
function layoutSphere(h: Hierarchy, target: number): Map<Slot, Vec3> {
  const outer = sizeClusters(h, target);
  const pos = new Map<Slot, Vec3>();
  pos.set(h.root, [0, 0, 0]);
  const stack: Slot[] = [h.root];
  while (stack.length) {
    const slot = stack.pop()!;
    const at = pos.get(slot)!;
    const room = outer.get(slot)!;
    const n = slot.children.length;
    for (let i = 0; i < n; i++) {
      const child = slot.children[i];
      const d = fibSphere(i, n);
      const r = Math.max(0, room - outer.get(child)!) * annulusFrac(i, n);
      pos.set(child, [at[0] + d[0] * r, at[1] + d[1] * r, at[2] + d[2] * r]);
      stack.push(child);
    }
  }
  return pos;
}

/* ── Nested cones ─────────────────────────────────────────────── */

/* Children fan onto a disc one level below their parent, and each hangs its own
 * disc below that: a cone whose surface is made of smaller cones. The drop per
 * level is a fraction of that level's own radius, so the silhouette stays
 * self-similar all the way down instead of flattening where the corpus is wide. */
function layoutCone(h: Hierarchy, target: number, steep: number): Map<Slot, Vec3> {
  const outer = sizeClusters(h, target);
  const pos = new Map<Slot, Vec3>();
  pos.set(h.root, [0, 0, 0]);
  const stack: Slot[] = [h.root];
  while (stack.length) {
    const slot = stack.pop()!;
    const at = pos.get(slot)!;
    const room = outer.get(slot)!;
    const n = slot.children.length;
    const drop = Math.max(target, room * steep);
    const phase = hash(slot.key) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const child = slot.children[i];
      const [dx, dz] = sunflower(i, n, phase);
      const r = Math.max(0, room - outer.get(child)!);
      pos.set(child, [at[0] + dx * r, at[1] - drop, at[2] + dz * r]);
      stack.push(child);
    }
  }
  return pos;
}

/* ── Organic 3D tree ──────────────────────────────────────────── */

/* A branching tree in three dimensions, replacing the flat tidy tree.
 *
 * The 2D tidy tree could not survive a real corpus: 45k leaf rows against 8
 * depth levels is a 143:1 ribbon at best, and the row spacing needed to fit that
 * on screen collapsed to 0.05 world units — every node inside its neighbour.
 * Growing into 3D spends the third axis on breadth, which is exactly what the
 * tidy tree had nowhere to put.
 *
 * Each container sends its children out along a spherical cap around its own
 * incoming direction, so branches diverge from their parent rather than restart.
 * A cluster whose children are *all* leaves is a terminal and gets a shape
 * instead of a fan — a flat rosette, a ball on the tip, or an open spray. */
function leafShapeFor(slot: Slot, want: LeafShape): Exclude<LeafShape, "auto"> {
  if (want !== "auto") return want;
  const r = hash(slot.key);
  return r < 0.4 ? "flower" : r < 0.75 ? "bulb" : "spray";
}

function layoutOrganic(
  h: Hierarchy,
  target: number,
  branchSpread: number,
  leafShape: LeafShape,
): Map<Slot, Vec3> {
  /* Half-angle of the fan: narrow enough to read as a branch, wide enough that a
   * 500-child folder is not a needle. */
  const theta = 0.3 + branchSpread * 0.95;
  const outer = sizeClusters(h, target);

  const pos = new Map<Slot, Vec3>();
  const dir = new Map<Slot, Vec3>();
  pos.set(h.root, [0, 0, 0]);
  dir.set(h.root, [0, 1, 0]);

  const stack: Slot[] = [h.root];
  while (stack.length) {
    const slot = stack.pop()!;
    const at = pos.get(slot)!;
    const d = dir.get(slot)!;
    const n = slot.children.length;
    if (n === 0) continue;

    const room = outer.get(slot)!;
    const [u, v] = basis(d);
    const allLeaves = slot.children.every((c) => c.children.length === 0);

    if (allLeaves && n > 2) {
      /* Terminal cluster — a shape on the branch tip. */
      const shape = leafShapeFor(slot, leafShape);
      const stem = room * 0.5;
      const tip: Vec3 = [
        at[0] + d[0] * stem,
        at[1] + d[1] * stem,
        at[2] + d[2] * stem,
      ];
      const phase = hash(slot.key) * Math.PI * 2;
      const petal = room * 0.62;
      for (let i = 0; i < n; i++) {
        const child = slot.children[i];
        let p: Vec3;
        if (shape === "flower") {
          /* Rosette in the plane across the branch, so it reads as a bloom seen
           * face-on rather than a lump. */
          const [a, b] = sunflower(i, n, phase);
          p = [
            tip[0] + (u[0] * a + v[0] * b) * petal,
            tip[1] + (u[1] * a + v[1] * b) * petal,
            tip[2] + (u[2] * a + v[2] * b) * petal,
          ];
        } else if (shape === "bulb") {
          const sph = fibSphere(i, n);
          p = [
            tip[0] + sph[0] * petal,
            tip[1] + sph[1] * petal,
            tip[2] + sph[2] * petal,
          ];
        } else {
          /* Spray: the ordinary fan, lengthened unevenly so the tips scatter
           * instead of landing on one shell. */
          const c = fibCap(i, n, theta * 1.15, d, u, v);
          const r = room * (0.6 + hash(`${slot.key}:${i}`) * 0.45);
          p = [at[0] + c[0] * r, at[1] + c[1] * r, at[2] + c[2] * r];
        }
        pos.set(child, p);
        dir.set(child, norm([p[0] - at[0], p[1] - at[1], p[2] - at[2]]));
      }
      continue;
    }

    for (let i = 0; i < n; i++) {
      const child = slot.children[i];
      const c = fibCap(i, n, theta, d, u, v);
      /* Limb length: the parent's own room, leaning longer for the heavier
       * subtrees so the trunk structure is legible before any label is. */
      const weight = slot.leaves > 0 ? child.leaves / slot.leaves : 0;
      const r = Math.max(target, room - outer.get(child)!) *
        (0.85 + Math.min(0.5, Math.cbrt(weight) * 0.5));
      const p: Vec3 = [at[0] + c[0] * r, at[1] + c[1] * r, at[2] + c[2] * r];
      pos.set(child, p);
      dir.set(child, norm(c));
      stack.push(child);
    }
  }
  return pos;
}

/* ── Assembly ─────────────────────────────────────────────────── */

/* Longest distance from the centroid. */
function boundingRadius(nodes: GraphNode[]): number {
  if (nodes.length === 0) return 0;
  let cx = 0, cy = 0, cz = 0;
  for (const n of nodes) {
    cx += n.x; cy += n.y; cz += n.z;
  }
  cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
  let max = 0;
  for (const n of nodes) {
    const d = Math.hypot(n.x - cx, n.y - cy, n.z - cz);
    if (d > max) max = d;
  }
  return max;
}

/* Scale a finished layout so its own median node spacing matches the target.
 *
 * The sizing rules get the *proportions* right but not the absolute scale: the
 * packing fraction is a single constant standing in for how efficiently a
 * Fibonacci lattice in an annulus uses a ball, and how far off it is depends on
 * the corpus's depth and breadth profile. Guessing the constant per corpus is a
 * losing game — measured spacing came out 3.8× tight, then 1.9× tight, on two
 * different guesses over the same graph.
 *
 * So this closes the loop instead: measure what the layout actually achieved and
 * correct it. One extra spacing sample, and the guarantee becomes exact for any
 * shape of corpus rather than approximately right for the one that was tuned
 * against. The clamp is a guard against a degenerate sample (every node at one
 * point) turning into an infinite scale factor.
 *
 * Note this deliberately does *not* fit the layout into the source layout's box —
 * matching extent was the original bug. Density is what transfers; extent is
 * whatever it needs to be, and the caller reframes the camera. */
function fitToSpacing(nodes: GraphNode[], target: number): GraphNode[] {
  if (nodes.length < 2) return nodes;
  const achieved = sampleSpacing(nodes);
  if (!(achieved > 0)) return nodes;
  const k = Math.min(64, Math.max(1 / 64, target / achieved));
  if (Math.abs(k - 1) < 0.02) return nodes;
  for (const n of nodes) {
    n.x *= k; n.y *= k; n.z *= k;
  }
  return nodes;
}

/* Re-center on the origin. */
function centered(nodes: GraphNode[]): GraphNode[] {
  if (nodes.length === 0) return nodes;
  let cx = 0, cy = 0, cz = 0;
  for (const n of nodes) {
    cx += n.x; cy += n.y; cz += n.z;
  }
  cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
  for (const n of nodes) {
    n.x -= cx; n.y -= cy; n.z -= cz;
  }
  return nodes;
}

export { boundingRadius };

/* Apply a view mode to a node list. Pure: returns fresh node objects (or the
 * input array untouched for "default"), never mutates the caller's data. */
export function applyViewMode(
  nodes: GraphNode[],
  edges: GraphEdge[],
  mode: ViewMode,
  params: LayoutParams,
  hierarchy?: Hierarchy,
): GraphNode[] {
  if (mode === "default" || nodes.length === 0) return nodes;

  const h = hierarchy ?? deriveHierarchy(nodes, edges);
  const target = sampleSpacing(nodes) * params.spread;

  let placed: Map<Slot, Vec3>;
  if (mode === "sphere") placed = layoutSphere(h, target);
  else if (mode === "cone") placed = layoutCone(h, target, params.coneSteep);
  else placed = layoutOrganic(h, target, params.branchSpread, params.leafShape);

  const out = nodes.map((n) => {
    const slot = h.slotOf.get(n.id);
    const p = slot ? placed.get(slot) : undefined;
    return p ? { ...n, x: p[0], y: p[1], z: p[2] } : { ...n };
  });

  /* Several nodes can share one slot (multiple symbols in one file). Fan them
   * out on a golden-angle spiral so they don't stack into a single dot — the
   * slot's `outer` radius already reserved room for exactly this. */
  const seen = new Map<Slot, number>();
  for (let i = 0; i < out.length; i++) {
    const slot = h.slotOf.get(out[i].id);
    if (!slot || slot.ids.length < 2) continue;
    const k = seen.get(slot) ?? 0;
    seen.set(slot, k + 1);
    if (k === 0) continue;
    const a = k * PHI_ANGLE;
    const rr = target * 0.55 * Math.sqrt(k);
    out[i] = {
      ...out[i],
      x: out[i].x + Math.cos(a) * rr,
      z: out[i].z + Math.sin(a) * rr,
    };
  }

  return fitToSpacing(centered(out), target);
}

/* ── Path to root ──────────────────────────────────────────────── */

/* Ordered chain of real node ids from the outermost ancestor down to `nodeId`.
 * Slots holding no real node (a directory segment in the path-derived tree) are
 * skipped — the comet travels between things that actually exist on screen. */
export function computePathToRoot(nodeId: number, h: Hierarchy): number[] {
  const slot = h.slotOf.get(nodeId);
  if (!slot) return [];
  const chain: number[] = [];
  for (let s: Slot | null = slot.parent; s; s = s.parent) {
    if (s.ids.length > 0) chain.push(s.ids[0]);
  }
  chain.reverse();
  chain.push(nodeId);
  return chain;
}

/* Non-containment neighbours of a node: what it references and what references
 * it. The path light runs the containment chain down to the selection and then
 * forks along these, which is the half of the static map's behaviour that was
 * missing — the light arrived at the node and stopped, so a selection's actual
 * relationships never lit up.
 *
 * Containment edges are excluded: those are the chain the light just travelled,
 * and re-lighting them would double back on itself. */
export function computeReferenceForks(
  nodeId: number,
  edges: GraphEdge[],
  limit = 12,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>([nodeId]);
  for (const e of edges) {
    if (CONTAINMENT_PRIORITY[e.type] !== undefined) continue;
    const other =
      e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
    if (other === null || seen.has(other)) continue;
    seen.add(other);
    out.push(other);
    if (out.length >= limit) break;
  }
  return out;
}

/* Ancestor path for the breadcrumb: one entry per level, labelled. Includes
 * slots with no node of their own (directories), since the breadcrumb is about
 * *location*, not about clickable graph nodes — but marks which are navigable. */
export interface Crumb {
  /** Display text: one path segment. */
  label: string;
  /** The slot's full key, for the tooltip. */
  full: string;
  /** Real node id when this level is a graph node, else null. */
  nodeId: number | null;
  /** All node ids under this level — what a click should select. */
  subtreeIds: number[];
}

/* Last segment of a slot key.
 *
 * A crumb names one level, but a slot key is whatever the indexer called the node
 * — and some node kinds are named with their whole path. A Module node called
 * "Engine/Code/Engine/Core/PromotedWarnings.hpp" therefore rendered the entire
 * path as the final crumb, directly after the trail had already spelled it out one
 * segment at a time. */
function lastSegment(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/\/+$/, "");
  const cut = clean.lastIndexOf("/");
  return cut >= 0 ? clean.slice(cut + 1) || clean : clean;
}

function collectIds(slot: Slot, into: number[]) {
  for (const id of slot.ids) into.push(id);
  for (const c of slot.children) collectIds(c, into);
}

export function computeCrumbs(nodeId: number, h: Hierarchy): Crumb[] {
  const slot = h.slotOf.get(nodeId);
  if (!slot) return [];
  const chain: Slot[] = [];
  for (let s: Slot | null = slot; s && s.parent; s = s.parent) chain.push(s);
  chain.reverse();
  const crumbs: Crumb[] = chain.map((s) => {
    const ids: number[] = [];
    collectIds(s, ids);
    return {
      label: lastSegment(s.key),
      full: s.key,
      nodeId: s.ids.length > 0 ? s.ids[0] : null,
      subtreeIds: ids,
    };
  });

  /* Drop a level that repeats the one above it. Shortening path-named keys makes
   * this visible: a File node and the Module named after the same path collapse to
   * the same segment, and "… / PromotedWarnings.hpp / PromotedWarnings.hpp" is
   * noise. The later entry wins, since it is the deeper, more specific node. */
  return crumbs.filter((c, i) => i === 0 || c.label !== crumbs[i - 1].label);
}
