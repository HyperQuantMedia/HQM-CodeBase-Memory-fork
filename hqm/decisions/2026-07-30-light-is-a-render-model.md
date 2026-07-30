<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Light mode is a second render model, not a palette

- ***Date:*** 2026-07-30
- ***Decided by:*** Rahul (owner), across three review rounds — the first two fixes were palette fixes and both failed
- ***Status:*** built + verified at real density (163,411 edges); commits `3be235a4`, `629d43f2`, `7438a2df` on `HQM-dev`
- ***Touches:*** `graph-ui/src/lib/sceneInk.ts` · `graph-ui/src/lib/appearance.ts` · `graph-ui/src/styles/globals.css` · `graph-ui/src/components/{EdgeLines,NodeCloud,NodeLabels,PathLight,GraphScene}.tsx`
- ***See also:*** [`../notes/2026-07-30-usability-arc.md`](../notes/2026-07-30-usability-arc.md) — the session spine

## Decision

The light theme is a **distinct rendering model**, not an inverted palette. Dark is *emission
on darkness*: additive blending plus bloom, where overlapping faint edges accumulate toward
white and that accumulation is the density signal. Light is *ink on paper*:
`MultiplyBlending`, bloom off, ink darkness capped by Rec. 709 luminance.

The theme selects a **stage** (`stageForTheme`), and the stage selects blend mode, bloom,
tint maths and dimming. Colour values are downstream of that choice, not the substance of it.

Appearance settings are **per stage and persisted per stage**: `localStorage` key
`cbm-appearance` holds `{"dark":{…},"light":{…}}` with independent defaults and a per-stage
reset (owner ask: "different defaults… persistent once updated by the user as JSON key value
pair along with a reset to defaults option").

## Context

The feature port shipped a light palette under `data-theme="light"`, with every component
already themed through `--color-*` vars. The owner's verdict was "horendous overall… needs
significant overhaul entirely". The second attempt deepened the palette; the owner reported
nodes and relationships **still invisible**.

Only then did the cause become clear: additive blending against white paper saturates to
white, so the more structure the graph has, the *less* of it is visible. The palette was
never the defect. Two rounds were spent on the wrong layer.

## Options weighed

- **Two stages, one scene graph (chosen)** — components take a `stage` prop and switch
  blend/tint/bloom; layout, data and camera paths stay single-implementation.
  `lib/sceneInk.ts` is deliberately three.js-free so the luminance and tint maths are
  unit-testable without WebGL.
- **Invert the palette only (rejected — tried twice, failed twice)** — cannot work. The
  failure is in the blend equation, which no colour choice reaches.
- **Light-specific components (rejected)** — forks the renderer and doubles the cost of
  every future visual change, for a theme toggle.

## Consequences

Three constraints fall out. Each will be re-derived wrong by anyone who assumes light is a
palette:

- **Tailwind v4 opacity modifiers cannot be theme-aware.** `text-foreground/70` compiles to
  `color-mix(in oklab, var(--color-foreground) 70%, transparent)` — a real alpha, with no
  hook to vary it per theme. About 70 such utilities existed. Replaced with named roles:
  `--color-ink-faint` / `--color-ink-dim` / `--color-ink-soft`, declared once per theme.
  Same reason `globals.css` uses `@theme`, not `@theme inline`.
- **`material.opacity` is inert under multiply blending.** The equation is `dst*src`; alpha
  takes no part. Intensity folds into the vertex tint instead —
  `multiplyTint(color, a) = 1 − a(1 − c)`, a lerp toward white.
- **Cap luminance, not HSL lightness.** A test caught `#fff0c0` reading as "capped" by
  lightness while sitting at Rec. 709 luminance 0.696, barely below paper — green carries
  ~10× blue's weight. `inkNode` bisects on luminance, `LIGHT_LUM_MAX = 0.5`.

Tuned per stage, never shared:

| | dark | light | why |
|---|---|---|---|
| primary | `#ffce6e` | `#a35a00` | the dark gold fails contrast on white |
| density compensation | linear | `sqrt(rawScale)` | ink from white has far less headroom than glow from black |
| unselected dimming | 0.15 | `LIGHT_DIM = 0.5` | dark-on-light loses legibility much faster |
| bloom | on | off | `bloomEnabled(stage)` gates the `<EffectComposer>` entirely |

Legacy single-theme settings (`cbm-display`, `cbm-view` colour fields) migrate into the
**dark** bucket only — they were authored against the emission model and mean nothing on paper.

**Standing rail:** a theme that changes *how light behaves* is a render-model change. Reach
for the blend equation before the colour picker.
