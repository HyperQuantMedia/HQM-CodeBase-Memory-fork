import { describe, expect, it } from "vitest";
import {
  applyViewMode,
  computeCrumbs,
  computePathToRoot,
  DEFAULT_LAYOUT_PARAMS,
  deriveHierarchy,
} from "./viewLayout";
import type { GraphEdge, GraphNode } from "./types";

function n(id: number, name: string, file_path?: string): GraphNode {
  return {
    id,
    x: 0,
    y: 0,
    z: 0,
    label: "File",
    name,
    file_path,
    size: 3,
    color: "#fff",
  };
}

/* Containment-shaped graph: 1 ⊃ {2, 3}, 2 ⊃ 4 */
const edgeNodes = [n(1, "root"), n(2, "src"), n(3, "docs"), n(4, "main.c")];
const containment: GraphEdge[] = [
  { source: 1, target: 2, type: "CONTAINS_FOLDER" },
  { source: 1, target: 3, type: "CONTAINS_FOLDER" },
  { source: 2, target: 4, type: "CONTAINS_FILE" },
];

/* Path-shaped graph: no containment edges at all (an overlay-only corpus) */
const pathNodes = [
  n(10, "a.md", "docs/guide/a.md"),
  n(11, "b.md", "docs/guide/b.md"),
  n(12, "top.md", "top.md"),
];

describe("deriveHierarchy", () => {
  it("uses containment edges when present", () => {
    const h = deriveHierarchy(edgeNodes, containment);
    expect(h.fromEdges).toBe(true);
    /* root at depth 1 under the synthetic root, main.c two levels deeper. */
    expect(h.slotOf.get(1)!.depth).toBe(1);
    expect(h.slotOf.get(4)!.depth).toBe(3);
    expect(h.maxDepth).toBe(3);
  });

  it("falls back to file paths when there are no containment edges", () => {
    const h = deriveHierarchy(pathNodes, []);
    expect(h.fromEdges).toBe(false);
    /* docs/guide/a.md → depth 3 (docs, guide, a.md). */
    expect(h.slotOf.get(10)!.depth).toBe(3);
    expect(h.slotOf.get(12)!.depth).toBe(1);
  });

  it("places every node, including ones with no path at all", () => {
    const h = deriveHierarchy([n(20, "orphan")], []);
    expect(h.slotOf.has(20)).toBe(true);
  });

  it("treats DEFINES as containment so symbols nest under their file", () => {
    /* Real code graphs nest in two vocabularies: folders/files use CONTAINS_*,
     * but a file holds its symbols with DEFINES / DEFINES_METHOD. Miss those and
     * every function strands at the root, flattening the layouts and reducing
     * the breadcrumb to one level. */
    const ns = [n(1, "src"), n(2, "app.ts"), n(3, "boot"), n(4, "helper")];
    const es: GraphEdge[] = [
      { source: 1, target: 2, type: "CONTAINS_FILE" },
      { source: 2, target: 3, type: "DEFINES" },
      { source: 3, target: 4, type: "DEFINES_METHOD" },
    ];
    const h = deriveHierarchy(ns, es);
    expect(h.slotOf.get(3)!.depth).toBe(3);
    expect(h.slotOf.get(4)!.depth).toBe(4);
    expect(computePathToRoot(4, h)).toEqual([1, 2, 3, 4]);
  });

  it("picks the strongest containment when a node is claimed twice", () => {
    /* Edge order must not decide the tree: CONTAINS_FILE outranks DEFINES
     * whichever arrives first. */
    const ns = [n(1, "src"), n(2, "other.ts"), n(3, "boot")];
    const definesFirst: GraphEdge[] = [
      { source: 2, target: 3, type: "DEFINES" },
      { source: 1, target: 3, type: "CONTAINS_FILE" },
    ];
    const containsFirst: GraphEdge[] = [...definesFirst].reverse();
    for (const es of [definesFirst, containsFirst]) {
      const h = deriveHierarchy(ns, es);
      expect(computePathToRoot(3, h)).toEqual([1, 3]);
    }
  });

  it("ignores MEMBER_OF, which points the other way", () => {
    /* Treating a member→container edge as containment would invert the branch. */
    const ns = [n(1, "Klass"), n(2, "method")];
    const h = deriveHierarchy(ns, [{ source: 2, target: 1, type: "MEMBER_OF" }]);
    expect(h.fromEdges).toBe(false); /* no containment edges → path fallback */
  });

  it("survives a containment cycle without hanging", () => {
    const cyc: GraphEdge[] = [
      { source: 1, target: 2, type: "CONTAINS_FOLDER" },
      { source: 2, target: 1, type: "CONTAINS_FOLDER" },
    ];
    const h = deriveHierarchy([n(1, "a"), n(2, "b")], cyc);
    expect(h.slotOf.size).toBe(2);
  });

  it("is deterministic across runs", () => {
    const a = deriveHierarchy(pathNodes, []);
    const b = deriveHierarchy([...pathNodes].reverse(), []);
    expect(a.slotOf.get(10)!.angle).toBeCloseTo(b.slotOf.get(10)!.angle);
  });
});

describe("applyViewMode", () => {
  it("passes through untouched in default mode", () => {
    const out = applyViewMode(edgeNodes, containment, "default", DEFAULT_LAYOUT_PARAMS);
    expect(out).toBe(edgeNodes);
  });

  it("never mutates the input nodes", () => {
    const input = edgeNodes.map((x) => ({ ...x }));
    applyViewMode(input, containment, "sphere", DEFAULT_LAYOUT_PARAMS);
    expect(input.every((x) => x.x === 0 && x.y === 0 && x.z === 0)).toBe(true);
  });

  it("spreads nodes out in every projection", () => {
    for (const mode of ["sphere", "cone", "tree"] as const) {
      const out = applyViewMode(edgeNodes, containment, mode, DEFAULT_LAYOUT_PARAMS);
      const distinct = new Set(out.map((x) => `${x.x.toFixed(2)},${x.y.toFixed(2)},${x.z.toFixed(2)}`));
      expect(distinct.size, mode).toBe(out.length);
      expect(out.every((x) => Number.isFinite(x.x + x.y + x.z)), mode).toBe(true);
    }
  });

  it("flattens the tree view to a plane", () => {
    const out = applyViewMode(edgeNodes, containment, "tree", DEFAULT_LAYOUT_PARAMS);
    expect(out.every((x) => Math.abs(x.z) < 1e-9)).toBe(true);
  });

  it("scales the sphere with its parameter", () => {
    const small = applyViewMode(edgeNodes, containment, "sphere", {
      ...DEFAULT_LAYOUT_PARAMS,
      sphereScale: 0.5,
    });
    const big = applyViewMode(edgeNodes, containment, "sphere", {
      ...DEFAULT_LAYOUT_PARAMS,
      sphereScale: 2,
    });
    const spread = (ns: GraphNode[]) =>
      Math.max(...ns.map((x) => Math.hypot(x.x, x.y, x.z)));
    expect(spread(big)).toBeGreaterThan(spread(small));
  });

  it("separates nodes that share one slot", () => {
    /* Two symbols in the same file land on the same tree position. */
    const same = [n(1, "f1", "src/a.c"), n(2, "f2", "src/a.c")];
    const out = applyViewMode(same, [], "cone", DEFAULT_LAYOUT_PARAMS);
    expect(out[0].x === out[1].x && out[0].z === out[1].z).toBe(false);
  });
});

describe("computePathToRoot", () => {
  it("returns the ordered ancestor chain ending at the node", () => {
    const h = deriveHierarchy(edgeNodes, containment);
    expect(computePathToRoot(4, h)).toEqual([1, 2, 4]);
  });

  it("skips directory slots that hold no real node", () => {
    /* Path-derived trees have folder slots with no graph node of their own. */
    const h = deriveHierarchy(pathNodes, []);
    expect(computePathToRoot(10, h)).toEqual([10]);
  });

  it("returns empty for an unknown node", () => {
    const h = deriveHierarchy(edgeNodes, containment);
    expect(computePathToRoot(999, h)).toEqual([]);
  });
});

describe("computeCrumbs", () => {
  it("labels each level and carries its subtree", () => {
    const h = deriveHierarchy(edgeNodes, containment);
    const crumbs = computeCrumbs(4, h);
    expect(crumbs.map((c) => c.label)).toEqual(["root", "src", "main.c"]);
    /* The "src" level covers itself plus main.c. */
    expect(crumbs[1].subtreeIds.sort()).toEqual([2, 4]);
  });

  it("includes directory levels from a path-derived tree", () => {
    const h = deriveHierarchy(pathNodes, []);
    expect(computeCrumbs(10, h).map((c) => c.label)).toEqual(["docs", "guide", "a.md"]);
  });
});
