import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GraphEdge, GraphNode } from "../lib/types";
import type { PathLightStyle } from "../lib/viewSettings";
import { inkNode, type Stage } from "../lib/sceneInk";

interface PathLightProps {
  /** Ordered node ids, outermost ancestor → selected node. */
  path: number[];
  /** Neighbours the light forks out to once it reaches the selection. */
  forks?: number[];
  nodes: GraphNode[];
  /** Edges, used to colour each hop by the strand it crosses. */
  edges?: GraphEdge[];
  /** Fixed colour, or "" to take each hop's colour from the graph. */
  color: string;
  style: PathLightStyle;
  /** Travel speed multiplier. */
  speed: number;
  /** Gain speed per level already passed. */
  accelerate?: boolean;
  /* Emission on darkness vs ink on paper — see lib/sceneInk.ts. */
  stage?: Stage;
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
 * Ported from the Astra static map, with two behaviours the port had wrong:
 *
 *  - The fork half was missing. The light arrived at the selection and stopped,
 *    so a node's actual relationships — the interesting part of selecting it —
 *    never lit up.
 *  - The per-level acceleration was unconditional. It is a flourish, and on a
 *    deep corpus it means the light is gone before the eye has followed it, so
 *    it is now opt-in (Settings → Animation).
 *
 * The chain is walked in *world* space each frame rather than baked into
 * geometry, so it keeps working when the view mode reprojects every node. */
export function PathLight({
  path,
  forks = [],
  nodes,
  edges,
  color,
  style,
  speed,
  accelerate = false,
  stage = "dark",
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
   * speed instead of lurching across long segments.
   *
   * `tint` is the colour of the node each segment arrives at, used when the light
   * follows the strands rather than a fixed colour. Taking it from the node
   * rather than the edge is deliberate: a containment hop between two nodes has
   * exactly one edge type all the way down (green), so edge colour would make the
   * whole chain uniform, whereas node colour tracks the degree gradient the map
   * is already drawn with — the light visibly cools as it passes hubs. */
  const chain = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const tint: THREE.Color[] = [];
    for (const id of path) {
      const n = byId.get(id);
      if (!n) continue;
      pts.push(new THREE.Vector3(n.x, n.y, n.z));
      const c = new THREE.Color(n.color);
      if (stage === "light") {
        const [r, g, b] = inkNode(c.r, c.g, c.b);
        c.setRGB(r, g, b);
      }
      tint.push(c);
    }
    if (pts.length < 2) return null;
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].distanceTo(pts[i - 1]);
      seg.push(d);
      total += d;
    }
    return { pts, tint, seg, total };
  }, [path, byId, stage]);

  /* Where each fork runs: from the selection out to a neighbour, tinted by the
   * type of the edge that justifies it — a fork is a *relationship*, and unlike
   * the chain those genuinely differ in kind (calls vs imports vs handles). */
  const forkLines = useMemo(() => {
    const origin = chain?.pts[chain.pts.length - 1];
    const selected = path[path.length - 1];
    if (!origin) return [];
    const typeOf = new Map<number, string>();
    for (const e of edges ?? []) {
      if (e.source === selected) typeOf.set(e.target, e.type);
      else if (e.target === selected) typeOf.set(e.source, e.type);
    }
    const out: { from: THREE.Vector3; to: THREE.Vector3; tint: THREE.Color }[] = [];
    for (const id of forks.slice(0, MAX_FORKS)) {
      const n = byId.get(id);
      if (!n) continue;
      const c = new THREE.Color(n.color);
      if (stage === "light") {
        const [r, g, b] = inkNode(c.r, c.g, c.b);
        c.setRGB(r, g, b);
      }
      out.push({ from: origin, to: new THREE.Vector3(n.x, n.y, n.z), tint: c });
    }
    return out;
  }, [forks, byId, chain, edges, path, stage]);

  const chainCount = style === "comet" ? TRAIL : DOTS;
  /* An empty colour means "follow the strands"; the per-frame loop then writes
   * each head's material from the segment it is crossing. */
  const fixed = useMemo(() => (color ? new THREE.Color(color) : null), [color]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const blend = useMemo(() => new THREE.Color(), []);

  /* Position for a normalized progress u ∈ [0,1] along the chain; returns the
   * segment index reached, which drives the colour and the acceleration. */
  const sample = (u: number, out: THREE.Vector3): number => {
    if (!chain) return 0;
    let want = Math.max(0, Math.min(1, u)) * chain.total;
    for (let i = 0; i < chain.seg.length; i++) {
      if (want <= chain.seg[i] || i === chain.seg.length - 1) {
        const f = chain.seg[i] > 0 ? Math.max(0, Math.min(1, want / chain.seg[i])) : 0;
        out.copy(chain.pts[i]).lerp(chain.pts[i + 1], f);
        return i + f;
      }
      want -= chain.seg[i];
    }
    return 0;
  };

  useFrame((_, delta) => {
    if (!chain) return;

    /* Base pace covers the chain in ~1.6s at 1×. */
    const reached = sample(Math.min(1, t.current), tmp);
    const accel = accelerate ? 1 + Math.floor(reached) * 0.35 : 1;
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
      const at = sample(u, tmp);
      child.position.copy(tmp);
      const fade = style === "comet" ? 1 - i / chainCount : 0.85;
      const scale = (style === "comet" ? 26 - i * 2.2 : 18) * (0.6 + fade * 0.4);
      child.scale.setScalar(Math.max(4, scale));
      const mat = child.material as THREE.SpriteMaterial;
      mat.opacity = fade * 0.9;
      if (!fixed) {
        /* Cross-fade between the two nodes bracketing this hop, so the strand
         * colour changes continuously instead of stepping at each node. */
        const k = Math.min(chain.tint.length - 1, Math.floor(at));
        const nx = Math.min(chain.tint.length - 1, k + 1);
        blend.copy(chain.tint[k]).lerp(chain.tint[nx], at - k);
        mat.color.copy(blend);
      }
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
      const mat = child.material as THREE.SpriteMaterial;
      mat.opacity = 0.85 * (1 - forkProgress);
      if (!fixed) mat.color.copy(line.tint);
    }
  });

  if (!chain) return null;

  const head = (key: number) => (
    <sprite key={key}>
      <spriteMaterial
        map={glowSprite()}
        color={fixed ?? undefined}
        transparent
        depthWrite={false}
        /* Additive is a no-op against a light canvas, so the light stage
         * composites the sprite instead — the alpha map still shapes it. */
        blending={stage === "light" ? THREE.NormalBlending : THREE.AdditiveBlending}
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
