<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Session capture — owner review rounds 5–8, Cartograph UI

Captured: 2026-07-30 · Confidence labels on each item · Sibling of
[`2026-07-30-usability-arc.md`](2026-07-30-usability-arc.md) (rounds 1–4)

Rounds 1–4 were defect-finding on work that believed itself finished. Rounds 5–8 were
feature and parity work, and produced two settled rulings
([view-parity](../decisions/2026-07-30-view-parity.md),
[size-map-as-projection](../decisions/2026-07-30-size-map-as-projection.md)). This is the
spine: what was asked, what was actually wrong, what the numbers said.

## Round 5 — four defects from round 4's verification

**1. `SizeMap Graph` tab stayed live with no project selected.** *Certain.* The gate was
`tab.id === "graph" && !selectedProject`; the size tab was simply not in it, so clicking it
landed on its own "select a project" placeholder. A greyed tab is the answer; an empty pane
is a detour. Now a `PROJECT_TABS` list.

**2. Tabs became icons.** *Owner ask.* Four labels running to "Relationship Graph" and
"SizeMap Graph" — two long phrases sharing a word — read as text to parse and ate the
header width the breadcrumb needs. Precedent already set by `ViewModeIcons`. Labels survive
as tooltip + accessible name.

**3. Folders collapsed to the top instead of the bottom.** *Certain — my regression, and a
ruling I had overridden with my own reasoning.* `f410ec71` had `mt-auto` unconditional.
`0bb03c48` added an exception for "both sections collapsed", on the grounds that two strips
straddling an empty column looked worse than two stacked at the top. That was my metric, not
the owner's. Worse, I had written a test (`keeps two collapsed strips together instead of
straddling a void`) that *locked the override in*, so the suite defended the regression. Both
reverted; the test now asserts the ruling and carries the history.

**4. The size map drew nothing.** *Certain, root cause found.* The tile frame only exists in
the loaded branch, below four early returns. A mount-time `useEffect` with an empty dep list
fires while the "walking the tree" placeholder is on screen, finds `frameRef.current` null,
attaches no `ResizeObserver`, and never runs again once data arrives. `box` stayed 0×0,
`squarify` got a zero-area rect, and the view fell through to "Nothing large enough to draw
here" — an empty pane that looks like an empty corpus while the API returned every file
correctly. Fixed with a callback ref, which cannot miss a mount. Regression test verified by
mutation: breaking the first measurement fails it.

> **Generalises:** a measurement effect keyed on mount cannot measure an element that mounts
> later. Any element behind an early return needs a callback ref, not `useRef` + effect.

## Round 6 — the size map as a projection

Covered in full by [size-map-as-projection](../decisions/2026-07-30-size-map-as-projection.md).
The part worth repeating here is the shape of the mistake: I set my own success metric ("no
spheres overlap"), hit it, and produced something emptier than anything in the product. The
approved relationship graph measures **57.2% of sampled nodes intersecting a neighbour**. The
fix was not a better algorithm, it was measuring the accepted artifact and aiming near it.

Also round 6: sort controls (A–Z / Z–A, count asc/desc) for node types, relationships and
folders, each list with its own persisted order — *"node types and relationship types are
read for different reasons in the same glance, so a shared control would always have one of
them in the wrong order."* Ties break on the other field, so flipping direction reverses
rather than shuffles.

## Round 7 — four more

**1. `Waypoints` icon read as a linear path.** *Owner ask, second miss.* `Share2` before it
was the platform share affordance. `Waypoints` is three nodes on one routed path — a route,
no branching. Hand-drawn glyph now (`TabIcons.tsx`): hub, two limbs, each splitting again.
Stock icons are fine for ordinary things (a list, a treemap, a pulse); hand-roll when the
glyph makes a claim about structure.

**2. Log level filters.** *Owner ask.* Chips per `level=` value present, with counts, mute /
restore / all, plus a substring box. Two details that matter: `\blevel=` so `sublevel=error`
does not match, and a line with no level becomes `other` rather than being guessed or dropped
— otherwise the body of every multi-line stack trace disappears. Chips store *exclusions*, so
the first error of a run appears immediately instead of needing its new chip enabled.

**3. Folders/files scope chips on the search.** *Owner ask.* Required making folders
searchable at all: the query only ever matched graph nodes, so a folder could never be a
result, and "where is the parser directory" is at least as common as "where is parse()".
Folder hits use plain substring (a folder has no `kind:`/`label:`/`status:` for the field
parser) and list first, since clicking one selects its whole subtree.

**4. "The size view has no panels, filters, breadcrumbs, camera panning, settings or theme
controls."** *Certain, and the camera item had a real root cause.* Nothing framed the scene:
the canvas starts its camera at z=800 while the radius-driven projections span ~450 to
~19,000 units, so the view was either a speck or the camera stood inside the cloud. Orbit,
pan and zoom were live the whole time. Reframes now on projection / focus / source / filter
change — not on every render, which would yank a camera the user had just positioned.

> **Generalises:** "the controls don't work" and "the scene is misframed" look identical from
> outside. Check the framing before the input handling.

## Round 8 — parity and type

**1. Font sizes drifting.** *Owner ask, and correct.* Three concrete cases: a 14px glyph in a
row of 15px icons; a 10px HUD line where the graph's is 11px; a detail panel in a different
type scale from the panel it sits opposite (12/10/13 against 13/11/16). Scale now written down.

**2–4. Cycling view button, icon cross-links, and the full side-panel shell.** Covered by
[view-parity](../decisions/2026-07-30-view-parity.md). The owner's framing —
*"we are keeping the UI as consistent as possible only changing the information, do you
understand?"* — is the ruling; everything else in that file is consequence.

**Found while implementing, not asked for.** *Certain.* The kind chips filtered the emitted
graph nodes, so they changed the 3D scene and did nothing to the treemap, and a folder's byte
total still counted files that were no longer drawn — the two views disagreed about the same
folder's size. Filtering the file list before the tree is built fixes all of it at once.
Regression test asserts a tile disappears, and that the chip survives being switched off.

## Standing count

212 tests, 24 files, all green. Type-checks clean. Binary rebuilt and served at
`http://127.0.0.1:9749`; served bundle hash confirmed changed each round.

**Every round in this session was owner-found or owner-directed.** Four rounds of green
suites did not surface any of round 5's four defects. The rail from rounds 1–4 holds
unchanged: ship a round, then stop and ask for eyes.
