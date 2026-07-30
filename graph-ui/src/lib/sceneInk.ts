/* How the 3D stage is painted for each theme.
 *
 * The graph renders as emission: node colours are pushed above 1.0 so a bloom
 * pass turns the excess into a corona, and edges blend additively so overlapping
 * links accumulate into glow. Every part of that assumes it is drawing light onto
 * darkness. Point it at a near-white canvas and the whole thing disappears —
 * additive blending against white is a no-op (1 + x clamps to 1), pale stellar
 * node colours have nowhere left to go, and bloom picks up the *background* as
 * its brightest source and floods the frame. That is why the light theme showed
 * an empty white rectangle where the graph should be.
 *
 * A light stage therefore needs the inverse model: ink on paper. Colours are
 * darkened and saturated instead of boosted, edges are composited toward the
 * background instead of added to it, and bloom is switched off entirely rather
 * than turned down (its threshold cannot exclude a white background).
 *
 * Kept free of three.js so the maths is unit-testable on plain numbers. */

import type { Theme } from "./theme";

export type Stage = "dark" | "light";

export function stageForTheme(theme: Theme): Stage {
  return theme === "light" ? "light" : "dark";
}

/* ── Colour space ──────────────────────────────────────────────── */

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hueChannel(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueChannel(p, q, h + 1 / 3),
    hueChannel(p, q, h),
    hueChannel(p, q, h - 1 / 3),
  ];
}

/* ── Node ink ──────────────────────────────────────────────────── */

/* Ceiling on *luminance* for the light stage, against a canvas at ~0.94.
 *
 * Deliberately luminance and not HSL lightness. Node colours arrive as star
 * classes — pale blue, white, pale yellow, pale red — and capping their lightness
 * looks like it should be enough, but luminance weights green about ten times
 * more than blue: #fff0c0 held at lightness 0.46 still lands at luminance 0.70,
 * a quarter-step from paper and effectively invisible. Every warm colour in the
 * palette slipped through that way. Capping the quantity that actually decides
 * visibility fixes the whole family at once. */
const LIGHT_LUM_MAX = 0.5;
const LIGHT_S_GAIN = 1.45;
const LIGHT_S_FLOOR = 0.32;

/* Rec. 709 relative luminance — the same weighting the bloom pass thresholds on
 * and the one perceived contrast follows. */
function luminance(c: [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/* Darken and saturate a node colour for the light stage, preserving hue so the
 * star-class / label / status colour coding still carries.
 *
 * The darkening is a bisection on lightness rather than a fixed multiplier: it
 * caps luminance without flattening the classes onto one ink, because a colour
 * already dark enough is left exactly where it is. */
export function inkNode(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  const ls = Math.min(1, Math.max(LIGHT_S_FLOOR, s * LIGHT_S_GAIN));
  let hi = Math.min(1, l * 0.85);
  let out = hslToRgb(h, ls, hi);
  if (luminance(out) <= LIGHT_LUM_MAX) return out;

  /* Monotonic in lightness, so a dozen steps is exact to well under a code
   * point of 8-bit colour. */
  let lo = 0;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const test = hslToRgb(h, ls, mid);
    if (luminance(test) > LIGHT_LUM_MAX) hi = mid;
    else {
      lo = mid;
      out = test;
    }
  }
  return out;
}

/* ── Edge ink ──────────────────────────────────────────────────── */

/* Additive intensities are tuned for accumulation and sit very low (0.06–0.5).
 * Composited rather than added they would be invisible, so the light stage
 * re-maps them onto a usable alpha range before mixing toward the background. */
export function edgeAlphaForLight(intensity: number): number {
  return Math.min(0.85, Math.max(0.06, Math.sqrt(Math.max(0, intensity)) * 0.95));
}

/* An opaque line colour equivalent to drawing `color` at `alpha` over `bg`.
 *
 * Lines are drawn with normal blending and depthWrite off on the light stage, so
 * a later line overwrites an earlier one instead of darkening it. Pre-mixing the
 * background in gives the same result as real alpha for the common case (a line
 * over open canvas) without needing per-vertex alpha, which lineBasicMaterial
 * only supports via a 4-component colour attribute. */
export function compositeOver(
  color: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  const a = Math.min(1, Math.max(0, alpha));
  return [
    bg[0] + (color[0] - bg[0]) * a,
    bg[1] + (color[1] - bg[1]) * a,
    bg[2] + (color[2] - bg[2]) * a,
  ];
}

/* Darken an edge colour before compositing. The type palette is tuned for glow
 * on black; the same hues at full lightness on paper read as highlighter pen. */
export function inkEdge(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.min(1, s * 1.2), Math.min(0.42, l * 0.72));
}

/* ── Bloom ─────────────────────────────────────────────────────── */

/* Bloom is thresholded on luminance, and a light canvas *is* the brightest
 * thing in the frame — no threshold excludes it, so the pass floods. The light
 * stage runs without a composer instead. */
export function bloomEnabled(stage: Stage): boolean {
  return stage === "dark";
}
