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

/* Layout constants, ported from astra-map.js (RING 120, TREE_LEVEL_W 190,
 * TREE_LEAF_GAP 18, SPHERE_LAT_SPAN 0.92). World scale matches Cartograph's
 * default camera (z=800, fov 50). */
const RING = 120;
const TREE_LEVEL_W = 190;
const TREE_LEAF_GAP = 18;
const SPHERE_LAT_SPAN = 0.92;

/* Containment edge types the indexer emits; any of them marks source→target
 * as parent→child. */
const CONTAINMENT_TYPES = new Set([
  "CONTAINS_FILE",
  "CONTAINS_FOLDER",
  "CONTAINS_PACKAGE",
]);

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
}

export interface Hierarchy {
  /** Synthetic root; never rendered itself. */
  root: Slot;
  /** Real node id → its slot. */
  slotOf: Map<number, Slot>;
  maxDepth: number;
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
  let any = false;
  for (const e of edges) {
    if (!CONTAINMENT_TYPES.has(e.type)) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    any = true;
    /* First parent wins — a node claimed twice keeps a single tree position. */
    if (!parentOf.has(e.target)) parentOf.set(e.target, e.source);
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
  return { root, slotOf, maxDepth: 0, fromEdges: true };
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
  return { root, slotOf, maxDepth: 0, fromEdges: false };
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
    for (const c of slot.children) {
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

/* Sphere: depth becomes latitude, angle becomes longitude — the corpus wrapped
 * onto a globe with the root at the north pole. */
function projectSphere(
  slot: Slot,
  maxDepth: number,
  radius: number,
): [number, number, number] {
  const phi = (slot.depth / (maxDepth + 0.6)) * Math.PI * SPHERE_LAT_SPAN;
  const th = slot.angle;
  return [
    radius * Math.sin(phi) * Math.cos(th),
    -radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(th),
  ];
}

/* Cone: the radial layout's footprint, with depth lifted along Y — a stack of
 * rings narrowing toward the root. */
function projectCone(
  slot: Slot,
  maxDepth: number,
  coneHeight: number,
): [number, number, number] {
  const r = slot.depth * RING;
  return [
    Math.cos(slot.angle) * r,
    (maxDepth * 0.5 - slot.depth) * coneHeight,
    Math.sin(slot.angle) * r,
  ];
}

/* Tidy tree, flattened to z=0: depth along one axis, leaf rows along the other.
 * Rows never collide, so labels can sit beside nodes overlap-free. */
function projectTree(
  slot: Slot,
  direction: TreeDirection,
): [number, number, number] {
  const along = slot.depth * TREE_LEVEL_W;
  const across = slot.row * TREE_LEAF_GAP;
  /* Vertical flows top-to-bottom: depth on -Y, rows on X. */
  return direction === "vertical" ? [across, -along, 0] : [along, -across, 0];
}

/* Auto-fit radius so a deep corpus doesn't self-intersect and a shallow one
 * doesn't vanish — ported from SPHERE_R_BASE. */
function sphereRadius(maxDepth: number, scale: number): number {
  return Math.max(260, maxDepth * 95) * scale;
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

  const out = nodes.map((n) => {
    const slot = h.slotOf.get(n.id);
    if (!slot) return { ...n };
    let p: [number, number, number];
    if (mode === "sphere") p = projectSphere(slot, h.maxDepth, radius);
    else if (mode === "cone") p = projectCone(slot, h.maxDepth, params.coneHeight);
    else p = projectTree(slot, params.treeDirection);
    return { ...n, x: p[0], y: p[1], z: p[2] };
  });

  /* Several nodes can share one slot (multiple symbols in one file). Fan them
   * out slightly so they don't stack into a single dot. */
  const seen = new Map<Slot, number>();
  for (let i = 0; i < out.length; i++) {
    const slot = h.slotOf.get(out[i].id);
    if (!slot || slot.ids.length < 2) continue;
    const k = seen.get(slot) ?? 0;
    seen.set(slot, k + 1);
    if (k === 0) continue;
    /* Golden-angle spiral around the slot centre — deterministic, no overlap. */
    const a = k * 2.39996;
    const rr = 6 * Math.sqrt(k);
    out[i] = {
      ...out[i],
      x: out[i].x + Math.cos(a) * rr,
      z: out[i].z + Math.sin(a) * rr,
    };
  }

  return centered(out);
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
