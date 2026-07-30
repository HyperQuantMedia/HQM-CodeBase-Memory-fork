import { describe, expect, it } from "vitest";
import { edgeIntensityScale } from "./density";
import { APPEARANCE_DEFAULTS } from "./appearance";
import {
  bloomEnabled,
  hslToRgb,
  inkEdge,
  inkNode,
  lightNodeInk,
  multiplyTint,
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

describe("multiplyTint", () => {
  const green: [number, number, number] = [0.05, 0.31, 0.15];

  it("is white at zero and the colour itself at full", () => {
    /* Multiply blending needs white for "leave the paper alone" — that is the
     * whole reason the mapping is a tint toward white rather than an alpha. */
    expect(multiplyTint(green, 0)).toEqual([1, 1, 1]);
    const full = multiplyTint(green, 1);
    expect(full[0]).toBeCloseTo(green[0], 6);
    expect(full[1]).toBeCloseTo(green[1], 6);
    expect(full[2]).toBeCloseTo(green[2], 6);
  });

  it("darkens monotonically with intensity", () => {
    expect(lum(multiplyTint(green, 0.6))).toBeLessThan(lum(multiplyTint(green, 0.2)));
  });

  it("accumulates when tints are multiplied, the way glow accumulates on dark", () => {
    /* Two overlapping links must be darker than one. This is the property a
     * straight alpha composite cannot provide: with normal blending the last line
     * drawn simply wins the pixel, so density stops reading as density. */
    const one = multiplyTint(green, 0.15);
    const two: [number, number, number] = [
      one[0] * one[0],
      one[1] * one[1],
      one[2] * one[2],
    ];
    expect(lum(two)).toBeLessThan(lum(one));
    expect(lum(one)).toBeLessThan(1);
  });

  it("clamps an out-of-range intensity", () => {
    expect(multiplyTint(green, -3)).toEqual([1, 1, 1]);
    const over = multiplyTint(green, 9);
    expect(over[1]).toBeCloseTo(green[1], 6);
  });
});

describe("lightNodeInk", () => {
  it("keeps a dimmed node visible against paper", () => {
    /* The bug this pins: a selection of 8 nodes out of 47,000 faded the other
     * 46,992 to 78% of the way to white, i.e. erased the graph. Mirroring the dark
     * stage's 0.15 multiplier does not work on paper, because dark-on-light loses
     * legibility far faster than light-on-dark. */
    const dimmed = lightNodeInk(0.502, 0.627, 1, true);
    expect(PAPER - lum(dimmed)).toBeGreaterThan(0.15);
  });

  it("leaves a selected node at full ink", () => {
    const c = [0.502, 0.627, 1] as const;
    expect(lightNodeInk(c[0], c[1], c[2], false)).toEqual(inkNode(c[0], c[1], c[2]));
  });

  it("still separates dimmed from selected", () => {
    const c = [1, 0.376, 0.314] as const;
    expect(lum(lightNodeInk(c[0], c[1], c[2], true))).toBeGreaterThan(
      lum(lightNodeInk(c[0], c[1], c[2], false)),
    );
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

describe("the light stage at a real corpus density", () => {
  /* End-to-end on the numbers, because reasoning about this chain has been wrong
   * twice. 163,411 edges is the measured p4 count; the question is whether one
   * link actually marks the page once the density compensation, the light-stage
   * softening and the theme's own brightness default have all been applied. */
  const EDGES = 163_411;

  function tintFor(intensity: number): [number, number, number] {
    const raw = edgeIntensityScale(EDGES);
    const scale = Math.sqrt(raw) * APPEARANCE_DEFAULTS.light.edgeBrightness;
    /* CONTAINS_* green, the most common link type in a code corpus. */
    const base = inkEdge(0.133, 0.773, 0.369);
    return multiplyTint(base, intensity * scale);
  }

  it("marks the page visibly for an intra-cluster link", () => {
    /* 0.25 is EdgeLines' same-cluster intensity. Anything under a few percent of
     * darkening is the failure mode the user reported: a blank white rectangle. */
    const t = tintFor(0.25);
    expect(1 - lum(t)).toBeGreaterThan(0.06);
  });

  it("still leaves a cross-cluster link faint rather than invisible", () => {
    const t = tintFor(0.06);
    const ink = 1 - lum(t);
    expect(ink).toBeGreaterThan(0.01);
    expect(ink).toBeLessThan(1 - lum(tintFor(0.25)));
  });

  it("would have been invisible without the light-stage softening", () => {
    /* Sharing the dark stage's compensation and brightness — what shipped first —
     * gives a fraction of a percent per line, i.e. nothing. */
    const shared = edgeIntensityScale(EDGES) * APPEARANCE_DEFAULTS.dark.edgeBrightness;
    const base = inkEdge(0.133, 0.773, 0.369);
    expect(1 - lum(multiplyTint(base, 0.25 * shared))).toBeLessThan(0.03);
  });

  it("keeps a selected link far stronger than the dimmed bulk", () => {
    /* A selection is never density-scaled, so the contrast that makes a selection
     * readable does not depend on the corpus size. */
    const selected = multiplyTint(inkEdge(0.133, 0.773, 0.369), 0.5);
    expect(1 - lum(selected)).toBeGreaterThan(3 * (1 - lum(tintFor(0.06))));
  });
});
