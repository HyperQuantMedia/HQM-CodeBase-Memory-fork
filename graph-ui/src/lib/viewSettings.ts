/* View, animation, and colour preferences.
 *
 * Sibling to density.ts's DisplaySettings, deliberately separate: that one is
 * about density compensation (edge/glow/bloom multipliers layered on automatic
 * scaling), this one is about which projection is on screen, whether the path
 * light runs, and per-label colour overrides. Different concerns, different
 * storage key, so a schema change to one never invalidates the other. */

import {
  DEFAULT_LAYOUT_PARAMS,
  LAYOUT_LIMITS,
  VIEW_MODES,
  type LayoutParams,
  type TreeDirection,
  type ViewMode,
} from "./viewLayout";

export type PathLightStyle = "comet" | "dots";

export interface ViewSettings {
  mode: ViewMode;
  layout: LayoutParams;
  /** Camera field of view, degrees. */
  fov: number;
  /** Path-to-root light on selection. */
  pathLight: boolean;
  pathLightStyle: PathLightStyle;
  /** Travel speed multiplier. */
  pathLightSpeed: number;
  /** Light colour, or "" to follow the theme accent. */
  pathLightColor: string;
  /** Per-label colour overrides; absent label = palette default. */
  labelColors: Record<string, string>;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  mode: "default",
  layout: DEFAULT_LAYOUT_PARAMS,
  fov: 50,
  pathLight: true,
  pathLightStyle: "comet",
  pathLightSpeed: 1,
  pathLightColor: "",
  labelColors: {},
};

export const VIEW_LIMITS = {
  fov: { min: 25, max: 100 },
  pathLightSpeed: { min: 0.2, max: 3 },
  sphereScale: LAYOUT_LIMITS.sphereScale,
  coneHeight: LAYOUT_LIMITS.coneHeight,
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

/* Only #rgb / #rrggbb survive — an override is written straight into inline
 * styles and a THREE.Color, so anything else is dropped rather than trusted. */
function cleanColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
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
  const treeDirection: TreeDirection =
    rawLayout.treeDirection === "horizontal" || rawLayout.treeDirection === "vertical"
      ? rawLayout.treeDirection
      : DEFAULT_LAYOUT_PARAMS.treeDirection;

  const labelColors: Record<string, string> = {};
  if (typeof r.labelColors === "object" && r.labelColors !== null) {
    for (const [label, value] of Object.entries(r.labelColors)) {
      const c = cleanColor(value);
      if (c) labelColors[label] = c;
    }
  }

  return {
    mode,
    layout: {
      sphereScale: clampNum(
        rawLayout.sphereScale,
        VIEW_LIMITS.sphereScale,
        DEFAULT_LAYOUT_PARAMS.sphereScale,
      ),
      coneHeight: clampNum(
        rawLayout.coneHeight,
        VIEW_LIMITS.coneHeight,
        DEFAULT_LAYOUT_PARAMS.coneHeight,
      ),
      treeDirection,
    },
    fov: clampNum(r.fov, VIEW_LIMITS.fov, DEFAULT_VIEW_SETTINGS.fov),
    pathLight:
      typeof r.pathLight === "boolean" ? r.pathLight : DEFAULT_VIEW_SETTINGS.pathLight,
    pathLightStyle: r.pathLightStyle === "dots" ? "dots" : "comet",
    pathLightSpeed: clampNum(
      r.pathLightSpeed,
      VIEW_LIMITS.pathLightSpeed,
      DEFAULT_VIEW_SETTINGS.pathLightSpeed,
    ),
    pathLightColor: cleanColor(r.pathLightColor) ?? "",
    labelColors,
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
