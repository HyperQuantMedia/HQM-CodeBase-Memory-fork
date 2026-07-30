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
export type TreeDirection = "horizontal" | "vertical";

export const VIEW_MODES: ViewMode[] = ["default", "sphere", "cone", "tree"];

export const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  default: "Force (server)",
  sphere: "3D sphere",
  cone: "3D cone",
  tree: "2D tree",
};

/* Toolbar-width labels for the cycle button. */
export const VIEW_MODE_SHORT: Record<ViewMode, string> = {
  default: "Force",
  sphere: "Sphere",
  cone: "Cone",
  tree: "Tree",
};

/* Layout constants, ported from astra-map.js (RING 120, TREE_LEVEL_W 190,
 * SPHERE_LAT_SPAN 0.92). The static map's fixed TREE_LEAF_GAP of 18 units is
 * deliberately not carried over — see projectTree: row spacing is derived from
 * the leaf count so the tree keeps its proportions at any corpus size. Both RING
 * and the sphere radius are treated as minimums, then the whole layout is scaled
 * to the server layout's extent so the camera framing carries over. */
const RING = 120;
const TREE_LEVEL_W = 190;
const SPHERE_LAT_SPAN = 0.92;

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

export interface LayoutParams {
  /** Sphere radius multiplier (1 = auto-fit to depth). */
  sphereScale: number;
  /** Cone height per depth level, world units. */
  coneHeight: number;
  /** Tree flow direction. */
  treeDirection: TreeDirection;
}

export const DEFAULT_LAYOUT_PARAMS: LayoutParams = {
  sphereScale: 1,
  coneHeight: 130,
  treeDirection: "vertical",
};

export const LAYOUT_LIMITS = {
  sphereScale: { min: 0.4, max: 2.5 },
  coneHeight: { min: 30, max: 320 },
} as const;

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

/* Where a slot sits inside its own depth band, 0..1.
 *
 * Latitude (sphere) and ring radius (cone) come from an integer depth, so on a
 * real corpus every node at the same depth landed on one razor-thin circle: p4
 * has ~47k nodes across 8 depths, i.e. ~5.9k nodes sharing a circle with 0.8
 * world units between them. They overlapped into a wireframe instead of reading
 * as a cloud. Offsetting each node inside its band by its position among its
 * siblings turns each ring into a filled shell, and keeps a sibling group
 * together as a patch rather than smearing it around the whole circle. */
function bandOffset(slot: Slot): number {
  return slot.sibCount > 1 ? (slot.sibIndex + 0.5) / slot.sibCount - 0.5 : 0;
}

/* Sphere: depth becomes latitude, angle becomes longitude — the corpus wrapped
 * onto a globe with the root at the north pole, each depth a filled band. */
function projectSphere(
  slot: Slot,
  maxDepth: number,
  radius: number,
): [number, number, number] {
  const band = (Math.PI * SPHERE_LAT_SPAN) / (maxDepth + 0.6);
  const phi = (slot.depth + bandOffset(slot) * 0.85) * band;
  const th = slot.angle;
  return [
    radius * Math.sin(phi) * Math.cos(th),
    -radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(th),
  ];
}

/* Cone: the radial layout's footprint, with depth lifted along Y — a stack of
 * rings narrowing toward the root, each ring given thickness so it reads as a
 * shell rather than a hoop. */
function projectCone(
  slot: Slot,
  maxDepth: number,
  coneHeight: number,
  ring: number,
): [number, number, number] {
  const off = bandOffset(slot);
  const r = (slot.depth + off * 0.7) * ring;
  return [
    Math.cos(slot.angle) * r,
    (maxDepth * 0.5 - slot.depth - off * 0.5) * coneHeight,
    Math.sin(slot.angle) * r,
  ];
}

/* Tidy tree, flattened to z=0: depth along one axis, leaf rows along the other.
 *
 * Row spacing is derived, not fixed. At the static map's scale (a few hundred
 * files) a constant 18-unit gap was fine; at 47k leaves it made the tree 846,000
 * units tall against 1,520 wide — a 557:1 sliver that rendered as a single
 * vertical line. Spacing now divides a target extent by the leaf count, so the
 * proportions hold at any size. */
function projectTree(
  slot: Slot,
  direction: TreeDirection,
  leafGap: number,
): [number, number, number] {
  const along = slot.depth * TREE_LEVEL_W;
  const across = slot.row * leafGap;
  /* Vertical flows top-to-bottom: depth on -Y, rows on X. */
  return direction === "vertical" ? [across, -along, 0] : [along, -across, 0];
}

/* Auto-fit radius so a deep corpus doesn't self-intersect and a shallow one
 * doesn't vanish — ported from SPHERE_R_BASE. */
function sphereRadius(maxDepth: number, scale: number): number {
  return Math.max(260, maxDepth * 95) * scale;
}

/* Longest distance from the centroid — the extent the camera is already framed
 * for. */
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

/* Scale a projected layout to the extent the server layout occupies.
 *
 * Cartograph frames the camera once, from the server's own coordinate range;
 * a projection sized from depth alone (max(260, depth*95) — 760 units on p4)
 * landed at a different scale entirely, so switching view left the graph either
 * a speck or clipped past the near plane. Matching the incoming extent means
 * every projection arrives already framed. */
function fitToExtent(nodes: GraphNode[], target: number): GraphNode[] {
  if (nodes.length === 0 || target <= 0) return nodes;
  const current = boundingRadius(nodes);
  if (current <= 0) return nodes;
  const k = target / current;
  for (const n of nodes) {
    n.x *= k; n.y *= k; n.z *= k;
  }
  return nodes;
}

/* Re-center a layout on the origin so the existing camera framing still works
 * regardless of which projection produced it. */
function centered(nodes: GraphNode[]): GraphNode[] {
  if (nodes.length === 0) return nodes;
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
    cz += n.z;
  }
  cx /= nodes.length;
  cy /= nodes.length;
  cz /= nodes.length;
  for (const n of nodes) {
    n.x -= cx;
    n.y -= cy;
    n.z -= cz;
  }
  return nodes;
}

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
  const radius = sphereRadius(h.maxDepth, params.sphereScale);
  /* Extent the camera is already framed for, measured before we overwrite the
   * positions. */
  const target = boundingRadius(nodes);

  /* Row spacing that holds the tree's proportions at any corpus size: solve for
   * the gap that makes the rows span ~1.4× the depth axis. Deliberately not
   * floored at some minimum — a floor is what produced the 557:1 sliver, because
   * 42k rows at any fixed spacing dwarf a depth axis a few levels deep. Absolute
   * spacing does not matter here since fitToExtent rescales afterwards; only the
   * ratio does. */
  const treeLeafGap =
    (h.maxDepth * TREE_LEVEL_W * 1.4) / Math.max(1, h.leafCount - 1);

  const out = nodes.map((n) => {
    const slot = h.slotOf.get(n.id);
    if (!slot) return { ...n };
    let p: [number, number, number];
    if (mode === "sphere") p = projectSphere(slot, h.maxDepth, radius);
    else if (mode === "cone")
      /* RING stays fixed so the cone's profile is set by coneHeight alone —
       * scaling the ring with breadth instead made the base radius dwarf the
       * height, and fitToExtent then flattened the whole thing to a disc. */
      p = projectCone(slot, h.maxDepth, params.coneHeight, RING);
    else p = projectTree(slot, params.treeDirection, treeLeafGap);
    return { ...n, x: p[0], y: p[1], z: p[2] };
  });

  /* Several nodes can share one slot (multiple symbols in one file). Fan them
   * out slightly so they don't stack into a single dot. Spread scales with the
   * layout so it stays visible on a large corpus and subtle on a small one. */
  const seen = new Map<Slot, number>();
  const fan = Math.max(4, boundingRadius(out) * 0.006);
  for (let i = 0; i < out.length; i++) {
    const slot = h.slotOf.get(out[i].id);
    if (!slot || slot.ids.length < 2) continue;
    const k = seen.get(slot) ?? 0;
    seen.set(slot, k + 1);
    if (k === 0) continue;
    /* Golden-angle spiral around the slot centre — deterministic, no overlap. */
    const a = k * 2.39996;
    const rr = fan * Math.sqrt(k);
    out[i] = {
      ...out[i],
      x: out[i].x + Math.cos(a) * rr,
      z: out[i].z + Math.sin(a) * rr,
    };
  }

  /* Centre first, then match the server layout's extent so the camera framing
   * carries over unchanged. */
  return fitToExtent(centered(out), target);
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
  label: string;
  /** Real node id when this level is a graph node, else null. */
  nodeId: number | null;
  /** All node ids under this level — what a click should select. */
  subtreeIds: number[];
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
  return chain.map((s) => {
    const ids: number[] = [];
    collectIds(s, ids);
    return {
      label: s.key,
      nodeId: s.ids.length > 0 ? s.ids[0] : null,
      subtreeIds: ids,
    };
  });
}
