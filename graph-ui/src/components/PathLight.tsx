import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GraphNode } from "../lib/types";
import type { PathLightStyle } from "../lib/viewSettings";

interface PathLightProps {
  /** Ordered node ids, outermost ancestor → selected node. */
  path: number[];
  nodes: GraphNode[];
  color: string;
  style: PathLightStyle;
  /** Travel speed multiplier. */
  speed: number;
}

/* Sprite so the light reads as a glowing point rather than a flat disc; the
 * bloom pass picks up the bright center. Built once, shared by every head. */
let sprite: THREE.CanvasTexture | null = null;
function glowSprite(): THREE.CanvasTexture {
  if (sprite) return sprite;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sprite = new THREE.CanvasTexture(canvas);
  return sprite;
}

const TRAIL = 7; /* comet: head + tail samples */
const DOTS = 5; /* dots: evenly spaced markers */

/* A light running the containment chain from the corpus root down to the
 * selected node. Ported from the Astra static map's path light: it accelerates
 * at every level it passes, so a deeply nested selection reads as "far away"
 * without needing a distance label.
 *
 * The chain is walked in *world* space each frame rather than baked into
 * geometry, so it keeps working when the view mode reprojects every node. */
export function PathLight({ path, nodes, color, style, speed }: PathLightProps) {
  const headsRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  /* Chain positions + cumulative arc length, so the head moves at a constant
   * world speed instead of lurching across long segments. */
  const chain = useMemo(() => {
    const byId = new Map<number, GraphNode>();
    for (const n of nodes) byId.set(n.id, n);
    const pts: THREE.Vector3[] = [];
    for (const id of path) {
      const n = byId.get(id);
      if (n) pts.push(new THREE.Vector3(n.x, n.y, n.z));
    }
    if (pts.length < 2) return null;

    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].distanceTo(pts[i - 1]);
      seg.push(d);
      total += d;
    }
    return { pts, seg, total };
  }, [path, nodes]);

  const count = style === "comet" ? TRAIL : DOTS;
  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  /* Position for a normalized progress u ∈ [0,1] along the chain, plus the
   * depth index reached — the accelerator reads that. */
  const sample = (u: number, out: THREE.Vector3): number => {
    if (!chain) return 0;
    let want = Math.max(0, Math.min(1, u)) * chain.total;
    for (let i = 0; i < chain.seg.length; i++) {
      if (want <= chain.seg[i] || i === chain.seg.length - 1) {
        const f = chain.seg[i] > 0 ? Math.max(0, Math.min(1, want / chain.seg[i])) : 0;
        out.copy(chain.pts[i]).lerp(chain.pts[i + 1], f);
        return i;
      }
      want -= chain.seg[i];
    }
    return 0;
  };

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!chain || !headsRef.current) return;

    /* Base pace covers the chain in ~1.6s at 1× and gains speed with each level
     * already passed, matching the static map's ring acceleration. */
    const reached = sample(t.current, tmp);
    const accel = 1 + reached * 0.35;
    t.current += delta * 0.62 * speed * accel;
    if (t.current > 1.25) t.current = 0; /* brief dark gap, then run again */

    const children = headsRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as THREE.Sprite;
      /* Comet: a tight trail behind one head. Dots: markers spread over the
       * whole chain, all drifting together. */
      const u =
        style === "comet"
          ? t.current - i * 0.035
          : (t.current + i / count) % 1;
      if (u < 0 || u > 1) {
        child.visible = false;
        continue;
      }
      child.visible = true;
      sample(u, tmp);
      child.position.copy(tmp);
      const fade = style === "comet" ? 1 - i / count : 0.85;
      const scale = (style === "comet" ? 26 - i * 2.2 : 18) * (0.6 + fade * 0.4);
      child.scale.setScalar(Math.max(4, scale));
      const mat = child.material as THREE.SpriteMaterial;
      mat.opacity = fade * 0.9;
    }
  });

  if (!chain) return null;

  return (
    <group ref={headsRef}>
      {Array.from({ length: count }, (_, i) => (
        <sprite key={i}>
          <spriteMaterial
            map={glowSprite()}
            color={threeColor}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
