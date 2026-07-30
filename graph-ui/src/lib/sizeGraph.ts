/* Size tree → graph, so the size map can be drawn by the 3D viewer.
 *
 * The treemap answers "where does the weight sit" correctly and looks like every
 * other treemap ever shipped, because a squarified treemap is the one obvious way
 * to draw one. The relationship graph already has four projections over the same
 * containment hierarchy — nested spheres, nested cones, an organic tree — and the
 * size tree IS that hierarchy with a different measure on it. So instead of
 * inventing a second visual language, this converts the size tree into the node
 * and edge shape the viewer already consumes, and the existing projections apply
 * unchanged.
 *
 * Two decisions carry the whole thing:
 *
 * 1. **Only files carry byte-proportional size; folders are markers.** A folder's
 *    bytes are the sum of its children's, so sizing the folder sphere by them
 *    would draw a ball that swallows the very children it contains — the weight
 *    counted twice, and the contents occluded. In a nested projection the folder's
 *    *cluster radius* already encodes its total, because room is reserved for
 *    everything beneath it. The folder marker only has to say "a container is
 *    here".
 *
 * 2. **Radius from the cube root of bytes, not from bytes.** What the eye compares
 *    between two spheres is volume, so volume ∝ bytes and radius ∝ bytes^(1/3).
 *    Linear radius makes a 100× file look 100× wide and a million times heavier
 *    than it is; that is the classic bubble-chart lie, and on a source tree (where
 *    sizes span six orders of magnitude) it puts one sphere across the whole scene.
 *
 * Kept free of React and of three.js so the geometry is testable on plain numbers. */

import type { GraphEdge, GraphNode } from "./types";
import { fileKind, KIND_COLORS, type FileKind } from "./fileKind";
import type { SizeNode } from "./sizeMap";

/* World size of the median file. Everything else is proportional to it; the
 * absolute value only sets the units the projection starts in, and the layout
 * rescales from there. */
const BASE_SIZE = 6;

/* A folder marker, in units of BASE_SIZE. Deliberately smaller than a median
 * file: a container is a landmark, not a quantity, and anything bigger reads as
 * "this folder is one huge thing". */
const FOLDER_SIZE_K = 0.55;

/* Floor on a file's size so a 12-byte file is still clickable rather than a
 * sub-pixel speck, and ceiling so one vendored 4 GB blob cannot become the scene.
 * Both in units of BASE_SIZE. */
const MIN_SIZE_K = 0.28;
const MAX_SIZE_K = 7;

/* Containers read as structure, not as content, so they get one neutral tone
 * rather than a colour from the kind palette — a folder tinted like a code file
 * claims to *be* one. */
export const FOLDER_COLOR = "#a3b1c6";

/* Node label per kind, so the tooltip and any future legend name what they show
 * in the same vocabulary the rest of the UI uses. */
const KIND_LABEL: Record<FileKind, string> = {
  code: "Code",
  document: "Document",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  image: "Image",
  video: "Video",
  audio: "Audio",
  data: "Data",
  archive: "Archive",
  config: "Config",
  other: "Other",
};

export const FOLDER_LABEL = "Folder";

export interface SizeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Graph node id → the size-tree node it came from. */
  bySizeNode: Map<number, SizeNode>;
  /** How many size-tree nodes the cap dropped. */
  omitted: number;
  /** Bytes those dropped nodes accounted for. */
  omittedBytes: number;
}

export interface SizeGraphOptions {
  /** Hard cap on emitted nodes. The heaviest survive; the rest are reported. */
  maxNodes?: number;
}

/* A real corpus is bigger than a scene should be: the disk walk on a 25 GB
 * checkout returns 26k files, and the graph view's own comfortable ceiling is a
 * few tens of thousands of instanced spheres. Capping by *weight* rather than by
 * traversal order is the point — the question this view answers is where the
 * bytes are, so the nodes that must survive a cap are the heavy ones. */
const DEFAULT_MAX_NODES = 8000;

/* Median of a numeric array. Copies rather than sorting in place. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/* Convert a size tree into nodes and containment edges.
 *
 * Emission order is heaviest-first across the whole tree, which is what makes the
 * cap safe: a node is only ever pushed onto the frontier by its own parent, so a
 * parent is always emitted before its children and every edge references two
 * nodes that exist. Dropping the tail therefore prunes leaves, never orphans.
 *
 * `root` itself is not emitted — it is the corpus, and a sphere for "everything"
 * sitting at the centre of everything says nothing. Its children become the top
 * level, exactly as the treemap shows them. */
export function sizeTreeToGraph(
  root: SizeNode,
  options: SizeGraphOptions = {},
): SizeGraph {
  const maxNodes = Math.max(1, options.maxNodes ?? DEFAULT_MAX_NODES);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const bySizeNode = new Map<number, SizeNode>();

  /* Frontier of (size node, parent graph id), kept sorted by bytes descending.
   * An array with a linear insert beats a heap here: the frontier is the breadth
   * of one level, and the constant factor of a binary heap costs more than the
   * insert on the few thousand entries this ever holds. */
  interface Pending {
    node: SizeNode;
    parentId: number | null;
  }
  const frontier: Pending[] = root.children.map((c) => ({ node: c, parentId: null }));
  frontier.sort((a, b) => b.node.bytes - a.node.bytes);

  const insert = (item: Pending) => {
    /* Descending by bytes; ties keep insertion order so the result is stable. */
    let lo = 0;
    let hi = frontier.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frontier[mid].node.bytes > item.node.bytes) lo = mid + 1;
      else hi = mid;
    }
    frontier.splice(lo, 0, item);
  };

  let nextId = 1;
  let omitted = 0;
  let omittedBytes = 0;

  while (frontier.length > 0) {
    const item = frontier.shift()!;
    if (nodes.length >= maxNodes) {
      /* Everything still queued is lighter than everything emitted. Count it and
       * the bytes it stands for; the caller says so on screen rather than letting
       * a truncated scene pass as the whole corpus. */
      omitted++;
      omittedBytes += item.node.bytes;
      continue;
    }
    const sizeNode = item.node;
    const isFolder = sizeNode.children.length > 0;
    const id = nextId++;

    nodes.push({
      id,
      /* Placed by the projection; the source tree carries no coordinates. */
      x: 0,
      y: 0,
      z: 0,
      label: isFolder ? FOLDER_LABEL : KIND_LABEL[fileKind(sizeNode.path)],
      name: sizeNode.name,
      file_path: sizeNode.path,
      /* Filled in below, once the median is known. */
      size: isFolder ? -1 : sizeNode.bytes,
      color: isFolder ? FOLDER_COLOR : KIND_COLORS[fileKind(sizeNode.path)],
    });
    bySizeNode.set(id, sizeNode);

    if (item.parentId !== null) {
      /* The vocabulary viewLayout's hierarchy derivation already understands, so
       * the projections see a containment tree without a special case. */
      edges.push({
        source: item.parentId,
        target: id,
        type: isFolder ? "CONTAINS_FOLDER" : "CONTAINS_FILE",
      });
    }

    for (const child of sizeNode.children) insert({ node: child, parentId: id });
  }

  /* Scale against the median *file*, not the median node: a corpus that is mostly
   * folders would otherwise set its own yardstick from markers. */
  const fileBytes = nodes.filter((n) => n.size >= 0).map((n) => n.size);
  const mid = median(fileBytes) || 1;
  const folderSize = BASE_SIZE * FOLDER_SIZE_K;
  for (const node of nodes) {
    if (node.size < 0) {
      node.size = folderSize;
      continue;
    }
    const ratio = Math.cbrt(Math.max(1, node.size) / mid);
    node.size = Math.min(
      BASE_SIZE * MAX_SIZE_K,
      Math.max(BASE_SIZE * MIN_SIZE_K, BASE_SIZE * ratio),
    );
  }

  return { nodes, edges, bySizeNode, omitted, omittedBytes };
}

/* Drawn radius of a node, in world units.
 *
 * NodeCloud scales a unit sphere by `size * 0.5` for a node in full brightness,
 * so that product — not `size` — is what has to fit in the room a layout reserves.
 * Exported rather than inlined because the layout and the renderer disagreeing
 * about this is exactly how spheres end up inside each other. */
export function drawnRadius(node: GraphNode): number {
  return node.size * 0.5;
}
