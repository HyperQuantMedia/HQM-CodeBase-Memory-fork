<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Alternate projections calibrate on nearest-neighbour spacing, never on extent

- ***Date:*** 2026-07-30
- ***Decided by:*** Rahul (owner), across two review rounds — my first fix used the wrong metric and I declared it done
- ***Status:*** built + measured on a real 47,032-node corpus; commits `5a692696`, `629d43f2` on `HQM-dev`
- ***Touches:*** `graph-ui/src/lib/viewLayout.ts` · `graph-ui/src/components/GraphScene.tsx` (camera framing) · `graph-ui/src/lib/viewLayout.test.ts`
- ***See also:*** [`../notes/2026-07-30-usability-arc.md`](../notes/2026-07-30-usability-arc.md) — the session spine

## Decision

The client-side projections (nested spheres, nested cones, organic tree) are calibrated to the
server layout's **nearest-neighbour spacing**, measured and closed-loop corrected — never to
its bounding extent or aspect ratio.

`sampleSpacing()` reads the target off the server's own positions. The projection is built
from that target. `fitToSpacing()` then measures the finished layout's *actual* spacing and
rescales. One measured input, one measured correction.

Nesting budget is a **recursive volume rule**: `outer³ ≥ Σ child³ / PACKING`, evaluated
bottom-up so a parent budgets for its children's *balls*, not for their leaf counts.

## Context

An earlier round matched the server layout's aspect ratio and I called the projections fixed.
The owner's verdict: "still not functional." Measurement settled it:

```
nearest-neighbour spacing   server(web) 4.80   sphere 1.63   cone 0.73   tree 0.05
```

A force layout fills a volume; a projection piles nodes onto shells. At identical extent the
projection's interior is 3–90× denser. Extent and aspect ratio are both blind to the one
property the eye actually reads — how far apart adjacent nodes are — so both can be matched
exactly while the view stays an unreadable smear.

After the change: 4.50 / 4.75 / 4.04 against 4.80. Extents 967–1285 against the server's 2069,
deliberately tighter: spacing is the invariant, extent is a consequence. All 47,032 positions
distinct.

## Options weighed

- **Target spacing + closed-loop rescale (chosen)** — survives corpus size changes, because
  spacing is scale-free where extent is not.
- **Match extent / aspect (rejected — tried, failed)** — the metric cannot see the defect.
- **Reserve a bounding ball per child (rejected — tried, exploded)** — compounds
  `maxChild·√n` per level: cone reached 325,000,000 units, tree 1.7e9.
- **Flat volume budget over leaves (rejected — tried, 4× too dense)** — budgeted for leaves
  rather than for children's balls; spacing came out 1.21. Made the rule recursive.
- **Hand-tuned constants (rejected)** — two consecutive guesses were both wrong.
  `PACKING = 0.5`, `LEAF_RADIUS_K = 0.78`, `SPHERE_SPACING_K = 3.81` now come out of the
  calibration, and the tests assert the invariant rather than the number.

## Consequences

- **Layout claims are made after measuring, not before.** The probe rig lives at
  `graph-ui/scratchpad/view-layout-probe/` (gitignored, with its own `README.md`): it loads a
  real 47k-node corpus and reports spacing, extent and distinctness per projection. The
  durable invariants are banked in `graph-ui/src/lib/viewLayout.test.ts`, so the assertions
  survive without the harness.
- `sampleSpacing()` drops zero distances and falls back to 1. An all-coincident input
  previously returned ~0 and collapsed the layout to a sub-unit blob — a real robustness
  hole, surfaced by a fixture.
- Camera framing follows the same discipline: `computeCameraTarget` fits to the framed set's
  own radius (`d = r · FIT_MARGIN / sin(fov/2)`, `FIT_MARGIN = 1.25`, `MIN_RADIUS = 60`)
  rather than assuming a scene scale, and the view reframes when the projection changes.
- `CAMERA_FAR = 400,000` and `ORBIT_MAX_DISTANCE = 200,000` are deliberately not larger: a
  wider near/far ratio buys reach at the cost of depth precision.

**Standing rail:** when a visualization looks wrong but the geometry is valid, the metric
being optimized is the suspect. Measure what the eye reads, not what is easy to compute.
