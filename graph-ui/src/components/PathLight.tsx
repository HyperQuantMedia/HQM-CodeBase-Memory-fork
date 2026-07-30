import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GraphNode } from "../lib/types";
import type { PathLightStyle } from "../lib/viewSettings";

interface PathLightProps {
  /** Ordered node ids, outermost ancestor → selected node. */
  path: number[];
  /** Neighbours the light forks out to once it reaches the selection. */
  forks?: number[];
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
const MAX_FORKS = 12;
/* Fork phase length, in the same units as the 0→1 chain run. */
const FORK_SPAN = 0.55;
/* Dark beat before the cycle restarts. */
const REST = 0.25;

/* A light running the containment chain from the corpus root down to the
 * selected node, then forking along that node's references.
 *
 * Ported from the Astra static map: the light accelerates at every level it
 * passes (so a deeply nested selection reads as "far away" without a label) and
 * then splits along the node's links. The fork half was missing — the light
 * arrived at the selection and stopped, so a node's actual relationships never
 * lit up, which is the interesting part of selecting it.
 *
 * The chain is walked in *world* space each frame rather than baked into
 * geometry, so it keeps working when the view mode reprojects every node. */
export function PathLight({
  path,
  forks = [],
  nodes,
  color,
  style,
  speed,
}: PathLightProps) {
  const chainRef = useRef<THREE.Group>(null);
  const forkRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  const byId = useMemo(() => {
    const m = new Map<number, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  /* Chain positions + per-segment lengths, so the head moves at a constant world
   * speed instead of lurching across long segments. */
  const chain = useMemo(() => {
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
  }, [path, byId]);

  /* Where each fork runs: from the selection out to a neighbour. */
  const forkLines = useMemo(() => {
    const origin = chain?.pts[chain.pts.length - 1];
    if (!origin) return [];
    const out: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    for (const id of forks.slice(0, MAX_FORKS)) {
      const n = byId.get(id);
      if (!n) continue;
      out.push({ from: origin, to: new THREE.Vector3(n.x, n.y, n.z) });
    }
    return out;
  }, [forks, byId, chain]);

  const chainCount = style === "comet" ? TRAIL : DOTS;
  const threeColor = useMemo(() => new THREE.Color(color), [color]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  /* Position for a normalized progress u ∈ [0,1] along the chain; returns the
   * segment index reached, which drives the acceleration. */
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

  useFrame((_, delta) => {
    if (!chain) return;

    /* Base pace covers the chain in ~1.6s at 1×, gaining speed with each level
     * already passed. */
    const reached = sample(Math.min(1, t.current), tmp);
    const accel = 1 + reached * 0.35;
    t.current += delta * 0.62 * speed * accel;

    const forkEnd = 1 + (forkLines.length > 0 ? FORK_SPAN : 0);
    if (t.current > forkEnd + REST) t.current = 0;

    const inChain = t.current <= 1;
    const forkProgress = forkLines.length > 0 ? (t.current - 1) / FORK_SPAN : -1;

    /* Chain heads. */
    const chainKids = chainRef.current?.children ?? [];
    for (let i = 0; i < chainKids.length; i++) {
      const child = chainKids[i] as THREE.Sprite;
      const u =
        style === "comet" ? t.current - i * 0.035 : (t.current + i / chainCount) % 1;
      if (!inChain || u < 0 || u > 1) {
        child.visible = false;
        continue;
      }
      child.visible = true;
      sample(u, tmp);
      child.position.copy(tmp);
      const fade = style === "comet" ? 1 - i / chainCount : 0.85;
      const scale = (style === "comet" ? 26 - i * 2.2 : 18) * (0.6 + fade * 0.4);
      child.scale.setScalar(Math.max(4, scale));
      (child.material as THREE.SpriteMaterial).opacity = fade * 0.9;
    }

    /* Fork heads: released together once the chain is done, each running out to
     * its neighbour and fading as it arrives. */
    const forkKids = forkRef.current?.children ?? [];
    for (let i = 0; i < forkKids.length; i++) {
      const child = forkKids[i] as THREE.Sprite;
      const line = forkLines[i];
      if (!line || forkProgress < 0 || forkProgress > 1) {
        child.visible = false;
        continue;
      }
      child.visible = true;
      /* Ease out so the split reads as a burst rather than a constant crawl. */
      const p = 1 - Math.pow(1 - forkProgress, 2);
      child.position.copy(line.from).lerp(line.to, p);
      child.scale.setScalar(Math.max(4, 20 * (1 - forkProgress * 0.45)));
      (child.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - forkProgress);
    }
  });

  if (!chain) return null;

  const head = (key: number) => (
    <sprite key={key}>
      <spriteMaterial
        map={glowSprite()}
        color={threeColor}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </sprite>
  );

  return (
    <>
      <group ref={chainRef}>
        {Array.from({ length: chainCount }, (_, i) => head(i))}
      </group>
      <group ref={forkRef}>
        {Array.from({ length: forkLines.length }, (_, i) => head(i))}
      </group>
    </>
  );
}
