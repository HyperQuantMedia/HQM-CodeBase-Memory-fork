import { describe, expect, it } from "vitest";
import {
  applyViewMode,
  computeCrumbs,
  computePathToRoot,
  computeReferenceForks,
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

describe("layout proportions at scale", () => {
  /* A wide, shallow corpus — the shape that broke every projection. p4 is ~47k
   * nodes over 4-8 depths, so tens of thousands of siblings share one level. */
  function wide(files: number, perFile: number) {
    const ns: GraphNode[] = [n(1, "root", "root")];
    const es: GraphEdge[] = [];
    let id = 2;
    for (let f = 0; f < files; f++) {
      const file = id++;
      ns.push(n(file, `f${f}.c`, `root/f${f}.c`));
      es.push({ source: 1, target: file, type: "CONTAINS_FILE" });
      for (let s = 0; s < perFile; s++) {
        const sym = id++;
        ns.push(n(sym, `fn${f}_${s}`, `root/f${f}.c`));
        es.push({ source: file, target: sym, type: "DEFINES" });
      }
    }
    /* Give the input a definite extent for fitToExtent to match. */
    let seed = 7;
    for (const node of ns) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      node.x = (seed / 0x7fffffff - 0.5) * 1000;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      node.y = (seed / 0x7fffffff - 0.5) * 1000;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      node.z = (seed / 0x7fffffff - 0.5) * 1000;
    }
    return { ns, es };
  }

  function spans(ns: GraphNode[]) {
    const xs = ns.map((v) => v.x);
    const ys = ns.map((v) => v.y);
    const zs = ns.map((v) => v.z);
    return [
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs),
    ];
  }

  it("keeps every projection within a sane aspect ratio on a wide corpus", () => {
    /* The tidy tree used a fixed 18-unit row gap, so 47k leaves made it 846,000
     * units tall against 1,520 wide — 557:1, which rendered as a vertical line. */
    const { ns, es } = wide(700, 12);
    for (const mode of ["sphere", "cone", "tree"] as const) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const nonZero = spans(out).filter((s) => s > 1e-6);
      const aspect = Math.max(...nonZero) / Math.min(...nonZero);
      expect(aspect, `${mode} aspect ratio`).toBeLessThan(6);
    }
  });

  it("matches the extent the camera is already framed for", () => {
    /* A projection sized from depth alone landed at a different scale than the
     * server layout, so switching view showed a speck or a clipped mess. */
    const { ns, es } = wide(300, 8);
    const before = Math.max(...spans(ns));
    for (const mode of ["sphere", "cone", "tree"] as const) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const after = Math.max(...spans(out));
      expect(after / before, `${mode} extent ratio`).toBeGreaterThan(0.5);
      expect(after / before, `${mode} extent ratio`).toBeLessThan(3);
    }
  });

  it("spreads a depth level into a band instead of one circle", () => {
    /* Latitude straight from an integer depth put thousands of nodes on a
     * razor-thin ring; they overlapped into a wireframe. Siblings must occupy
     * distinct distances from the sphere's axis. */
    const { ns, es } = wide(200, 10);
    const out = applyViewMode(ns, es, "sphere", DEFAULT_LAYOUT_PARAMS);
    const h = deriveHierarchy(ns, es);
    const byId = new Map(out.map((v) => [v.id, v]));
    const deepest = [...h.slotOf.entries()].filter(
      ([, s]) => s.depth === h.maxDepth,
    );
    const radii = new Set(
      deepest.map(([id]) => {
        const v = byId.get(id)!;
        return Math.hypot(v.x, v.z).toFixed(1);
      }),
    );
    expect(radii.size).toBeGreaterThan(5);
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

describe("computeReferenceForks", () => {
  /* The light travelled the containment chain and stopped. The fork half — the
   * split along the selection's own references — was missing, so selecting a node
   * never lit what it actually relates to. */
  const refs: GraphEdge[] = [
    { source: 2, target: 3, type: "DEFINES" }, /* containment: the chain itself */
    { source: 3, target: 7, type: "CALLS" },
    { source: 8, target: 3, type: "USAGE" },
    { source: 3, target: 9, type: "IMPORTS" },
  ];

  it("returns references in both directions", () => {
    expect(computeReferenceForks(3, refs).sort()).toEqual([7, 8, 9]);
  });

  it("excludes the containment chain the light just travelled", () => {
    expect(computeReferenceForks(3, refs)).not.toContain(2);
  });

  it("dedupes and caps the fan-out", () => {
    const many: GraphEdge[] = [];
    for (let i = 100; i < 140; i++) many.push({ source: 3, target: i, type: "CALLS" });
    many.push({ source: 3, target: 100, type: "USAGE" }); /* duplicate target */
    const out = computeReferenceForks(3, many, 5);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
  });

  it("returns nothing for a node with no references", () => {
    expect(computeReferenceForks(42, refs)).toEqual([]);
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
