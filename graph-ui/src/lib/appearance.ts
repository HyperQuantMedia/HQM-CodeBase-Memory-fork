/* Appearance settings, stored per theme.
 *
 * These used to be one global set (`cbm-display` for the contrast knobs,
 * `cbm-view` for the colours) shared by both themes, which cannot work: the two
 * stages are different rendering models, not two palettes. The dark stage draws
 * light onto darkness with a bloom pass adding apparent size to every node; the
 * light stage draws ink onto paper with no bloom at all. A node-glow value that
 * makes a hub shine on black does nothing on paper, and a link brightness that
 * keeps 163k additive lines from washing out to white leaves the same lines
 * invisible as ink. So each theme carries its own values and its own defaults.
 *
 * On disk this is one JSON object keyed by theme — {"dark": {…}, "light": {…}} —
 * so switching theme restores whatever the user last chose for it, and "Reset"
 * only touches the theme being edited.
 *
 * Legacy flat settings are migrated into the dark bucket, which is where they
 * were actually authored: light mode was unusable, so nobody tuned against it. */

import type { Stage } from "./sceneInk";

export type PathLightColorMode = "strand" | "theme" | "custom";

export interface Appearance {
  /** Link brightness (dark) / ink strength (light) multiplier. */
  edgeBrightness: number;
  /** Per-node glow boost multiplier. Dark stage only — light has no bloom. */
  nodeGlow: number;
  /** Bloom intensity multiplier. Dark stage only. */
  bloom: number;
  /** How far each link bows away from a straight chord (0 = straight). */
  edgeCurve: number;
  /** Node radius multiplier. */
  nodeScale: number;
  /** Per-label colour overrides; absent label = palette default. */
  labelColors: Record<string, string>;
  /** Per-edge-type colour overrides (Phase 4a); absent type = palette default. */
  edgeColors: Record<string, string>;
  /** Where the path light takes its colour. */
  pathLightColorMode: PathLightColorMode;
  /** The colour used when the mode is "custom". */
  pathLightColor: string;
}

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
  { name: "Bronze", color: "#a35a00" },
  { name: "Ink", color: "#1f2937" },
];

/* "strand" is the default colour mode because the graph already colours every
 * edge by type and every node by degree, and a single fixed light throws that
 * away — the interesting thing about a traversal is *what kind* of link each hop
 * is. In strand mode the head picks up the colour of what it is currently
 * crossing and cross-fades on the way. */
export const APPEARANCE_DEFAULTS: Record<Stage, Appearance> = {
  dark: {
    edgeBrightness: 1,
    nodeGlow: 1,
    bloom: 1,
    edgeCurve: 0.35,
    nodeScale: 1,
    labelColors: {},
    edgeColors: {},
    pathLightColorMode: "strand",
    pathLightColor: "#ffce6e",
  },
  light: {
    /* Links need more ink than they need glow. The density compensation that
     * keeps additive lines from saturating to white is calibrated for
     * accumulation on black; multiplied onto paper the same values barely tint,
     * so the light stage starts brighter. */
    edgeBrightness: 2.2,
    /* Inert on light — kept so the two buckets share one shape. */
    nodeGlow: 1,
    bloom: 1,
    edgeCurve: 0.35,
    /* No bloom means no corona, and the corona is most of a node's apparent size
     * on the dark stage. Without this compensation a 47k-node graph on paper is
     * 47k marks a pixel or two across. */
    nodeScale: 1.45,
    labelColors: {},
    edgeColors: {},
    pathLightColorMode: "strand",
    /* The dark theme's pale gold is invisible on paper; this is the light
     * theme's own accent. */
    pathLightColor: "#a35a00",
  },
};

export const APPEARANCE_LIMITS = {
  edgeBrightness: { min: 0.1, max: 6 },
  nodeGlow: { min: 0, max: 2 },
  bloom: { min: 0, max: 2 },
  edgeCurve: { min: 0, max: 1 },
  nodeScale: { min: 0.4, max: 3 },
} as const;

type NumericKey = keyof typeof APPEARANCE_LIMITS;

const STORAGE_KEY = "cbm-appearance";
/* Pre-split keys, read once so an upgrade keeps the user's tuning. */
const LEGACY_DISPLAY_KEY = "cbm-display";
const LEGACY_VIEW_KEY = "cbm-view";

export const STAGES: Stage[] = ["dark", "light"];

function clampNum(stage: Stage, key: NumericKey, value: unknown): number {
  const { min, max } = APPEARANCE_LIMITS[key];
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return APPEARANCE_DEFAULTS[stage][key];
  return Math.min(max, Math.max(min, n));
}

/* Only #rgb / #rrggbb survive — a colour is written straight into inline styles
 * and a THREE.Color, so anything else is dropped rather than trusted. */
function cleanColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function cleanLabelColors(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === "object" && value !== null) {
    for (const [label, v] of Object.entries(value)) {
      const c = cleanColor(v);
      if (c) out[label] = c;
    }
  }
  return out;
}

export function clampAppearance(stage: Stage, raw: unknown): Appearance {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<keyof Appearance, unknown>
  >;
  const d = APPEARANCE_DEFAULTS[stage];
  return {
    edgeBrightness: clampNum(stage, "edgeBrightness", r.edgeBrightness),
    nodeGlow: clampNum(stage, "nodeGlow", r.nodeGlow),
    bloom: clampNum(stage, "bloom", r.bloom),
    edgeCurve: clampNum(stage, "edgeCurve", r.edgeCurve),
    nodeScale: clampNum(stage, "nodeScale", r.nodeScale),
    labelColors: cleanLabelColors(r.labelColors),
    edgeColors: cleanLabelColors(r.edgeColors),
    pathLightColorMode:
      r.pathLightColorMode === "theme" ||
      r.pathLightColorMode === "custom" ||
      r.pathLightColorMode === "strand"
        ? r.pathLightColorMode
        : d.pathLightColorMode,
    pathLightColor: cleanColor(r.pathLightColor) ?? d.pathLightColor,
  };
}

export type AppearanceSet = Record<Stage, Appearance>;

export function defaultAppearanceSet(): AppearanceSet {
  return {
    dark: { ...APPEARANCE_DEFAULTS.dark, labelColors: {}, edgeColors: {} },
    light: { ...APPEARANCE_DEFAULTS.light, labelColors: {}, edgeColors: {} },
  };
}

/* Fold the pre-split single settings object into the dark bucket. */
function migrateLegacy(): AppearanceSet | null {
  let found = false;
  const merged: Record<string, unknown> = {};
  try {
    const display = localStorage.getItem(LEGACY_DISPLAY_KEY);
    if (display) {
      Object.assign(merged, JSON.parse(display));
      found = true;
    }
    const view = localStorage.getItem(LEGACY_VIEW_KEY);
    if (view) {
      const v = JSON.parse(view) as Record<string, unknown>;
      for (const key of ["labelColors", "pathLightColorMode", "pathLightColor"]) {
        if (v[key] !== undefined) {
          merged[key] = v[key];
          found = true;
        }
      }
    }
  } catch { /* ignore */ }
  if (!found) return null;
  return {
    dark: clampAppearance("dark", merged),
    light: { ...APPEARANCE_DEFAULTS.light, labelColors: {}, edgeColors: {} },
  };
}

export function loadAppearances(): AppearanceSet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        dark: clampAppearance("dark", parsed.dark),
        light: clampAppearance("light", parsed.light),
      };
    }
  } catch { /* ignore */ }
  return migrateLegacy() ?? defaultAppearanceSet();
}

export function saveAppearances(all: AppearanceSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/* Whether a stage's settings still match that stage's defaults — drives the
 * "modified" dot and whether Reset is available. */
export function isAppearanceDefault(stage: Stage, a: Appearance): boolean {
  const d = APPEARANCE_DEFAULTS[stage];
  return (
    a.edgeBrightness === d.edgeBrightness &&
    a.nodeGlow === d.nodeGlow &&
    a.bloom === d.bloom &&
    a.edgeCurve === d.edgeCurve &&
    a.nodeScale === d.nodeScale &&
    a.pathLightColorMode === d.pathLightColorMode &&
    a.pathLightColor === d.pathLightColor &&
    Object.keys(a.labelColors).length === 0 &&
    Object.keys(a.edgeColors).length === 0
  );
}
