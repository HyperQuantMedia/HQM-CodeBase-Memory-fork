import { describe, expect, it } from "vitest";
import { buildSizeTree, type FileSize } from "./sizeMap";
import {
  drawnRadius,
  FOLDER_COLOR,
  FOLDER_LABEL,
  sizeTreeToGraph,
} from "./sizeGraph";
import { applyViewMode, DEFAULT_LAYOUT_PARAMS } from "./viewLayout";

const FILES: FileSize[] = [
  { path: "src/lib/huge.bin", bytes: 64_000_000 },
  { path: "src/lib/small.ts", bytes: 1_000 },
  { path: "src/app.ts", bytes: 8_000 },
  { path: "docs/guide.md", bytes: 4_000 },
  { path: "README.md", bytes: 2_000 },
];

function graphOf(files = FILES, maxNodes?: number) {
  return sizeTreeToGraph(buildSizeTree(files, "demo"), { maxNodes });
}

describe("sizeTreeToGraph", () => {
  it("emits a node per tree entry below the root, and no node for the root", () => {
    const { nodes } = graphOf();
    const paths = nodes.map((n) => n.file_path).sort();
    expect(paths).toEqual([
      "README.md",
      "docs",
      "docs/guide.md",
      "src",
      "src/app.ts",
      "src/lib",
      "src/lib/huge.bin",
      "src/lib/small.ts",
    ]);
    /* The corpus itself is not a sphere: a ball for "everything" at the centre of
     * everything says nothing. */
    expect(paths).not.toContain("");
  });

  it("labels and colours folders as containers, not as content", () => {
    const { nodes } = graphOf();
    const src = nodes.find((n) => n.file_path === "src")!;
    expect(src.label).toBe(FOLDER_LABEL);
    expect(src.color).toBe(FOLDER_COLOR);
    const app = nodes.find((n) => n.file_path === "src/app.ts")!;
    expect(app.label).toBe("Code");
    expect(app.color).not.toBe(FOLDER_COLOR);
  });

  it("classifies by extension, so a document in a code folder is a document", () => {
    const { nodes } = graphOf();
    expect(nodes.find((n) => n.file_path === "docs/guide.md")!.label).toBe("Document");
    expect(nodes.find((n) => n.file_path === "README.md")!.label).toBe("Document");
  });

  it("emits containment edges the hierarchy derivation already understands", () => {
    const { nodes, edges } = graphOf();
    const byPath = new Map(nodes.map((n) => [n.file_path, n.id]));
    expect(edges).toContainEqual({
      source: byPath.get("src"),
      target: byPath.get("src/lib"),
      type: "CONTAINS_FOLDER",
    });
    expect(edges).toContainEqual({
      source: byPath.get("src/lib"),
      target: byPath.get("src/lib/huge.bin"),
      type: "CONTAINS_FILE",
    });
    /* Top-level entries hang off the (unemitted) root, so they carry no edge. */
    const targets = new Set(edges.map((e) => e.target));
    expect(targets.has(byPath.get("README.md")!)).toBe(false);
  });

  it("never emits an edge whose endpoints are missing", () => {
    /* The property the cap depends on: heaviest-first emission means a parent is
     * always present before its children, so truncating prunes leaves. */
    const { nodes, edges } = graphOf(FILES, 4);
    const ids = new Set(nodes.map((n) => n.id));
    expect(nodes).toHaveLength(4);
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("reports what the cap dropped instead of truncating silently", () => {
    const { nodes, omitted, omittedBytes } = graphOf(FILES, 4);
    expect(nodes).toHaveLength(4);
    expect(omitted).toBeGreaterThan(0);
    expect(omittedBytes).toBeGreaterThan(0);
  });

  it("keeps the heaviest entries when it has to drop some", () => {
    const { nodes } = graphOf(FILES, 4);
    expect(nodes.map((n) => n.file_path)).toContain("src/lib/huge.bin");
  });

  it("scales radius by the cube root of bytes, so volume is the quantity read", () => {
    /* An 8× byte ratio has to come out as a 2× radius ratio. Linear radius is the
     * classic bubble-chart lie: it would show 8× and mean 512×. */
    const { nodes } = graphOf([
      { path: "a.bin", bytes: 1_000_000 },
      { path: "b.bin", bytes: 8_000_000 },
      { path: "c.bin", bytes: 1_000_000 },
    ]);
    const a = nodes.find((n) => n.file_path === "a.bin")!;
    const b = nodes.find((n) => n.file_path === "b.bin")!;
    expect(drawnRadius(b) / drawnRadius(a)).toBeCloseTo(2, 1);
  });

  it("gives a folder a marker size, not the sum of its contents", () => {
    /* src holds 64 MB; sizing it by that would draw a ball that swallows the very
     * file it contains, and count the weight twice. */
    const { nodes } = graphOf();
    const src = nodes.find((n) => n.file_path === "src")!;
    const huge = nodes.find((n) => n.file_path === "src/lib/huge.bin")!;
    expect(src.size).toBeLessThan(huge.size);
  });

  it("clamps the range so one blob cannot become the scene", () => {
    const { nodes } = graphOf([
      { path: "blob.bin", bytes: 40_000_000_000 },
      { path: "tiny.txt", bytes: 12 },
      { path: "mid.txt", bytes: 5_000 },
    ]);
    const sizes = nodes.map((n) => n.size);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(30);
    /* And the floor keeps a 12-byte file clickable rather than sub-pixel. */
    expect(Math.min(...sizes)).toBeGreaterThan(0);
  });

  it("produces a graph the projections can lay out", () => {
    const { nodes, edges } = graphOf();
    const placed = applyViewMode(
      nodes,
      edges,
      "sphere",
      DEFAULT_LAYOUT_PARAMS,
      undefined,
      drawnRadius,
    );
    expect(placed).toHaveLength(nodes.length);
    /* Every node moved off the origin it started at — a size graph carries no
     * coordinates of its own, so a projection that failed would leave them stacked. */
    const distinct = new Set(placed.map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`));
    expect(distinct.size).toBe(placed.length);
  });

  it("does not resize the spheres to fit the layout", () => {
    /* The radii are the data. A closing fit that scaled them would make the view
     * lie about every file in it. */
    const { nodes, edges } = graphOf();
    const before = new Map(nodes.map((n) => [n.id, n.size]));
    const placed = applyViewMode(
      nodes,
      edges,
      "cone",
      DEFAULT_LAYOUT_PARAMS,
      undefined,
      drawnRadius,
    );
    for (const n of placed) expect(n.size).toBe(before.get(n.id));
  });
});
