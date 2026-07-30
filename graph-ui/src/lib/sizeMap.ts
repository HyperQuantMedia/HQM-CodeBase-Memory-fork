/* Nested size map: a squarified treemap over the indexed file tree.
 *
 * The graph answers "what is connected to what". This answers a question it
 * cannot: "where does the weight actually sit". Both read the same corpus, and
 * both nest by containment, so the two views are the same structure measured on
 * different axes — hence the same folder hierarchy the graph already derives, laid
 * out by bytes instead of by relationships.
 *
 * Squarified rather than slice-and-dice: slice-and-dice alternates axes and
 * produces slivers as soon as one child dominates its siblings, which is the norm
 * for source trees (one huge vendored folder next to twenty small ones). The
 * squarified algorithm (Bruls, Huizing & van Wijk 2000) greedily fills a row while
 * doing so improves the worst aspect ratio in that row, which keeps tiles close to
 * square and therefore comparable by eye.
 *
 * Kept free of React so the geometry is testable on plain numbers. */

export interface FileSize {
  path: string;
  bytes: number;
}

export interface SizeNode {
  /** Path segment. */
  name: string;
  /** Full path from the corpus root. */
  path: string;
  bytes: number;
  /** Files beneath this node, itself included when it is a file. */
  fileCount: number;
  /** Empty for a file. */
  children: SizeNode[];
  /** Depth from the root, which is 0. */
  depth: number;
}

export interface SizeTile {
  node: SizeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ── Tree ──────────────────────────────────────────────────────── */

/* Build the folder tree from flat path/size pairs.
 *
 * Directory sizes are summed from their contents rather than read from anywhere:
 * a directory's own inode size is not what anyone means by "how big is src/". */
export function buildSizeTree(files: FileSize[], rootName = ""): SizeNode {
  const root: SizeNode = {
    name: rootName,
    path: "",
    bytes: 0,
    fileCount: 0,
    children: [],
    depth: 0,
  };
  const byPath = new Map<string, SizeNode>([["", root]]);

  for (const file of files) {
    if (!(file.bytes > 0)) continue;
    const clean = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let parent = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      const leaf = i === parts.length - 1;
      let node = byPath.get(acc);
      if (!node) {
        node = {
          name: parts[i],
          path: acc,
          bytes: 0,
          fileCount: 0,
          children: [],
          depth: parent.depth + 1,
        };
        byPath.set(acc, node);
        parent.children.push(node);
      }
      parent = node;
      if (leaf) {
        /* A path repeated in the input adds once. */
        node.bytes += file.bytes;
        node.fileCount += 1;
      }
    }
  }

  /* Roll sizes up, largest first so the treemap's greedy row packing sees the
   * heavy tiles at the start — which is what the algorithm assumes. */
  const roll = (node: SizeNode): void => {
    if (node.children.length === 0) return;
    let bytes = node.bytes;
    let count = node.fileCount;
    for (const child of node.children) {
      roll(child);
      bytes += child.bytes;
      count += child.fileCount;
    }
    node.bytes = bytes;
    node.fileCount = count;
    node.children.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  };
  roll(root);
  return root;
}

/** Descend to a path, or null if it is not in the tree. */
export function findSizeNode(root: SizeNode, path: string): SizeNode | null {
  if (!path) return root;
  const parts = path.split("/").filter(Boolean);
  let node = root;
  for (const part of parts) {
    const next = node.children.find((c) => c.name === part);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Ancestor chain from the root down to `path`, inclusive. */
export function sizeCrumbs(root: SizeNode, path: string): SizeNode[] {
  const out: SizeNode[] = [root];
  if (!path) return out;
  let node = root;
  for (const part of path.split("/").filter(Boolean)) {
    const next = node.children.find((c) => c.name === part);
    if (!next) break;
    node = next;
    out.push(node);
  }
  return out;
}

/* ── Squarified treemap ────────────────────────────────────────── */

function worstAspect(row: number[], length: number, totalArea: number): number {
  if (row.length === 0 || length <= 0 || totalArea <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const v of row) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (sum <= 0) return Number.POSITIVE_INFINITY;
  const side = sum / length;
  return Math.max((side * side) / min, max / (side * side));
}

/* Lay a node's immediate children out inside a rectangle.
 *
 * Children whose share of the area would be smaller than `minArea` are dropped
 * rather than drawn as invisible slivers — a corpus has a long tail of tiny files
 * and rendering all of them costs everything and shows nothing. The caller reports
 * how many were left out; silently dropping them would make the map read as
 * complete when it is not. */
export function squarify(
  children: SizeNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  minArea = 12,
): { tiles: SizeTile[]; omitted: number } {
  const tiles: SizeTile[] = [];
  if (w <= 0 || h <= 0 || children.length === 0) return { tiles, omitted: 0 };

  const total = children.reduce((a, c) => a + c.bytes, 0);
  if (total <= 0) return { tiles, omitted: 0 };

  const area = w * h;
  const scaled = children.map((c) => ({ node: c, area: (c.bytes / total) * area }));
  const visible = scaled.filter((s) => s.area >= minArea);
  const omitted = scaled.length - visible.length;
  if (visible.length === 0) return { tiles, omitted };

  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  let i = 0;

  while (i < visible.length) {
    /* Rows run along the shorter side, which is what keeps tiles square. */
    const vertical = cw >= ch;
    const length = vertical ? ch : cw;
    const row: number[] = [];
    let rowSum = 0;
    let j = i;

    while (j < visible.length) {
      const next = [...row, visible[j].area];
      /* Stop as soon as adding the next tile makes the row's worst aspect ratio
       * worse — the greedy criterion the algorithm is built on. */
      if (
        row.length > 0 &&
        worstAspect(next, length, area) > worstAspect(row, length, area)
      ) {
        break;
      }
      row.push(visible[j].area);
      rowSum += visible[j].area;
      j++;
    }

    const thickness = length > 0 ? rowSum / length : 0;
    let offset = vertical ? cy : cx;
    for (let k = 0; k < row.length; k++) {
      const extent = thickness > 0 ? row[k] / thickness : 0;
      tiles.push(
        vertical
          ? { node: visible[i + k].node, x: cx, y: offset, w: thickness, h: extent }
          : { node: visible[i + k].node, x: offset, y: cy, w: extent, h: thickness },
      );
      offset += extent;
    }

    if (vertical) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
    i = j;
    if (cw <= 0.5 || ch <= 0.5) break;
  }

  return { tiles, omitted };
}

/* ── Presentation helpers ─────────────────────────────────────── */

export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  const digits = i === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}
