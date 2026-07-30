import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_DEFAULTS,
  APPEARANCE_LIMITS,
  clampAppearance,
  defaultAppearanceSet,
  isAppearanceDefault,
  loadAppearances,
  saveAppearances,
  STAGES,
} from "./appearance";

beforeEach(() => {
  localStorage.clear();
});

describe("per-theme defaults", () => {
  it("gives each stage its own starting point", () => {
    /* The whole reason this file exists: one shared set of knobs cannot serve two
     * rendering models. Links that are correctly dimmed as additive glow on black
     * are invisible as ink on paper, and paper has no bloom corona to lend a node
     * apparent size. */
    expect(APPEARANCE_DEFAULTS.light.edgeBrightness).toBeGreaterThan(
      APPEARANCE_DEFAULTS.dark.edgeBrightness,
    );
    expect(APPEARANCE_DEFAULTS.light.nodeScale).toBeGreaterThan(
      APPEARANCE_DEFAULTS.dark.nodeScale,
    );
    /* The dark theme's pale gold fails on paper, so each stage has its own light
     * colour. */
    expect(APPEARANCE_DEFAULTS.light.pathLightColor).not.toBe(
      APPEARANCE_DEFAULTS.dark.pathLightColor,
    );
  });

  it("keeps every default inside its own limits", () => {
    for (const stage of STAGES) {
      const d = APPEARANCE_DEFAULTS[stage];
      for (const key of Object.keys(APPEARANCE_LIMITS) as (keyof typeof APPEARANCE_LIMITS)[]) {
        expect(d[key], `${stage}.${key}`).toBeGreaterThanOrEqual(
          APPEARANCE_LIMITS[key].min,
        );
        expect(d[key], `${stage}.${key}`).toBeLessThanOrEqual(
          APPEARANCE_LIMITS[key].max,
        );
      }
    }
  });
});

describe("clampAppearance", () => {
  it("clamps each value to its range and fills the stage's defaults", () => {
    const out = clampAppearance("light", { edgeBrightness: 99, nodeScale: -5 });
    expect(out.edgeBrightness).toBe(APPEARANCE_LIMITS.edgeBrightness.max);
    expect(out.nodeScale).toBe(APPEARANCE_LIMITS.nodeScale.min);
    expect(out.bloom).toBe(APPEARANCE_DEFAULTS.light.bloom);
    expect(out.pathLightColor).toBe(APPEARANCE_DEFAULTS.light.pathLightColor);
  });

  it("falls back per stage, not to one global default", () => {
    expect(clampAppearance("dark", {}).edgeBrightness).toBe(
      APPEARANCE_DEFAULTS.dark.edgeBrightness,
    );
    expect(clampAppearance("light", {}).edgeBrightness).toBe(
      APPEARANCE_DEFAULTS.light.edgeBrightness,
    );
  });

  it("rejects a non-numeric or absent value", () => {
    expect(clampAppearance("dark", { bloom: Number.NaN }).bloom).toBe(
      APPEARANCE_DEFAULTS.dark.bloom,
    );
    expect(clampAppearance("dark", { nodeGlow: "loud" }).nodeGlow).toBe(
      APPEARANCE_DEFAULTS.dark.nodeGlow,
    );
  });

  it("drops colours it cannot trust", () => {
    /* Values here reach inline styles and THREE.Color directly. */
    const out = clampAppearance("dark", {
      labelColors: {
        Function: "#0af",
        Class: "#a1b2c3",
        Bad: "red; background: url(x)",
        Worse: 42,
      },
      pathLightColor: "javascript:alert(1)",
    });
    expect(out.labelColors).toEqual({ Function: "#0af", Class: "#a1b2c3" });
    expect(out.pathLightColor).toBe(APPEARANCE_DEFAULTS.dark.pathLightColor);
  });

  it("survives junk instead of an object", () => {
    for (const junk of [null, undefined, 7, "nope", []]) {
      expect(clampAppearance("dark", junk).nodeScale).toBe(
        APPEARANCE_DEFAULTS.dark.nodeScale,
      );
    }
  });
});

describe("persistence", () => {
  it("round-trips both stages under one key", () => {
    const set = defaultAppearanceSet();
    set.light.edgeBrightness = 3.5;
    set.dark.labelColors = { Function: "#123456" };
    saveAppearances(set);

    /* One JSON object keyed by theme, so a theme flip restores that theme's own
     * values rather than reinterpreting the other's. */
    const raw = JSON.parse(localStorage.getItem("cbm-appearance")!);
    expect(Object.keys(raw).sort()).toEqual(["dark", "light"]);

    const back = loadAppearances();
    expect(back.light.edgeBrightness).toBe(3.5);
    expect(back.dark.labelColors).toEqual({ Function: "#123456" });
    expect(back.light.labelColors).toEqual({});
  });

  it("returns per-stage defaults when nothing is stored", () => {
    const back = loadAppearances();
    expect(back.dark).toEqual(APPEARANCE_DEFAULTS.dark);
    expect(back.light).toEqual(APPEARANCE_DEFAULTS.light);
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem("cbm-appearance", "{not json");
    expect(loadAppearances().dark.bloom).toBe(APPEARANCE_DEFAULTS.dark.bloom);
  });

  it("migrates the pre-split settings into the dark bucket", () => {
    /* Everything anyone tuned was tuned on dark, because light mode did not
     * render. Copying it into both would hand the light theme values chosen
     * against a rendering model it does not use. */
    localStorage.setItem(
      "cbm-display",
      JSON.stringify({ edgeBrightness: 0.5, bloom: 1.8 }),
    );
    localStorage.setItem(
      "cbm-view",
      JSON.stringify({
        mode: "sphere",
        labelColors: { Class: "#ff0000" },
        pathLightColorMode: "custom",
        pathLightColor: "#00ff00",
      }),
    );

    const back = loadAppearances();
    expect(back.dark.edgeBrightness).toBe(0.5);
    expect(back.dark.bloom).toBe(1.8);
    expect(back.dark.labelColors).toEqual({ Class: "#ff0000" });
    expect(back.dark.pathLightColorMode).toBe("custom");
    expect(back.dark.pathLightColor).toBe("#00ff00");
    expect(back.light).toEqual(APPEARANCE_DEFAULTS.light);
  });

  it("prefers the new key over the legacy ones", () => {
    localStorage.setItem("cbm-display", JSON.stringify({ edgeBrightness: 0.5 }));
    saveAppearances(defaultAppearanceSet());
    expect(loadAppearances().dark.edgeBrightness).toBe(
      APPEARANCE_DEFAULTS.dark.edgeBrightness,
    );
  });
});

describe("isAppearanceDefault", () => {
  it("compares against the stage's own defaults", () => {
    expect(isAppearanceDefault("light", APPEARANCE_DEFAULTS.light)).toBe(true);
    /* The dark defaults are *not* default for the light stage — which is what
     * makes the modified dot and Reset meaningful per theme. */
    expect(isAppearanceDefault("light", APPEARANCE_DEFAULTS.dark)).toBe(false);
  });

  it("notices a label override", () => {
    expect(
      isAppearanceDefault("dark", {
        ...APPEARANCE_DEFAULTS.dark,
        labelColors: { Function: "#123456" },
      }),
    ).toBe(false);
  });
});
