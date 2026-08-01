<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# The B1 rounds and the v0.2.0 build-out — the rulings of 2026-08-01

Decided: 2026-08-01 · Ruled by: Rahul (live, five same-day rounds) · Status: settled, except
where marked **NOT approved**

One session took the cycle from "Phase 2 done" to "owner decisions are the remaining work"
(commits `6df28d07..338194db` on `HQM-dev`, plus `49c4ad7` on HQM-Astra `dev`). The plan doc
carries the per-item strikes; **this record carries the design rulings** so none of them has to
be re-derived from commit messages.

## The working mode that made it fast — and its rule

Serve → owner's eyes → fix → rebuild → re-serve, five rounds in one day, ~20 minutes per
rebuild, `hqm/scripts/serve-cartograph.bat` doing the serving. The standing rule survived
intact: **nothing visual is closed without the owner's eyes on the served bundle, and the
bundle hash is the proof of freshness** (`BcsUzG7C → LIahPU0Q → y6bdzKzv → knr71gQV →
BPbhEuU_ → CW4R01ad → Bo_D9Kfv`). Round 6 (`Bo_D9Kfv`, the colour system + A3a) was served and
**explicitly NOT approved — the owner deferred verdicts to a fresh session.** Only round 1's
approvals (tab icons, Diagnostics, right-panel dock, sidebar "mostly") and round 2's density
verdict are eye-certified. Everything later is suite-green and unjudged.

## Density: the eye overrules the probe's calibration, the probe stays the governor

0.70 shipped at ~21–22% overlap, inside the old 5–25% band, dense tie-break — and the owner
ruled it **too crowded** on screen. The correction moved the constants, not the verdict:
ceiling 25→**18%**, tie-break flipped to **sparse** (the empty-starfield failure lives below
the band's floor — the floor guards it, not the tie-break), dial 0.70→**0.85**, and the probe's
recommendation equals the shipped value on the real corpus (10.3/10.0/6.3% across
sphere/cone/tree). Two tests that encoded the old ruling were rewritten to the new one — same
authority both times. **The owner's stated reason binds future judgment: the scene reads right
BECAUSE it is 3D and rotates. Spacing is never judged from a static screenshot.** The probe
also proved its per-corpus worth live: on a 121-file corpus it measured and applied 0.75 on its
own — that is the mechanism working, not drift.

## The panel layout: four rulings, one chain, all the owner's

1. 2026-07-30 — collapsed Folders anchored to the column floor (`mt-auto`).
2. Round 1 — "collapse to the left corner": strips gather at the top.
3. Round 3 — a collapsed section leaves the column for a **vertical tab on a slim left rail**,
   individually.
4. Round 4 — the rail is permanent (Filters' tab top, **Folders' tab middle**), and open
   sections float over the map as a **content-height card** — the map owns the full width, the
   drag edge rides the card.

Each step overruled the previous one, each is recorded where the code is, and the defending
tests were rewritten each time. The lesson that keeps: **a test can defend any layout; what
matters is whose call it encodes and which call is newer.**

## The icon language

Cross-link buttons are **glyph-only** in the toolbars; the **Projects tab teaches the glyphs**
(icon-before-word on View Graph / View Size Map). This resolved B14 (the graph glyph read as a
share icon — the owner hunted for that exact button and missed it) after a one-round experiment
with words in the toolbar. Rule of thumb banked: words teach where there is room; glyphs serve
where there is not; the teaching surface and the compact surface must use the same glyph.

## One colour system

Labels, edge types (wanted-list item 5) and file kinds (B3) resolve through one override
pattern (`colorForLabel` / `colorForEdge` / `colorForKind`), persist in one per-theme record,
and edit through the ONE Colors tab in whichever view they serve. Kind overrides ride in
`labelColors` — kinds are lowercase, labels Capitalised, the keyspaces cannot collide. Foreign
vocabularies (overlay edge types like `CROSS_SOURCE`, unknown labels) get stable hash hues, so
nothing renders as undifferentiated grey. The renderer takes overrides as a prop so an edit
re-derives geometry; a private renderer table (the previous state) is the defect shape this
kills — it could not be overridden and silently disagreed with the panel.

## Parity, extended by owner order

- **Toolbars in the graph tab's exact order in both views:** Nodes · Settings · cross-link ·
  Export · ? · projection · orbit · Refresh. Export ships the current size projection as the
  same standalone page; disabled on the treemap with its reason stated.
- **One trail surface, the shared header slot:** drill path when nothing is picked (click
  focuses a level, root clears), picked ancestry while a pick exists. The drill row above the
  map is gone; level totals joined the footer.
- **Controls never appear/disappear with the view** (B13): disabled-with-reason beats hidden.

## Exits

Drilling in must always have a visible way out. C9 removed the Up button while the drill row
existed; round 4 moved the trail to the header and silently took the exit with it — round 5
restored it as a toolbar `↑ Up` (shown only while drilled) plus Esc (clear pick first, then
climb). Lesson banked: **when a layout moves, re-check what earlier removals leaned on.**

## Filters persist as exclusions (A3a)

Per project, stored as the DISABLED set (`cbm-disabled-labels/edges/kinds:<project>`),
re-derived from the loaded corpus on every change. Exclusions, never allowlists: a type seen
for the first time is visible immediately, and stale types cannot accumulate. The A3a split
stands — filters per project; theme, widths, sort orders, projection global. (This widened the
`cbm-*` keyspace again — the naming-residue decision got MORE urgent, ledger item 12.)

## Registered, not built

The **containment projection** (owner-proposed, round 5): folders as thick translucent spheres
with children physically inside, recursively — the ratchet-field model at
`F:\Git\HQM-Observatory\substrate\theory\models\2026-07-24-ratchet-field-theory-v2.html` is the
feel-spec. In `backlog.md` as ready; awaiting the explicit go.

## Related

`bugs.md` B1/B3/B12–B14 · `backlog.md` (containment, struck B2 entry) ·
`2026-07-31-sphere-probe-seeded-corpus.md` (the probe this recalibrates) ·
`2026-07-30-view-parity.md` (the parity ruling all of this extends) · waypoint § SESSION STATE
2026-08-01 (the PENDING ON RAHUL ledger).
