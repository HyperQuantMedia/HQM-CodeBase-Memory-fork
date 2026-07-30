import { useMemo } from "react";
import * as THREE from "three";
import type { GraphNode, GraphEdge } from "../lib/types";
import { edgeIntensityScale, edgeCurveSegments } from "../lib/density";
import {
  compositeOver,
  edgeAlphaForLight,
  inkEdge,
  type Stage,
} from "../lib/sceneInk";

interface EdgeLinesProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedIds: Set<number> | null;
  opacity?: number;
  /* User edge-brightness multiplier (see DisplaySettings). Layered on top of
   * the automatic density scale. */
  brightness?: number;
  /* How far each link bows away from its straight chord, 0–1. */
  curve?: number;
  /* Emission on darkness vs ink on paper — see lib/sceneInk.ts. */
  stage?: Stage;
  /* Canvas colour, needed on the light stage to composite line alpha. */
  background?: string;
  /* When set, edge.target is looked up in this array instead of `nodes`.
   * Used for cross-galaxy edges where source lives in the primary graph
   * and target lives in a linked project's offset-adjusted nodes. */
  targetNodes?: GraphNode[];
}

function getClusterKey(fp?: string): string {
  if (!fp) return "";
  const parts = fp.split("/");
  return parts.slice(0, Math.min(2, parts.length)).join("/");
}

/* Edge type → color (matches the filter panel) */
const EDGE_TYPE_COLORS: Record<string, string> = {
  CALLS: "#1DA27E",
  IMPORTS: "#3b82f6",
  DEFINES: "#a855f7",
  DEFINES_METHOD: "#a855f7",
  CONTAINS_FILE: "#22c55e",
  CONTAINS_FOLDER: "#22c55e",
  CONTAINS_PACKAGE: "#22c55e",
  HANDLES: "#eab308",
  IMPLEMENTS: "#f97316",
  HTTP_CALLS: "#e11d48",
  ASYNC_CALLS: "#ec4899",
  GRPC_CALLS: "#f59e0b",
  GRAPHQL_CALLS: "#e879f9",
  TRPC_CALLS: "#a78bfa",
  CROSS_HTTP_CALLS: "#fb923c",
  CROSS_ASYNC_CALLS: "#fb7185",
  CROSS_GRPC_CALLS: "#fbbf24",
  CROSS_GRAPHQL_CALLS: "#f0abfc",
  CROSS_TRPC_CALLS: "#c4b5fd",
  CROSS_CHANNEL: "#fdba74",
  MEMBER_OF: "#64748b",
  TESTS_FILE: "#06b6d4",
};

const DEFAULT_EDGE_COLOR = "#1C8585";

/* Colour cache: a 166k-edge graph resolves ~20 distinct strings, so parsing one
 * THREE.Color per edge was pure waste. */
function colorTable(stage: Stage): Map<string, [number, number, number]> {
  const table = new Map<string, [number, number, number]>();
  const tmp = new THREE.Color();
  for (const [type, hex] of Object.entries(EDGE_TYPE_COLORS)) {
    tmp.set(hex);
    table.set(
      type,
      stage === "light" ? inkEdge(tmp.r, tmp.g, tmp.b) : [tmp.r, tmp.g, tmp.b],
    );
  }
  tmp.set(DEFAULT_EDGE_COLOR);
  table.set(
    "",
    stage === "light" ? inkEdge(tmp.r, tmp.g, tmp.b) : [tmp.r, tmp.g, tmp.b],
  );
  return table;
}

export function EdgeLines({
  nodes,
  edges,
  highlightedIds,
  opacity = 1.0,
  brightness = 1.0,
  curve = 0,
  stage = "dark",
  background = "#06090f",
  targetNodes,
}: EdgeLinesProps) {
  const geometry = useMemo(() => {
    /* Shrink per-edge glow as the edge count grows so the additively-blended
     * center doesn't saturate to white; the user multiplier rides on top. */
    const densityScale = edgeIntensityScale(edges.length) * brightness;
    const light = stage === "light";
    const table = colorTable(stage);
    const bgColor = new THREE.Color(background);
    const bg: [number, number, number] = [bgColor.r, bgColor.g, bgColor.b];

    /* Subdivisions per edge. 1 means a straight chord — the original two-vertex
     * form — so the un-curved path costs exactly what it always did. */
    const segments =
      curve > 0 ? edgeCurveSegments(edges.length) : 1;
    const vertsPerEdge = segments * 2;

    const srcMap = new Map<number, number>();
    for (let i = 0; i < nodes.length; i++) {
      srcMap.set(nodes[i].id, i);
    }
    const tgtArr = targetNodes ?? nodes;
    const tgtMap = targetNodes ? new Map<number, number>() : srcMap;
    if (targetNodes) {
      for (let i = 0; i < targetNodes.length; i++) {
        tgtMap.set(targetNodes[i].id, i);
      }
    }

    const hasHighlight = highlightedIds && highlightedIds.size > 0;
    const positions = new Float32Array(edges.length * vertsPerEdge * 3);
    const colors = new Float32Array(edges.length * vertsPerEdge * 3);
    let vertex = 0;

    /* Scratch, reused per edge — no allocation in the hot loop. */
    const ctrl = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    for (const edge of edges) {
      const si = srcMap.get(edge.source);
      const ti = tgtMap.get(edge.target);
      if (si === undefined || ti === undefined) continue;

      const s = nodes[si];
      const t = tgtArr[ti];

      const sHL = !hasHighlight || highlightedIds.has(s.id);
      const tHL = !hasHighlight || highlightedIds.has(t.id);
      if (hasHighlight && !sHL && !tHL) continue;

      const sameCluster =
        getClusterKey(s.file_path) === getClusterKey(t.file_path);

      /* Intensity based on cluster membership and highlight.
       * With additive blending + dark background, these glow nicely. */
      let intensity = sameCluster ? 0.25 : 0.06;
      if (hasHighlight) {
        /* A selection stays at full strength (never density-scaled) so it
         * pops against the dimmed rest; only the un-selected bulk is scaled. */
        intensity = sHL && tHL ? 0.5 : 0.04 * densityScale;
      } else {
        intensity *= densityScale;
      }

      const base = table.get(edge.type) ?? table.get("")!;
      let cr: number, cg: number, cb: number;
      if (light) {
        const [r, g, bl] = compositeOver(base, edgeAlphaForLight(intensity), bg);
        cr = r; cg = g; cb = bl;
      } else {
        cr = base[0] * intensity;
        cg = base[1] * intensity;
        cb = base[2] * intensity;
      }

      if (segments === 1) {
        const off = vertex * 3;
        positions[off] = s.x;
        positions[off + 1] = s.y;
        positions[off + 2] = s.z;
        positions[off + 3] = t.x;
        positions[off + 4] = t.y;
        positions[off + 5] = t.z;
        for (let k = 0; k < 2; k++) {
          colors[off + k * 3] = cr;
          colors[off + k * 3 + 1] = cg;
          colors[off + k * 3 + 2] = cb;
        }
        vertex += 2;
        continue;
      }

      /* Quadratic Bézier with the control point pushed radially outward from the
       * Y axis. Outward (rather than a fixed axis) is what makes the bow read as
       * a branch: in a nested or hierarchical layout, links run inward toward a
       * parent, so bowing away from the centre arcs them the way a limb leaves a
       * trunk. Straight chords through the middle are what made these views look
       * like wire diagrams. */
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const mz = (s.z + t.z) / 2;
      const radial = Math.hypot(mx, mz);
      const len = Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z);
      const bow = len * curve * 0.28;
      if (radial > 1e-4) {
        ctrl.set(mx + (mx / radial) * bow, my + bow * 0.25, mz + (mz / radial) * bow);
      } else {
        /* On the axis there is no outward direction — lift instead. */
        ctrl.set(mx, my + bow, mz);
      }

      a.set(s.x, s.y, s.z);
      for (let k = 1; k <= segments; k++) {
        const u = k / segments;
        const iu = 1 - u;
        b.set(
          iu * iu * s.x + 2 * iu * u * ctrl.x + u * u * t.x,
          iu * iu * s.y + 2 * iu * u * ctrl.y + u * u * t.y,
          iu * iu * s.z + 2 * iu * u * ctrl.z + u * u * t.z,
        );
        const off = vertex * 3;
        positions[off] = a.x;
        positions[off + 1] = a.y;
        positions[off + 2] = a.z;
        positions[off + 3] = b.x;
        positions[off + 4] = b.y;
        positions[off + 5] = b.z;
        for (let c = 0; c < 2; c++) {
          colors[off + c * 3] = cr;
          colors[off + c * 3 + 1] = cg;
          colors[off + c * 3 + 2] = cb;
        }
        vertex += 2;
        a.copy(b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions.slice(0, vertex * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(colors.slice(0, vertex * 3), 3),
    );
    return geo;
  }, [nodes, edges, highlightedIds, targetNodes, brightness, curve, stage, background]);

  const light = stage === "light";
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        /* Additive accumulates glow on black and is a no-op on white — the light
         * stage pre-composites its alpha instead (see lib/sceneInk.ts). */
        blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}
