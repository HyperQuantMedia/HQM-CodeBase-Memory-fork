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
  LEAF_SHAPES,
  VIEW_MODES,
  type LayoutParams,
  type LeafShape,
  type ViewMode,
} from "./viewLayout";

export type PathLightStyle = "comet" | "dots";

/* Where the light takes its colour.
 *
 * "strand" is the default because the graph already colours every edge by type
 * and every node by degree, and a single fixed light throws that away — the
 * interesting thing about a traversal is *what kind* of link each hop is. In
 * strand mode the head picks up the colour of the segment it is currently
 * crossing and cross-fades on the way, so an IMPORTS hop and a CALLS hop are
 * distinguishable while the light is moving. */
export type PathLightColorMode = "strand" | "theme" | "custom";

/* Ready-made light colours. The picker stays for anything else — these exist
 * because hunting for a good value in an OS colour dialog is the slow way to
 * answer "what else could this look like". */
export const PATH_LIGHT_PRESETS: { name: string; color: string }[] = [
  { name: "North star", color: "#ffce6e" },
  { name: "Ion", color: "#67e8f9" },
  { name: "Magenta", color: "#f472b6" },
  { name: "Emerald", color: "#34d399" },
  { name: "Ember", color: "#fb7185" },
  { name: "Violet", color: "#a78bfa" },
  { name: "Signal white", color: "#f8fafc" },
  { name: "Deep teal", color: "#0e7490" },
];

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
  /** Where the light's colour comes from. */
  pathLightColorMode: PathLightColorMode;
  /** The colour used when the mode is "custom". */
  pathLightColor: string;
  /** Speed up per containment level already passed. Off by default. */
  pathLightAccel: boolean;
  /** Per-label colour overrides; absent label = palette default. */
  labelColors: Record<string, string>;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  mode: "default",
  layout: DEFAULT_LAYOUT_PARAMS,
  fov: 50,
  autoRotate: "idle",
  pathLight: true,
  pathLightStyle: "comet",
  pathLightSpeed: 1,
  pathLightColorMode: "strand",
  pathLightColor: "#ffce6e",
  /* Off by default: it is a flourish, and on a deep corpus the light arrives
   * before the eye has followed it. Opt in from Settings → Animation. */
  pathLightAccel: false,
  labelColors: {},
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
    pathLightColorMode:
      r.pathLightColorMode === "theme" ||
      r.pathLightColorMode === "custom" ||
      r.pathLightColorMode === "strand"
        ? r.pathLightColorMode
        : DEFAULT_VIEW_SETTINGS.pathLightColorMode,
    pathLightColor: cleanColor(r.pathLightColor) ?? DEFAULT_VIEW_SETTINGS.pathLightColor,
    pathLightAccel:
      typeof r.pathLightAccel === "boolean"
        ? r.pathLightAccel
        : DEFAULT_VIEW_SETTINGS.pathLightAccel,
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
