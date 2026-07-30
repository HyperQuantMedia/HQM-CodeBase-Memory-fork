import { describe, expect, it } from "vitest";
import {
  bloomEnabled,
  compositeOver,
  edgeAlphaForLight,
  hslToRgb,
  inkEdge,
  inkNode,
  rgbToHsl,
  stageForTheme,
} from "./sceneInk";

/* The stellar palette the layout engine actually emits — pale by design, because
 * on a dark canvas pale plus bloom reads as a bright star. These exact colours
 * are what vanished in light mode. */
const STELLAR = {
  blueGiant: [0.502, 0.627, 1] as const, /* #80a0ff */
  white: [0.910, 0.910, 1] as const, /* #e8e8ff */
  yellowWhite: [1, 0.941, 0.753] as const, /* #fff0c0 */
  redDwarf: [1, 0.376, 0.314] as const, /* #ff6050 */
};

/* Relative luminance, the thing that decides whether a mark is visible against
 * a background. */
function lum(c: [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const PAPER = 0.94; /* luminance of #f2f4fa, the light canvas */

describe("stageForTheme", () => {
  it("maps the theme onto a rendering model", () => {
    expect(stageForTheme("light")).toBe("light");
    expect(stageForTheme("dark")).toBe("dark");
  });
});

describe("rgbToHsl / hslToRgb", () => {
  it("round-trips", () => {
    for (const c of Object.values(STELLAR)) {
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      const back = hslToRgb(h, s, l);
      expect(back[0]).toBeCloseTo(c[0], 5);
      expect(back[1]).toBeCloseTo(c[1], 5);
      expect(back[2]).toBeCloseTo(c[2], 5);
    }
  });

  it("handles greys, where hue is undefined", () => {
    const [h, s, l] = rgbToHsl(0.5, 0.5, 0.5);
    expect(s).toBe(0);
    expect(l).toBeCloseTo(0.5);
    expect(hslToRgb(h, s, l)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("inkNode", () => {
  it("pulls every stellar colour well below the paper it sits on", () => {
    /* The failure this exists to prevent: node colours at luminance 0.85–0.95
     * drawn onto a 0.94 canvas, i.e. invisible. */
    for (const [name, c] of Object.entries(STELLAR)) {
      const before = lum(c as unknown as [number, number, number]);
      const after = lum(inkNode(c[0], c[1], c[2]));
      expect(after, `${name} must darken`).toBeLessThan(before);
      /* Comfortably darker than paper — a readable mark, not a tint. */
      expect(PAPER - after, `${name} contrast against paper`).toBeGreaterThan(0.35);
    }
  });

  it("keeps hue, so the star-class coding still carries", () => {
    for (const c of Object.values(STELLAR)) {
      const before = rgbToHsl(c[0], c[1], c[2])[0];
      const inked = inkNode(c[0], c[1], c[2]);
      const after = rgbToHsl(inked[0], inked[1], inked[2])[0];
      expect(after).toBeCloseTo(before, 2);
    }
  });

  it("keeps the classes distinguishable from one another", () => {
    /* Darkening must not collapse four star classes onto one ink. */
    const inked = Object.values(STELLAR).map((c) => inkNode(c[0], c[1], c[2]));
    for (let i = 0; i < inked.length; i++) {
      for (let j = i + 1; j < inked.length; j++) {
        const d = Math.hypot(
          inked[i][0] - inked[j][0],
          inked[i][1] - inked[j][1],
          inked[i][2] - inked[j][2],
        );
        expect(d).toBeGreaterThan(0.1);
      }
    }
  });

  it("leaves an already-dark colour dark rather than lightening it", () => {
    const out = inkNode(0.1, 0.05, 0.2);
    expect(lum(out)).toBeLessThan(0.3);
  });
});

describe("edgeAlphaForLight", () => {
  it("lifts the additive intensity range onto a visible alpha range", () => {
    /* Additive intensities sit at 0.04–0.5 because they are meant to accumulate.
     * Composited at face value they would be all but invisible. */
    expect(edgeAlphaForLight(0.06)).toBeGreaterThan(0.15);
    expect(edgeAlphaForLight(0.5)).toBeGreaterThan(0.5);
  });

  it("stays inside bounds and preserves ordering", () => {
    expect(edgeAlphaForLight(0)).toBeGreaterThanOrEqual(0);
    expect(edgeAlphaForLight(10)).toBeLessThanOrEqual(1);
    expect(edgeAlphaForLight(-1)).toBeGreaterThanOrEqual(0);
    expect(edgeAlphaForLight(0.4)).toBeGreaterThan(edgeAlphaForLight(0.1));
  });
});

describe("compositeOver", () => {
  const bg: [number, number, number] = [0.95, 0.96, 0.98];

  it("is the background at zero alpha and the colour at full", () => {
    expect(compositeOver([0.1, 0.2, 0.3], 0, bg)).toEqual(bg);
    const full = compositeOver([0.1, 0.2, 0.3], 1, bg);
    expect(full[0]).toBeCloseTo(0.1, 6);
    expect(full[1]).toBeCloseTo(0.2, 6);
    expect(full[2]).toBeCloseTo(0.3, 6);
  });

  it("moves toward the colour monotonically", () => {
    const a = compositeOver([0, 0, 0], 0.25, bg);
    const b = compositeOver([0, 0, 0], 0.75, bg);
    expect(lum(b)).toBeLessThan(lum(a));
    expect(lum(a)).toBeLessThan(lum(bg));
  });

  it("clamps an out-of-range alpha instead of overshooting", () => {
    expect(lum(compositeOver([0, 0, 0], 5, bg))).toBeCloseTo(0, 6);
    expect(compositeOver([0, 0, 0], -5, bg)).toEqual(bg);
  });
});

describe("inkEdge", () => {
  it("darkens the type palette so links read as ink, not highlighter", () => {
    /* #22c55e (CONTAINS_*) and #eab308 (HANDLES) are tuned to glow on black. */
    for (const c of [
      [0.133, 0.773, 0.369],
      [0.918, 0.702, 0.031],
    ] as const) {
      expect(lum(inkEdge(c[0], c[1], c[2]))).toBeLessThan(lum(c as unknown as [number, number, number]));
    }
  });
});

describe("bloomEnabled", () => {
  it("is off on the light stage", () => {
    /* Bloom selects by luminance and a paper canvas is the brightest thing in
     * frame, so no threshold excludes it — the pass floods rather than haloes. */
    expect(bloomEnabled("light")).toBe(false);
    expect(bloomEnabled("dark")).toBe(true);
  });
});
