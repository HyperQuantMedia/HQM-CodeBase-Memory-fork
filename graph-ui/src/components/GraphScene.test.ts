import { describe, expect, it } from "vitest";
import { GRAPH_CANVAS_DPR, computeCameraTarget } from "./GraphScene";
import type { GraphNode } from "../lib/types";

function n(id: number, x: number, y: number, z: number): GraphNode {
  return { id, x, y, z, label: "File", name: `n${id}`, size: 3, color: "#fff" };
}

describe("GraphScene render limits", () => {
  it("caps the high-DPI WebGL backing store below the MSAA failure range", () => {
    expect(GRAPH_CANVAS_DPR[0]).toBe(1);
    expect(GRAPH_CANVAS_DPR[1]).toBeLessThanOrEqual(1.5);
  });
});

describe("computeCameraTarget", () => {
  it("returns null for an empty or unmatched selection", () => {
    expect(computeCameraTarget([], new Set([1]))).toBeNull();
    expect(computeCameraTarget([n(1, 0, 0, 0)], new Set())).toBeNull();
    expect(computeCameraTarget([n(1, 0, 0, 0)], new Set([99]))).toBeNull();
  });

  it("looks at the centroid of the selection, ignoring everything else", () => {
    const nodes = [n(1, 0, 0, 0), n(2, 100, 0, 0), n(3, 9000, 9000, 9000)];
    const t = computeCameraTarget(nodes, new Set([1, 2]))!;
    expect(t.lookAt.x).toBeCloseTo(50);
    expect(t.lookAt.y).toBeCloseTo(0);
  });

  it("frames a large selection proportionally rather than by a fixed multiple", () => {
    /* The bug this pins: distance used to be spread × a constant, which
     * over-framed a big selection so badly that clicking a breadcrumb ancestor
     * covering thousands of nodes landed on roughly the view already showing —
     * the click read as a no-op. Distance must scale with the selection's radius. */
    const small = [n(1, 0, 0, 0), n(2, 100, 0, 0)];
    const big = [n(1, 0, 0, 0), n(2, 4000, 0, 0)];
    const dSmall = computeCameraTarget(small, new Set([1, 2]))!.position.distanceTo(
      computeCameraTarget(small, new Set([1, 2]))!.lookAt,
    );
    const dBig = computeCameraTarget(big, new Set([1, 2]))!.position.distanceTo(
      computeCameraTarget(big, new Set([1, 2]))!.lookAt,
    );
    expect(dBig / dSmall).toBeGreaterThan(10);
  });

  it("keeps a single node at a sane distance instead of inside it", () => {
    const t = computeCameraTarget([n(1, 5, 5, 5)], new Set([1]))!;
    const d = t.position.distanceTo(t.lookAt);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(1000);
  });

  it("pulls back for a narrower field of view", () => {
    /* Fitting to the frame means the distance depends on the lens. */
    const nodes = [n(1, 0, 0, 0), n(2, 800, 0, 0)];
    const ids = new Set([1, 2]);
    const wide = computeCameraTarget(nodes, ids, 90)!;
    const narrow = computeCameraTarget(nodes, ids, 25)!;
    expect(narrow.position.distanceTo(narrow.lookAt)).toBeGreaterThan(
      wide.position.distanceTo(wide.lookAt),
    );
  });
});
