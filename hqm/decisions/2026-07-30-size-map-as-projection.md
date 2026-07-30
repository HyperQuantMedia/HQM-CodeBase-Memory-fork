<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# The size map is the same hierarchy under a different measure

Decided: 2026-07-30 · Ruled by: Rahul (brief), design by session · Status: settled,
density dial owner-overturnable

## The ask

> "The current size map looks sad and common like how everyone is doing it. Can we
> utilize the view of the tree viewer but rather than utilizing it to build
> relationships we use it to build the size map in our 4 view styles as well?"

## The ruling

A squarified treemap is the one obvious way to draw a treemap, which is why every tool
ships the same one. But the size tree **is** the containment hierarchy the relationship
graph already projects four ways. So the size tree is converted into the node/edge shape
the viewer consumes (`graph-ui/src/lib/sizeGraph.ts`) and the existing projections apply
unchanged.

Four views, matching the graph's four: **treemap** takes the slot the graph's server
force layout occupies (nothing computes a force layout over file sizes, and a size map's
default should be the exact one anyway), then **sphere**, **cone**, **tree**.

The treemap is not replaced. It is unbeatable at exact proportion — no occlusion, every
tile comparable to every other by area. What it cannot show is *shape*: at 26k files it
is a wall of slivers with no sense of nesting depth or where structure clumps. Two
questions, two answers, one switch.

## Load-bearing decisions

**Volume ∝ bytes, so radius ∝ bytes^(1/3).** What the eye compares between two spheres
is volume. Linear radius shows an 8× file as 8× wide and therefore ~512× heavy — the
classic bubble-chart lie, and on a source tree spanning six orders of magnitude it puts
one sphere across the whole scene. Range is clamped at both ends: a 12-byte file stays
clickable, one vendored 4 GB blob cannot become the scene.

**Folders are markers, not sums.** A folder's bytes are its children's, so sizing the
folder sphere by them draws a ball that swallows the very files it contains *and* counts
the weight twice. In a nested projection the folder's cluster radius already encodes its
total, because room is reserved for everything beneath it. The marker only says "a
container is here".

**Heaviest-first emission, so the cap prunes leaves.** A node is only ever queued by its
own parent, so a parent is always emitted before its children and every edge references
two nodes that exist. Truncating the tail therefore drops leaves, never orphans. What the
cap dropped is reported in the footer — a truncated scene that stays silent reads as the
whole corpus.

**The layout must reserve room for real radii.** The projections previously reserved one
uniform leaf radius per node, correct when every sphere is the same size and catastrophic
when a 400 MB archive sits beside a 2 KB header. `applyViewMode` takes an optional
`radiusOf`; given it, cluster sizing uses each node's own radius, the spacing target comes
from the radii rather than from incoming coordinates (a size graph has none — every node
starts at the origin), and the closing fit never rescales the radii, because **the radii
are the data**. A size map that resizes its spheres to fit its layout is no longer a size
map.

## The density trade, and the metric mistake behind it

Built first to "no spheres may overlap". Measured result: 0.5–1% overlapping, median
clearance +4 to +11× the median radius. A near-empty starfield.

Then measured the thing that should have been the reference all along — the **approved**
relationship graph, the server force layout the owner has looked at and signed off, over
the same 47k-node corpus:

```
[reference] server force layout, 47032 nodes: overlapping 57.2%  clearance p50 -0.32x median r
```

Spheres interpenetrate constantly in the view that was accepted, and it reads fine,
because the corona rendering turns a dense cloud into a legible one. The zero-overlap
target was mine, not the product's.

A size map does want to be less dense than a relationship graph, because a half-buried
sphere misstates its own file's bytes — the one thing this view exists to say. So it sits
between. Measured over `hqm-astra` (864 files) and `p4` (26k files):

| fit quantile | overlapping | median clearance |
|---|---|---|
| 0.60 | ~30% | ~1.0× median r |
| **0.70** | **~21%** | **~1.7× median r** |
| 0.80 | ~10–16% | ~2–3× median r |
| 0.98 | ~1% | ~4–11× median r (the empty one) |

`RADII_FIT_QUANTILE = 0.70`. **This is a judgment on a trade curve, not a derived
constant.** If the owner's eye says otherwise the dial is in `viewLayout.ts` and the table
says what each notch costs.

**The generalised lesson, which outlives this view:** when there is no absolute answer to
"is this right", calibrate against something already accepted rather than against an
ideal. An invented target that sounds unarguable ("nothing should overlap") can be further
from the product than the messy thing already shipping.

## Two dead ends, so they are not retried

**Sizing the cluster shell from real radii detonates.** Geometrically it is the correct
local rule — two neighbours on a Fibonacci lattice of *n* points at radius *R* are ~R·3.81/√n
apart, so `R ≥ 2·max_child_radius·√n/3.81`. Applied, every level's shell grows by √n over
the level below, compounding with *breadth*, and the 26k-file tree measured **27 million
units** across. The volume budget is the only term in `sizeClusters` that can be recursive.
This is the same blow-up the packing rule was originally written to avoid.

**Ordering the rings by ball size is a no-op.** Both nested placements put child *i* at a
radius scaled by (room − outer_i), so the biggest child sits nearest the parent's centre —
which looked like the cause. Reordering the radial term by ascending ball size (keeping the
angular term on the original index, so layout stability under filtering survives) moved
sphere clearance from 9.87× to 11.04× median r. Slightly worse. The lever was the closing
fit, not the ring order. The reordering was kept because it is defensible on its own terms
and costs nothing, but it is not a fix for anything.

## Measurement rig

`graph-ui/scratchpad/size-graph-probe/` — gitignored, own README. Runs the real conversion
and the real projections over real `/api/file-sizes` payloads and prints overlap %, median
clearance in median radii, radius spread, and extent. Includes the reference measurement of
the approved server layout, which is the part that mattered.

## Related

- [`2026-07-30-layout-spacing-metric.md`](2026-07-30-layout-spacing-metric.md) — the earlier
  ruling this extends: spacing is the invariant, extent and aspect are blind
- [`2026-07-30-view-parity.md`](2026-07-30-view-parity.md) — the shell both views share
- [`../notes/2026-07-30-parity-rounds.md`](../notes/2026-07-30-parity-rounds.md) — the spine
