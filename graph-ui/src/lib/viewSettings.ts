/* View and animation preferences that are the same in both themes.
 *
 * Sibling to lib/appearance.ts, deliberately separate. Anything whose right value
 * depends on whether the stage is dark or light — contrast, node size, colours —
 * lives there, stored per theme. What lives here is theme-independent: which
 * projection is on screen, the camera's field of view and orbit, whether the path
 * light runs and how fast. Separate storage keys, so a schema change to one never
 * invalidates the other. */

import {
  DEFAULT_LAYOUT_PARAMS,
  LAYOUT_LIMITS,
  LEAF_SHAPES,
  VIEW_MODES,
  type LayoutParams,
  type LeafShape,
  type ViewMode,
} from "./viewLayout";

export type PathLightStyle = "comet" | "dots";

/* "idle" is the original showpiece — start orbiting after a minute untouched.
 * The toolbar toggle switches to an explicit "on"/"off" so the user can start or
 * stop it outright instead of waiting on a timer. */
export type AutoRotate = "idle" | "on" | "off";

export interface ViewSettings {
  mode: ViewMode;
  layout: LayoutParams;
  /** Camera field of view, degrees. */
  fov: number;
  /** Idle showpiece, or an explicit start/stop from the toolbar. */
  autoRotate: AutoRotate;
  /** Path-to-root light on selection. */
  pathLight: boolean;
  pathLightStyle: PathLightStyle;
  /** Travel speed multiplier. */
  pathLightSpeed: number;
  /** Speed up per containment level already passed. Off by default. */
  pathLightAccel: boolean;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  mode: "default",
  layout: DEFAULT_LAYOUT_PARAMS,
  fov: 50,
  autoRotate: "idle",
  pathLight: true,
  pathLightStyle: "comet",
  pathLightSpeed: 1,
  /* Off by default: it is a flourish, and on a deep corpus the light arrives
   * before the eye has followed it. Opt in from Settings → Animation. */
  pathLightAccel: false,
};

export const VIEW_LIMITS = {
  fov: { min: 25, max: 100 },
  pathLightSpeed: { min: 0.2, max: 3 },
  spread: LAYOUT_LIMITS.spread,
  coneSteep: LAYOUT_LIMITS.coneSteep,
  branchSpread: LAYOUT_LIMITS.branchSpread,
} as const;

const STORAGE_KEY = "cbm-view";

function clampNum(
  value: unknown,
  range: { min: number; max: number },
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

export function clampViewSettings(raw: unknown): ViewSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<keyof ViewSettings, unknown>
  >;
  const rawLayout = (typeof r.layout === "object" && r.layout !== null
    ? r.layout
    : {}) as Partial<Record<keyof LayoutParams, unknown>>;

  const mode = VIEW_MODES.includes(r.mode as ViewMode)
    ? (r.mode as ViewMode)
    : DEFAULT_VIEW_SETTINGS.mode;

  return {
    mode,
    layout: {
      spread: clampNum(rawLayout.spread, VIEW_LIMITS.spread, DEFAULT_LAYOUT_PARAMS.spread),
      coneSteep: clampNum(
        rawLayout.coneSteep,
        VIEW_LIMITS.coneSteep,
        DEFAULT_LAYOUT_PARAMS.coneSteep,
      ),
      branchSpread: clampNum(
        rawLayout.branchSpread,
        VIEW_LIMITS.branchSpread,
        DEFAULT_LAYOUT_PARAMS.branchSpread,
      ),
      leafShape: LEAF_SHAPES.includes(rawLayout.leafShape as LeafShape)
        ? (rawLayout.leafShape as LeafShape)
        : DEFAULT_LAYOUT_PARAMS.leafShape,
    },
    fov: clampNum(r.fov, VIEW_LIMITS.fov, DEFAULT_VIEW_SETTINGS.fov),
    autoRotate:
      r.autoRotate === "on" || r.autoRotate === "off" || r.autoRotate === "idle"
        ? r.autoRotate
        : DEFAULT_VIEW_SETTINGS.autoRotate,
    pathLight:
      typeof r.pathLight === "boolean" ? r.pathLight : DEFAULT_VIEW_SETTINGS.pathLight,
    pathLightStyle: r.pathLightStyle === "dots" ? "dots" : "comet",
    pathLightSpeed: clampNum(
      r.pathLightSpeed,
      VIEW_LIMITS.pathLightSpeed,
      DEFAULT_VIEW_SETTINGS.pathLightSpeed,
    ),
    pathLightAccel:
      typeof r.pathLightAccel === "boolean"
        ? r.pathLightAccel
        : DEFAULT_VIEW_SETTINGS.pathLightAccel,
  };
}

export function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return clampViewSettings(JSON.parse(raw));
  } catch { /* ignore */ }
  return DEFAULT_VIEW_SETTINGS;
}

export function saveViewSettings(settings: ViewSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
