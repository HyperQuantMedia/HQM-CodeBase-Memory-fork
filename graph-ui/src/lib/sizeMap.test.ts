import { describe, expect, it } from "vitest";
import {
  buildSizeTree,
  findSizeNode,
  formatBytes,
  sizeCrumbs,
  squarify,
  type FileSize,
  type SizeNode,
} from "./sizeMap";

const FILES: FileSize[] = [
  { path: "src/engine/render.cpp", bytes: 40_000 },
  { path: "src/engine/render.h", bytes: 4_000 },
  { path: "src/math/vec4.cpp", bytes: 12_000 },
  { path: "docs/guide.md", bytes: 8_000 },
  { path: "README.md", bytes: 1_000 },
];

function leafNames(node: SizeNode): string[] {
  if (node.children.length === 0) return [node.name];
  return node.children.flatMap(leafNames);
}

describe("buildSizeTree", () => {
  it("nests by path and sums folder sizes from their contents", () => {
    /* A directory's own size on disk is not what anyone means by "how big is
     * src/" — it has to be the total of what it holds. */
    const root = buildSizeTree(FILES, "proj");
    expect(root.bytes).toBe(65_000);
    expect(root.fileCount).toBe(5);

    const src = findSizeNode(root, "src")!;
    expect(src.bytes).toBe(56_000);
    expect(src.fileCount).toBe(3);
    expect(findSizeNode(root, "src/engine")!.bytes).toBe(44_000);
  });

  it("orders children largest first, which the packing assumes", () => {
    const root = buildSizeTree(FILES, "proj");
    expect(root.children.map((c) => c.name)).toEqual(["src", "docs", "README.md"]);
  });

  it("records depth and full paths", () => {
    const root = buildSizeTree(FILES, "proj");
    const leaf = findSizeNode(root, "src/engine/render.cpp")!;
    expect(leaf.depth).toBe(3);
    expect(leaf.path).toBe("src/engine/render.cpp");
    expect(leaf.children).toEqual([]);
  });

  it("normalises Windows separators and leading slashes", () => {
    const root = buildSizeTree(
      [{ path: "\\\\a\\\\b.txt", bytes: 10 }, { path: "/a/c.txt", bytes: 20 }],
      "p",
    );
    expect(findSizeNode(root, "a")!.bytes).toBe(30);
    expect(leafNames(root).sort()).toEqual(["b.txt", "c.txt"]);
  });

  it("ignores zero-byte and empty-path entries rather than drawing nothing", () => {
    const root = buildSizeTree(
      [{ path: "a.txt", bytes: 0 }, { path: "", bytes: 50 }, { path: "b.txt", bytes: 5 }],
      "p",
    );
    expect(root.fileCount).toBe(1);
    expect(root.bytes).toBe(5);
  });

  it("adds a repeated path once per occurrence instead of duplicating the node", () => {
    const root = buildSizeTree(
      [{ path: "a.txt", bytes: 5 }, { path: "a.txt", bytes: 7 }],
      "p",
    );
    expect(root.children).toHaveLength(1);
    expect(root.bytes).toBe(12);
  });

  it("handles an empty corpus", () => {
    const root = buildSizeTree([], "p");
    expect(root.bytes).toBe(0);
    expect(root.children).toEqual([]);
  });
});

describe("findSizeNode / sizeCrumbs", () => {
  const root = buildSizeTree(FILES, "proj");

  it("returns the root for an empty path", () => {
    expect(findSizeNode(root, "")).toBe(root);
  });

  it("returns null for a path that is not there", () => {
    expect(findSizeNode(root, "src/nope")).toBeNull();
  });

  it("builds the ancestor chain inclusive of both ends", () => {
    expect(sizeCrumbs(root, "src/engine").map((c) => c.name)).toEqual([
      "proj",
      "src",
      "engine",
    ]);
  });

  it("stops at the last real segment of a broken path", () => {
    expect(sizeCrumbs(root, "src/ghost/deeper").map((c) => c.name)).toEqual([
      "proj",
      "src",
    ]);
  });
});

describe("squarify", () => {
  const root = buildSizeTree(FILES, "proj");

  it("fills the rectangle without overflowing it", () => {
    const { tiles } = squarify(root.children, 0, 0, 400, 300);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(400 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(300 + 1e-6);
    }
  });

  it("gives each tile an area proportional to its bytes", () => {
    const { tiles } = squarify(root.children, 0, 0, 400, 300);
    const total = root.children.reduce((a, c) => a + c.bytes, 0);
    const area = 400 * 300;
    for (const t of tiles) {
      expect(t.w * t.h).toBeCloseTo((t.node.bytes / total) * area, 0);
    }
  });

  it("keeps tiles roughly square rather than producing slivers", () => {
    /* The reason for squarified rather than slice-and-dice: source trees routinely
     * have one child dwarfing its siblings, which alternating axes turns into
     * unreadable ribbons. Aspect ratios must stay comparable by eye. */
    const lopsided = buildSizeTree(
      [
        { path: "huge/a", bytes: 1_000_000 },
        ...Array.from({ length: 12 }, (_, i) => ({ path: `small${i}/x`, bytes: 8_000 })),
      ],
      "p",
    );
    const { tiles } = squarify(lopsided.children, 0, 0, 600, 400);
    const worst = Math.max(...tiles.map((t) => Math.max(t.w / t.h, t.h / t.w)));
    expect(worst).toBeLessThan(12);
  });

  it("drops tiles too small to see and says how many", () => {
    /* A corpus has a long tail of tiny files. Drawing them costs everything and
     * shows nothing — but dropping them silently would make the map read as
     * complete when it is not, so the count comes back to the caller. */
    const tail = buildSizeTree(
      [
        { path: "big/a", bytes: 1_000_000 },
        ...Array.from({ length: 200 }, (_, i) => ({ path: `t${i}`, bytes: 1 })),
      ],
      "p",
    );
    const { tiles, omitted } = squarify(tail.children, 0, 0, 300, 200, 12);
    expect(omitted).toBeGreaterThan(150);
    expect(tiles.length).toBeLessThan(50);
  });

  it("returns nothing for a degenerate rectangle or empty input", () => {
    expect(squarify(root.children, 0, 0, 0, 300).tiles).toEqual([]);
    expect(squarify(root.children, 0, 0, 400, -5).tiles).toEqual([]);
    expect(squarify([], 0, 0, 400, 300).tiles).toEqual([]);
  });

  it("does not overlap tiles", () => {
    const { tiles } = squarify(root.children, 0, 0, 400, 300);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i];
        const b = tiles[j];
        const disjoint =
          a.x + a.w <= b.x + 1e-6 ||
          b.x + b.w <= a.x + 1e-6 ||
          a.y + a.h <= b.y + 1e-6 ||
          b.y + b.h <= a.y + 1e-6;
        expect(disjoint, `${a.node.name} vs ${b.node.name}`).toBe(true);
      }
    }
  });

  it("respects the origin it is given, for drilling into a sub-rectangle", () => {
    const { tiles } = squarify(root.children, 50, 20, 200, 100);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(50 - 1e-6);
      expect(t.y).toBeGreaterThanOrEqual(20 - 1e-6);
    }
  });
});

describe("formatBytes", () => {
  it("scales the unit and the precision together", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(20 * 1024)).toBe("20.0 KB");
    expect(formatBytes(500 * 1024)).toBe("500 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("does not produce NaN for junk", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
