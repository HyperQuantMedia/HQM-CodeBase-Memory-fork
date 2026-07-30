import { useState, useRef, useEffect, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { NodeCloud } from "./NodeCloud";
import { EdgeLines } from "./EdgeLines";
import { NodeLabels } from "./NodeLabels";
import { NodeTooltip } from "./NodeTooltip";
import { PathLight } from "./PathLight";
import type { GraphData, GraphNode, LinkedProject } from "../lib/types";
import {
  DEFAULT_DISPLAY_SETTINGS,
  bloomIntensityScale,
  nodeBoostScale,
  type DisplaySettings,
} from "../lib/density";
import type { AutoRotate, PathLightStyle } from "../lib/viewSettings";
import { bloomEnabled, type Stage } from "../lib/sceneInk";

const BASE_BLOOM_INTENSITY = 1.45;

/* ── Camera fly-to animation ────────────────────────────── */

interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

function CameraAnimator({
  target,
  controlsRef,
}: {
  target: CameraTarget | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const targetRef = useRef<CameraTarget | null>(null);
  const progress = useRef(1);

  useEffect(() => {
    if (target) {
      targetRef.current = target;
      progress.current = 0;
    }
  }, [target]);

  useFrame(() => {
    if (!targetRef.current || progress.current >= 1) return;

    progress.current = Math.min(1, progress.current + 0.02);
    const t = 1 - Math.pow(1 - progress.current, 3); /* ease-out cubic */

    camera.position.lerp(targetRef.current.position, t * 0.08);

    /* Move the OrbitControls pivot to the focus point as well. Otherwise the
     * controls keep their target at the origin and re-center the view on the
     * next frame, snapping the camera back to the middle after the fly-to. */
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(targetRef.current.lookAt, t * 0.08);
      controls.update();
    } else {
      camera.lookAt(targetRef.current.lookAt);
    }
  });

  return null;
}

/* ── Idle auto-rotation ──────────────────────────────────── */

const IDLE_TIMEOUT_MS = 60_000;

/* The camera has to survive layouts of different size: the server's force layout
 * spans ~2,000 units over a 47k-node corpus, while the spacing-derived
 * projections land anywhere from ~950 to ~1,300 and a linked-project galaxy sits
 * further out again. Four times the previous headroom covers that with room to
 * spare — and not more, deliberately: the depth buffer's precision goes as the
 * near/far ratio, so an arbitrarily distant far plane trades clipping for
 * z-fighting among the node spheres. */
const CAMERA_FAR = 400_000;
const ORBIT_MAX_DISTANCE = 200_000;
export const GRAPH_CANVAS_DPR: [number, number] = [1, 1.5];
export const GRAPH_COMPOSER_MULTISAMPLING = 0;

function IdleAutoRotate({
  controlsRef,
  mode,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  mode: AutoRotate;
}) {
  const lastInteraction = useRef(Date.now());

  /* Reset timer on any pointer/wheel event. An explicit "on" keeps spinning
   * through interaction — the user asked for it, so touching the canvas should
   * not silently cancel it. */
  const resetTimer = useCallback(() => {
    lastInteraction.current = Date.now();
    if (controlsRef.current && mode !== "on") {
      controlsRef.current.autoRotate = false;
    }
  }, [controlsRef, mode]);

  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    canvas.addEventListener("pointerdown", resetTimer);
    canvas.addEventListener("wheel", resetTimer);
    return () => {
      canvas.removeEventListener("pointerdown", resetTimer);
      canvas.removeEventListener("wheel", resetTimer);
    };
  }, [resetTimer]);

  useFrame(() => {
    if (!controlsRef.current) return;
    if (mode === "on") {
      controlsRef.current.autoRotate = true;
      return;
    }
    if (mode === "off") {
      controlsRef.current.autoRotate = false;
      return;
    }
    const idle = Date.now() - lastInteraction.current > IDLE_TIMEOUT_MS;
    controlsRef.current.autoRotate = idle;
  });

  return null;
}

/* ── Main scene ─────────────────────────────────────────── */

interface GraphSceneProps {
  data: GraphData;
  /** Emission on darkness vs ink on paper — see lib/sceneInk.ts. */
  stage?: Stage;
  /** How far links bow away from a straight chord, 0–1. */
  edgeCurve?: number;
  highlightedIds: Set<number> | null;
  cameraTarget: CameraTarget | null;
  showLabels: boolean;
  display?: DisplaySettings;
  onNodeClick: (node: GraphNode) => void;
  /** Camera field of view, degrees (Settings → View). */
  fov?: number;
  /** Ordered node ids root→selection for the path light; empty disables it. */
  lightPath?: number[];
  /** Neighbours the light forks along once it reaches the selection. */
  lightForks?: number[];
  /** Path light gains speed per level already passed. */
  pathLightAccel?: boolean;
  /** "idle" keeps the after-a-minute showpiece; "on"/"off" are explicit. */
  autoRotate?: AutoRotate;
  pathLightStyle?: PathLightStyle;
  pathLightSpeed?: number;
  /** Light colour; empty follows the theme accent. */
  pathLightColor?: string;
  /** Canvas clear colour, so the scene follows the light/dark theme. */
  background?: string;
}

export type { CameraTarget };

/* The camera's fov is fixed at construction by <Canvas camera={…}>, so changing
 * it later needs an explicit push onto the live camera object. */
function FovSync({ fov }: { fov: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [camera, fov]);
  return null;
}

export function GraphScene({
  data,
  stage = "dark",
  edgeCurve = 0,
  highlightedIds,
  cameraTarget,
  showLabels,
  display = DEFAULT_DISPLAY_SETTINGS,
  onNodeClick,
  fov = 50,
  lightPath,
  lightForks,
  pathLightAccel = false,
  autoRotate = "idle",
  pathLightStyle = "comet",
  pathLightSpeed = 1,
  pathLightColor = "",
  background = "#06090f",
}: GraphSceneProps) {
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  /* Adaptive density defaults × user multipliers. The automatic scale keeps
   * contrast roughly constant as the graph grows; the sliders nudge it.
   * NodeCloud applies `nodeBoost` directly (no internal density scaling),
   * whereas EdgeLines scales by edge density itself — so it receives only the
   * user edge-brightness multiplier to avoid double-applying. */
  const nodeBoost = nodeBoostScale(data.nodes.length) * display.nodeGlow;
  const bloomIntensity =
    BASE_BLOOM_INTENSITY * bloomIntensityScale(data.nodes.length) * display.bloom;

  return (
    <Canvas
      camera={{ position: [0, 0, 800], fov, near: 0.1, far: CAMERA_FAR }}
      style={{ background }}
      dpr={GRAPH_CANVAS_DPR}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      }}
    >
      <color attach="background" args={[background]} />
      <FovSync fov={fov} />
      <ambientLight intensity={0.5} />
      <pointLight position={[500, 500, 500]} intensity={0.6} />
      <pointLight
        position={[-300, -200, -300]}
        intensity={0.4}
        color="#6040ff"
      />

      <EdgeLines
        nodes={data.nodes}
        edges={data.edges}
        highlightedIds={highlightedIds}
        brightness={display.edgeBrightness}
        curve={edgeCurve}
        stage={stage}
        background={background}
      />
      <NodeCloud
        nodes={data.nodes}
        highlightedIds={highlightedIds}
        onHover={setHovered}
        onClick={onNodeClick}
        boost={nodeBoost}
        stage={stage}
      />
      {showLabels && (
        <NodeLabels
          nodes={data.nodes}
          highlightedIds={highlightedIds}
          stage={stage}
        />
      )}

      {/* Satellite galaxies for cross-repo linked projects */}
      {data.linked_projects?.map((lp: LinkedProject) => {
        const offsetNodes = lp.nodes.map((n) => ({
          ...n,
          x: n.x + lp.offset.x,
          y: n.y + lp.offset.y,
          z: n.z + lp.offset.z,
        }));
        return (
          <group key={lp.project}>
            <EdgeLines
              nodes={offsetNodes}
              edges={lp.edges}
              highlightedIds={null}
              opacity={0.3}
              brightness={display.edgeBrightness}
              curve={edgeCurve}
              stage={stage}
              background={background}
            />
            <NodeCloud
              nodes={offsetNodes}
              highlightedIds={null}
              onHover={setHovered}
              onClick={onNodeClick}
              opacity={0.5}
              boost={nodeBoost}
              stage={stage}
            />
            {/* Inter-galaxy CROSS_* edges: source is in primary, target in
             * this linked project's offset nodes. */}
            {lp.cross_edges && lp.cross_edges.length > 0 && (
              <EdgeLines
                nodes={data.nodes}
                targetNodes={offsetNodes}
                edges={lp.cross_edges}
                highlightedIds={highlightedIds}
                opacity={0.85}
                brightness={display.edgeBrightness}
                curve={edgeCurve}
                stage={stage}
                background={background}
              />
            )}
          </group>
        );
      })}

      {lightPath && lightPath.length > 1 && (
        <PathLight
          path={lightPath}
          forks={lightForks}
          nodes={data.nodes}
          edges={data.edges}
          color={pathLightColor}
          style={pathLightStyle}
          speed={pathLightSpeed}
          accelerate={pathLightAccel}
          stage={stage}
        />
      )}

      {hovered && <NodeTooltip node={hovered} />}

      <CameraAnimator target={cameraTarget} controlsRef={controlsRef} />
      <IdleAutoRotate controlsRef={controlsRef} mode={autoRotate} />

      {/* No bloom on a light stage. Bloom selects by luminance, and a paper-white
          canvas is the brightest thing in the frame — no threshold can exclude it,
          so the pass floods the whole view instead of haloing the nodes. */}
      {bloomEnabled(stage) && (
        <EffectComposer multisampling={GRAPH_COMPOSER_MULTISAMPLING}>
          <Bloom
            luminanceThreshold={0.3}
            luminanceSmoothing={0.7}
            intensity={bloomIntensity}
            mipmapBlur
            radius={0.6}
          />
        </EffectComposer>
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={1.5}
        minDistance={10}
        maxDistance={ORBIT_MAX_DISTANCE}
        autoRotateSpeed={0.4}
      />
    </Canvas>
  );
}

/* ── Helper: compute camera target from node IDs ────────── */

export function computeCameraTarget(
  nodes: GraphNode[],
  ids: Set<number>,
): CameraTarget | null {
  if (ids.size === 0) return null;

  let cx = 0,
    cy = 0,
    cz = 0,
    count = 0;
  for (const node of nodes) {
    if (ids.has(node.id)) {
      cx += node.x;
      cy += node.y;
      cz += node.z;
      count++;
    }
  }
  if (count === 0) return null;

  cx /= count;
  cy /= count;
  cz /= count;

  /* Distance based on cluster spread — ensure we never zoom too close */
  let maxDist = 0;
  for (const node of nodes) {
    if (ids.has(node.id)) {
      const d = Math.sqrt(
        (node.x - cx) ** 2 + (node.y - cy) ** 2 + (node.z - cz) ** 2,
      );
      if (d > maxDist) maxDist = d;
    }
  }

  /* Minimum distance scales with count: single node = 300, cluster = spread-based.
   * The multiplier eases off for large selections: ×3 is right for a handful of
   * nodes but pushes a whole-graph frame three times further out than it needs
   * to be, which reads as "the view switched and everything vanished". */
  const spreadDist = maxDist * (count > 1000 ? 1.5 : 3);
  const minDist = count <= 5 ? 300 : 200;
  const distance = Math.max(minDist, spreadDist);
  const lookAt = new THREE.Vector3(cx, cy, cz);
  const position = new THREE.Vector3(
    cx + distance * 0.2,
    cy + distance * 0.15,
    cz + distance,
  );

  return { position, lookAt };
}
