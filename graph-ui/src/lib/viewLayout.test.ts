import { describe, expect, it } from "vitest";
import {
  applyViewMode,
  computeCrumbs,
  computePathToRoot,
  computeReferenceForks,
  DEFAULT_LAYOUT_PARAMS,
  deriveHierarchy,
  sampleSpacing,
} from "./viewLayout";
import type { GraphEdge, GraphNode } from "./types";

const PROJECTIONS = ["sphere", "cone", "tree"] as const;

/* Median nearest-neighbour distance. The single number that decides whether a
 * projection is usable: node spheres are drawn at a radius comparable to the
 * layout's own spacing, so a layout that halves the spacing buries every node
 * inside its neighbour however tidy its aspect ratio looks. */
function medianSpacing(nodes: GraphNode[]): number {
  const ds: number[] = [];
  for (const p of nodes) {
    let best = Infinity;
    for (const q of nodes) {
      if (q === p) continue;
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (d < best) best = d;
    }
    if (best < Infinity) ds.push(Math.sqrt(best));
  }
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}

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
    for (const mode of PROJECTIONS) {
      const out = applyViewMode(edgeNodes, containment, mode, DEFAULT_LAYOUT_PARAMS);
      const distinct = new Set(out.map((x) => `${x.x.toFixed(2)},${x.y.toFixed(2)},${x.z.toFixed(2)}`));
      expect(distinct.size, mode).toBe(out.length);
      expect(out.every((x) => Number.isFinite(x.x + x.y + x.z)), mode).toBe(true);
    }
  });

  it("gives the organic tree real depth instead of flattening it", () => {
    /* The tidy tree it replaced was pinned to z=0, which is precisely why it
     * could not survive a wide corpus: 45k leaf rows and nowhere to put them but
     * one axis. The third dimension is where the breadth goes. */
    const { ns, es } = wide(40, 4);
    const out = applyViewMode(ns, es, "tree", DEFAULT_LAYOUT_PARAMS);
    const zs = out.map((x) => x.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0);
  });

  it("scales every projection with the spread parameter", () => {
    for (const mode of PROJECTIONS) {
      const at = (spread: number) =>
        Math.max(
          ...applyViewMode(edgeNodes, containment, mode, {
            ...DEFAULT_LAYOUT_PARAMS,
            spread,
          }).map((x) => Math.hypot(x.x, x.y, x.z)),
        );
      expect(at(2), mode).toBeGreaterThan(at(0.5));
    }
  });

  it("separates nodes that share one slot", () => {
    /* Two symbols in the same file land on the same tree position. */
    const same = [n(1, "f1", "src/a.c"), n(2, "f2", "src/a.c")];
    const out = applyViewMode(same, [], "cone", DEFAULT_LAYOUT_PARAMS);
    expect(out[0].x === out[1].x && out[0].z === out[1].z).toBe(false);
  });
});

/* A wide, shallow corpus — the shape that broke every projection. p4 is ~47k
 * nodes over 8 depths, so tens of thousands of siblings share one level. */
function wide(files: number, perFile: number) {
  const ns: GraphNode[] = [n(1, "root", "root")];
  const es: GraphEdge[] = [];
  let id = 2;
  for (let f = 0; f < files; f++) {
    const file = id++;
    ns.push(n(file, `f${f}.c`, `root/f${f}.c`));
    es.push({ source: 1, target: file, type: "CONTAINS_FILE" });
    for (let sym = 0; sym < perFile; sym++) {
      const s2 = id++;
      ns.push(n(s2, `fn${f}_${sym}`, `root/f${f}.c`));
      es.push({ source: file, target: s2, type: "DEFINES" });
    }
  }
  /* Give the input a definite spacing for the projections to inherit. */
  let seed = 7;
  for (const node of ns) {
    for (const axis of ["x", "y", "z"] as const) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      node[axis] = (seed / 0x7fffffff - 0.5) * 1000;
    }
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

describe("layout proportions at scale", () => {
  it("keeps every projection within a sane aspect ratio on a wide corpus", () => {
    /* The tidy tree used a fixed 18-unit row gap, so 47k leaves made it 846,000
     * units tall against 1,520 wide — 557:1, which rendered as a vertical line. */
    const { ns, es } = wide(150, 8);
    for (const mode of PROJECTIONS) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const nonZero = spans(out).filter((v) => v > 1e-6);
      const aspect = Math.max(...nonZero) / Math.min(...nonZero);
      expect(aspect, `${mode} aspect ratio`).toBeLessThan(6);
    }
  });

  it("preserves the source layout's node spacing", () => {
    /* THE regression that mattered, and the one a correct aspect ratio hid. Every
     * projection previously passed the aspect check while packing nodes 3–90×
     * tighter than the layout they came from — because they were scaled to match
     * the source's outer *extent*, and a force layout fills its volume where a
     * projection piles onto shells. Density is what has to transfer. */
    const { ns, es } = wide(120, 6);
    const target = sampleSpacing(ns);
    for (const mode of PROJECTIONS) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const got = medianSpacing(out);
      expect(got / target, `${mode} spacing ratio`).toBeGreaterThan(0.6);
      expect(got / target, `${mode} spacing ratio`).toBeLessThan(1.8);
    }
  });

  it("stays inside a usable camera range", () => {
    /* Reserving a bounding sphere per child compounded by √n at every level and
     * produced a cone 325,000,000 units across and a tree of 1.7e9 — geometrically
     * valid, entirely outside the far plane. */
    const { ns, es } = wide(120, 6);
    for (const mode of PROJECTIONS) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      expect(Math.max(...spans(out)), `${mode} extent`).toBeLessThan(100_000);
    }
  });

  it("nests children inside their own parent's cluster", () => {
    /* The sub-clustering ask: a folder should read as its own sphere/cone, not as
     * scattered points on one global shell. Siblings must therefore sit closer to
     * each other than two nodes drawn from different parents. */
    const { ns, es } = wide(30, 8);
    for (const mode of PROJECTIONS) {
      const out = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const by = new Map(out.map((v) => [v.id, v]));
      const h = deriveHierarchy(ns, es);
      const groups = new Map<number, GraphNode[]>();
      for (const node of ns) {
        const slot = h.slotOf.get(node.id);
        const parent = slot?.parent;
        if (!parent) continue;
        /* Key on the parent slot's first node id — the file each symbol sits in. */
        const key = parent.ids[0];
        if (key === undefined) continue;
        const list = groups.get(key);
        if (list) list.push(by.get(node.id)!);
        else groups.set(key, [by.get(node.id)!]);
      }
      const families = [...groups.values()].filter((g) => g.length > 2).slice(0, 6);
      expect(families.length, `${mode} families`).toBeGreaterThan(1);

      const within = (g: GraphNode[]) => {
        let sum = 0, count = 0;
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            sum += Math.hypot(g[i].x - g[j].x, g[i].y - g[j].y, g[i].z - g[j].z);
            count++;
          }
        }
        return sum / count;
      };
      const across = (a: GraphNode[], b: GraphNode[]) =>
        Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y, a[0].z - b[0].z);

      const meanWithin =
        families.reduce((acc, g) => acc + within(g), 0) / families.length;
      let sum = 0, count = 0;
      for (let i = 0; i < families.length; i++) {
        for (let j = i + 1; j < families.length; j++) {
          sum += across(families[i], families[j]);
          count++;
        }
      }
      expect(meanWithin, `${mode} clustering`).toBeLessThan(sum / count);
    }
  });

  it("is deterministic — the same graph projects identically twice", () => {
    /* Cluster shapes and phases are hash-derived rather than random, so toggling a
     * filter cannot reshuffle the whole map. */
    const { ns, es } = wide(20, 5);
    for (const mode of PROJECTIONS) {
      const a = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      const b = applyViewMode(ns, es, mode, DEFAULT_LAYOUT_PARAMS);
      expect(a.map((v) => `${v.x},${v.y},${v.z}`), mode).toEqual(
        b.map((v) => `${v.x},${v.y},${v.z}`),
      );
    }
  });
});

describe("organic tree leaf clusters", () => {
  /* A file's symbols are an all-leaf cluster, which is what gets a shape. */
  function leafCluster(files = 6, perFile = 14) {
    return wide(files, perFile);
  }

  it("lays a flower out as a flat rosette", () => {
    const { ns, es } = leafCluster();
    const out = applyViewMode(ns, es, "tree", {
      ...DEFAULT_LAYOUT_PARAMS,
      leafShape: "flower",
    });
    const h = deriveHierarchy(ns, es);
    const by = new Map(out.map((v) => [v.id, v]));
    /* Group the leaves of one file and check they are close to coplanar: the
     * thinnest principal spread should be far smaller than the widest. */
    const file = ns.find((v) => v.name === "f0.c")!;
    const slot = h.slotOf.get(file.id)!;
    const petals = slot.children.map((c) => by.get(c.ids[0])!).filter(Boolean);
    expect(petals.length).toBeGreaterThan(6);

    const cx = petals.reduce((a, v) => a + v.x, 0) / petals.length;
    const cy = petals.reduce((a, v) => a + v.y, 0) / petals.length;
    const cz = petals.reduce((a, v) => a + v.z, 0) / petals.length;
    /* Radius vs the RMS distance from the best-fit plane, approximated by the
     * smallest axis-aligned spread after centring. */
    const spreadOf = (f: (v: GraphNode) => number) =>
      Math.sqrt(petals.reduce((a, v) => a + f(v) ** 2, 0) / petals.length);
    const sx = spreadOf((v) => v.x - cx);
    const sy = spreadOf((v) => v.y - cy);
    const sz = spreadOf((v) => v.z - cz);
    const thin = Math.min(sx, sy, sz);
    const wide_ = Math.max(sx, sy, sz);
    expect(thin / wide_).toBeLessThan(0.6);
  });

  it("gives a bulb genuine volume in all three axes", () => {
    const { ns, es } = leafCluster();
    const out = applyViewMode(ns, es, "tree", {
      ...DEFAULT_LAYOUT_PARAMS,
      leafShape: "bulb",
    });
    const nonZero = spans(out).filter((v) => v > 1e-6);
    expect(nonZero).toHaveLength(3);
  });

  it("produces a mix of shapes on auto and one shape when pinned", () => {
    const { ns, es } = leafCluster(24, 12);
    const auto = applyViewMode(ns, es, "tree", DEFAULT_LAYOUT_PARAMS);
    const pinned = applyViewMode(ns, es, "tree", {
      ...DEFAULT_LAYOUT_PARAMS,
      leafShape: "bulb",
    });
    const key = (a: GraphNode[]) => a.map((v) => v.x.toFixed(3)).join(",");
    expect(key(auto)).not.toEqual(key(pinned));
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
