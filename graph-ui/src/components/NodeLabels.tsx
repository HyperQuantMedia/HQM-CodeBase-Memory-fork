import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { GraphNode } from "../lib/types";
import { inkNode, type Stage } from "../lib/sceneInk";

interface NodeLabelsProps {
  nodes: GraphNode[];
  highlightedIds: Set<number> | null;
  maxLabels?: number;
  /* Emission on darkness vs ink on paper — see lib/sceneInk.ts. */
  stage?: Stage;
}

interface LabelTexture {
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
}

const TEXTURE_FONT_SIZE = 64;
const TEXTURE_FONT =
  `600 ${TEXTURE_FONT_SIZE}px Inter, system-ui, -apple-system, ` +
  'BlinkMacSystemFont, "Segoe UI", sans-serif';
const TEXTURE_MAX_TEXT_WIDTH = 720;
const TEXTURE_PADDING_X = 24;
const TEXTURE_PADDING_Y = 14;
const TEXTURE_STROKE_WIDTH = 8;

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}...`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }

  return `${text.slice(0, Math.max(1, lo))}...`;
}

function createLabelTexture(
  name: string,
  color: string,
  stage: Stage,
): LabelTexture | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.font = TEXTURE_FONT;
  const text = fitText(ctx, name, TEXTURE_MAX_TEXT_WIDTH);
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const logicalWidth = Math.max(
    1,
    textWidth + TEXTURE_PADDING_X * 2 + TEXTURE_STROKE_WIDTH * 2,
  );
  const logicalHeight =
    TEXTURE_FONT_SIZE + TEXTURE_PADDING_Y * 2 + TEXTURE_STROKE_WIDTH * 2;
  const pixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.ceil(logicalWidth * pixelRatio);
  canvas.height = Math.ceil(logicalHeight * pixelRatio);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  ctx.scale(pixelRatio, pixelRatio);
  ctx.font = TEXTURE_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = TEXTURE_STROKE_WIDTH;
  /* The outline exists to separate the text from whatever sits behind it, so it
   * has to oppose the stage: a black halo on a light canvas turns every label
   * into a smudge. The fill darkens for the same reason — it borrows the node's
   * pale stellar colour, which is unreadable on paper. */
  if (stage === "light") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillStyle = darkenHex(color);
  } else {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.fillStyle = color;
  }

  const x = logicalWidth / 2;
  const y = logicalHeight / 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    width: logicalWidth,
    height: logicalHeight,
  };
}

/* Darken a #rrggbb node colour for the light stage. Anything else (a generated
 * hsl(), a colour name) is passed through — the canvas will still draw it, just
 * without the light-stage correction. */
function darkenHex(css: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return css;
  const v = parseInt(m[1], 16);
  const [r, g, b] = inkNode(
    ((v >> 16) & 255) / 255,
    ((v >> 8) & 255) / 255,
    (v & 255) / 255,
  );
  const to = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

function NodeLabelSprite({ node, stage }: { node: GraphNode; stage: Stage }) {
  const label = useMemo(
    () => createLabelTexture(node.name, node.color, stage),
    [node.name, node.color, stage],
  );

  useEffect(() => {
    return () => label?.texture.dispose();
  }, [label]);

  if (!label) return null;

  const worldFontSize = Math.max(1.8, node.size * 0.4);
  const worldHeight = worldFontSize * (label.height / TEXTURE_FONT_SIZE);
  const worldWidth = worldHeight * (label.width / label.height);

  return (
    <sprite
      position={[node.x, node.y + node.size * 0.7 + worldHeight / 2, node.z]}
      scale={[worldWidth, worldHeight, 1]}
      renderOrder={20}
      frustumCulled={false}
    >
      <spriteMaterial
        map={label.texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

export function NodeLabels({
  nodes,
  highlightedIds,
  maxLabels = 80,
  stage = "dark",
}: NodeLabelsProps) {
  const labeled = useMemo(() => {
    const hasHighlight = highlightedIds && highlightedIds.size > 0;

    if (hasHighlight) {
      return nodes
        .filter((n) => highlightedIds.has(n.id))
        .sort((a, b) => b.size - a.size)
        .slice(0, maxLabels);
    }

    return [...nodes].sort((a, b) => b.size - a.size).slice(0, maxLabels);
  }, [nodes, highlightedIds, maxLabels]);

  return (
    <group>
      {labeled.map((node) => (
        <NodeLabelSprite key={node.id} node={node} stage={stage} />
      ))}
    </group>
  );
}
