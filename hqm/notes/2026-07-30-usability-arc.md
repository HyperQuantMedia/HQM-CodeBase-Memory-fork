<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Cartograph usability arc — four owner-review rounds

Session capture. Confidence labels per section: `[SETTLED]` decided and verified ·
`[PROPOSED]` argued, not ratified · `[OPEN]` unresolved.

- ***Date:*** 2026-07-30 (one session, compacted twice)
- ***Branch:*** `HQM-dev`, commits `46d3f0c3` … `279d7e25` — 7 commits, 48 files, +5111/−765
- ***Rulings promoted:*** [`../decisions/2026-07-30-light-is-a-render-model.md`](../decisions/2026-07-30-light-is-a-render-model.md) · [`../decisions/2026-07-30-layout-spacing-metric.md`](../decisions/2026-07-30-layout-spacing-metric.md)
- ***Code touched:*** `graph-ui/src/lib/{sceneInk,appearance,viewLayout,sizeMap,density,fileKind}.ts` · `graph-ui/src/components/{EdgeLines,NodeCloud,NodeLabels,PathLight,GraphScene,GraphTab,SizeTab,SettingsMenu,CollapsibleSection,ViewModeIcons}.tsx` · `graph-ui/src/styles/globals.css` · `src/ui/http_server.c`

---

## Problem [SETTLED]

The feature port (`f410ec71`, `2309365b`) delivered all ten planned items and passed local
tests. It was still not usable. Four rounds of owner review with annotated screenshots
produced 16 defects, of which **none** were caught by the test suite, the type checker, or my
own inspection. The suite was green the whole time.

Root cause of the pattern, not of any one bug: every defect was **visual or spatial** —
invisible ink, collapsed layouts, wasted flex height, a treemap of the wrong dataset. Those
are exactly the properties a headless suite does not assert and a code read does not reveal.

## The four rounds [SETTLED]

| # | Reported | Real cause |
|---|---|---|
| 1 | light mode "horendous… needs significant overhaul entirely" | light was a palette swap of an emission renderer; ruling A |
| 1 | view-mode switch should be icons | ported the theme-toggle pattern (`ViewModeIcons.tsx`) |
| 1 | sphere/cone/tree "still not functional" | geometrically valid, visually degenerate; ruling B |
| 1 | want an organic 3D tree, bezier, flower/leaf/bulb clusters | new `layoutOrganic` + `LeafShape` |
| 1 | comet colour should follow strand colours; presets missing | strand mode cross-fades between the two node colours bracketing each hop |
| 1 | per-node acceleration belongs in Settings, off by default | `pathLightAccel`, default false |
| 2 | nodes/relationships **still** invisible in light mode | ruling A again — the first fix was still a palette fix |
| 2 | settings must be per-theme, persisted as JSON, with reset | `lib/appearance.ts`, key `cbm-appearance` = `{dark,light}` |
| 2 | Folders should collapse to the **bottom** | `mt-auto` — with a caveat found in round 4 |
| 3 | breadcrumb parts should move the camera | `computeCameraTarget` + fit-to-frame |
| 3 | collapsed sections should give space to the open one | `flex-1` — did not work; see round 4 |
| 3 | filter cannot hide external links, "node over population" | `hideUnlinked` + count |
| 3 | want a nested file-size map, switchable from the graph | new `SizeTab` + `/api/file-sizes` |
| 3 | "I allow don't understand the use of this control tab panel" | it was empty on Windows; owner chose "make it work on Windows" |
| 4 | "AFTER THE COLLAPSE THE SIDEBAR SPACE IS NOT GIVEN TO THE OPEN SECTION" | `CollapsibleSection` rendered its body as a bare flex child |
| 4 | breadcrumb duplicated at the end | some node kinds are named with their whole path |
| 4 | "Sizes tab does not seem to be calculated correctly at all" | read `file_hashes.size` — 98% of bytes missing |
| 4 | no button graph ↔ sizes; reorder/rename tabs | jump buttons both ways; Projects → Relationship Graph → SizeMap Graph → Diagnostics |

## Ruling A — light is a render model, not a palette [SETTLED]

Promoted: [`../decisions/2026-07-30-light-is-a-render-model.md`](../decisions/2026-07-30-light-is-a-render-model.md).

Dark is **emission on darkness** — additive blending plus bloom, where overlapping faint edges
accumulate toward white and that accumulation *is* the density signal. Invert the palette and
additive blending saturates paper to white: the more structure, the less you see. Light is
**ink on paper** — `MultiplyBlending`, bloom off, ink darkness capped by luminance.

Three gotchas that will otherwise be re-derived wrong:

1. **Tailwind v4 opacity modifiers cannot be theme-aware.** `text-foreground/70` compiles to
   `color-mix(in oklab, var(--color-foreground) 70%, transparent)` — a real alpha against
   whatever is behind it, with no per-theme hook. ~70 such utilities existed. Fixed by naming
   the roles: `--color-ink-faint/dim/soft`, declared per theme.
2. **`material.opacity` is inert under multiply blending.** The equation is `dst*src`; alpha
   takes no part. Intensity must fold into the vertex tint — `multiplyTint(color, a)` returns
   `1 − a(1 − c)`, a lerp toward white.
3. **Cap luminance, not HSL lightness.** A test caught `#fff0c0` at Rec. 709 luminance 0.696,
   barely below paper, while its HSL lightness read as "capped". Green is weighted ~10× blue.
   `inkNode` bisects on luminance, `LIGHT_LUM_MAX = 0.5`.

## Ruling B — calibrate on spacing, never on extent [SETTLED]

Promoted: [`../decisions/2026-07-30-layout-spacing-metric.md`](../decisions/2026-07-30-layout-spacing-metric.md).

I had "fixed" these projections in an earlier round by matching the server layout's **aspect
ratio**, and declared victory. The owner said they were still not functional. Measurement
proved the owner right and my metric wrong:

```
nearest-neighbour spacing   server(web) 4.80   sphere 1.63   cone 0.73   tree 0.05
```

I had scaled projections to the server's *extent*. A force layout fills a volume; a projection
piles nodes onto shells. Same extent, 3–90× denser interior.

Fix: build from a **target spacing** sampled off the server layout, then close the loop —
`fitToSpacing()` measures the finished layout's own spacing and rescales. After: 4.50 / 4.75 /
4.04 against 4.80; extents 967–1285 vs 2069; all 47,032 positions distinct.

Sub-ruling: nesting budget is a **recursive volume rule**, `outer³ ≥ Σ child³ / PACKING`.
Reserving a bounding ball per child compounds `maxChild·√n` per level — cone reached
325,000,000 units, tree 1.7e9.

## Ruling C — the index is not the corpus [SETTLED]

`/api/file-sizes` originally read `file_hashes.size`, which the incremental indexer already
records. Cheap, exact per row, and the wrong set: that table holds only what the parser hashed.

```
walked from disk   26,411 files   24,953.3 MB     (matches an independent walk to 0.1 MB)
file_hashes.size    1,940 files      496.4 MB
missing            24,585 files   24,456.9 MB  =  98% of bytes
  .tracy 12,631 MB · .obj 3,083 MB · .lib 2,716 MB · .db 1,477 MB · .png 916 MB
```

A size map that cannot see where the weight sits answers no question worth asking, and "the
indexer didn't hash it" is not a reason for bytes to be invisible. The default is now a live
tree walk (`.git` skipped, directory symlinks not followed, bounded at
`FILE_SIZES_MAX_ENTRIES = 400000` / `FILE_SIZES_MAX_DEPTH = 64`, `truncated` reported rather
than stopping silently). The indexed reading survives as a selectable mode, because "how big
is the corpus I can search" is a real second question. The footer states which is showing.

**Generalizes:** any view answering "what is in this corpus" must name whether it means
*indexed* or *present*, and default to present. This lands directly on the planned document
distillers (PDF/spreadsheet/slide/image extractors), where the two sets will diverge hard.

## Security — the kill guard was compiled out on Windows [SETTLED]

Found while implementing the owner's chosen option ("make it work on Windows"), not while
reviewing.

`/api/kill` restricts kills to PIDs the server itself forked. That guard sat inside
`#ifndef _WIN32`. On Windows there was **no authorization check at all**: an unauthenticated
loopback endpoint would terminate any process on the machine by PID. Nothing exercised it
while the process list was always empty — and making the list real puts a kill button beside
every row.

Closed with `win_pid_is_cbm_process()` in `src/ui/http_server.c` (Toolhelp32 enumeration;
target must be a live `codebase-memory-mcp.exe`). Verified: `POST {"pid":4}` →
`403 can only kill codebase-memory-mcp processes`.

**Rail earned:** when a platform stub becomes real, audit what its authorization was
`#ifdef`'d around. A guard that never ran was never tested, and the feature that makes the
guard reachable is the same change that must restore it.

## Method — measure before declaring [SETTLED]

Every claim this arc was measured, because both rulings above are cases where reasoning
produced a confident wrong answer:

- Layout probe rig at `graph-ui/scratchpad/view-layout-probe/` — loads a real 47k-node corpus,
  reports spacing/extent/distinctness per projection. Caught two wrong packing constants and
  the aspect-ratio error.
- Light-stage numbers verified at real density (163,411 edges), with a test asserting the
  *old* values would have been invisible.
- Size-map data validated twice: DB values byte-exact against disk (500/500), then the indexed
  set compared against a full independent walk.
- Windows Diagnostics verified live: `pid 16420, cpu 1.1, rss 15.0 MB, elapsed 00:04,
  is_self true`.
- 171 tests green at wrap.

## Where I made it worse first [SETTLED]

Recorded because the same three moves will tempt the next session:

1. Scaled ring/gap by `leafCount` — produced 155:1 pancakes.
2. Two wrong packing constants in a row, guessed rather than measured. Stopped guessing and
   closed the loop instead.
3. Declared the projections fixed on the aspect-ratio metric. The owner's eye was the
   instrument that caught it.

Also: my first breadcrumb-camera test asserted `cameraTarget` became non-null while the
`GraphScene` mock stubbed `computeCameraTarget: () => null` — the test could never fail for the
right reason. Rewrote the mock to record calls and return an id-derived marker.

## Constants and where they came from [SETTLED]

| Constant | Value | Provenance |
|---|---|---|
| `PACKING` | 0.5 | closed-loop calibration, not a guess |
| `LEAF_RADIUS_K` | 0.78 | same |
| `SPHERE_SPACING_K` | 3.81 | same |
| `LIGHT_LUM_MAX` | 0.5 | Rec. 709 luminance ceiling for ink on `#f5f6fa` |
| `LIGHT_DIM` | 0.5 | dark's 0.15 mirrored would erase the graph |
| `FIT_MARGIN` / `MIN_RADIUS` | 1.25 / 60 | camera fit-to-frame, `d = r·margin/sin(fov/2)` |
| `CAMERA_FAR` / `ORBIT_MAX_DISTANCE` | 400,000 / 200,000 | deliberately not larger — near/far ratio costs depth precision |
| `EDGE_CURVE_MAX_EDGES` | 60,000 | above this, curvature segments cost more than they read |

## Open

- **[PROPOSED]** Promote the probe rig's corpus harness out of `scratchpad/`. It caught two
  real defects and would catch the next one, but dies with this machine as-is. Needs a
  provenance header and a call on where a 47k-node fixture lives.
- **[OPEN]** Owner's visual verification of round 4 (sidebar space, breadcrumb dedup, size-map
  walk, jump buttons, Diagnostics). Three of four prior rounds produced corrections nothing
  local caught, so this is not a formality.
- **[OPEN]** The round-4 message arrived truncated (`2.` with nothing after it). Read as the
  underlined duplicated breadcrumb and fixed as such; unconfirmed.
- **[OPEN]** `Signed-off-by` was dropped from `629d43f2`, `7438a2df`, `0bb03c48`, `279d7e25`.
  DCO enforcement is disabled so nothing caught it; those four will fail the gate if it is
  re-enabled on this branch.
