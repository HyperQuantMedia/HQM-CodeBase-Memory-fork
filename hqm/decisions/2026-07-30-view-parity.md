<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Two views, one shell: parity is the default, divergence needs a reason

Decided: 2026-07-30 · Ruled by: Rahul · Status: settled

## The ruling

> "We are keeping the UI as consistent as possible, only changing the information."

Cartograph has two views over the same corpus — the relationship graph and the size
map. They answer different questions. They are **not** allowed to be different
products. The shell, the furniture, the gestures and the type are shared; only the
measure changes.

Concretely, both views have:

| | Relationship graph | Size map |
|---|---|---|
| Left column | resizable, `Filters` + `Folders` sections | same |
| `Filters` holds | node types, relationships, dead-code lens | file kinds, measuring source |
| `Folders` holds | node tree, count per folder | size tree, bytes per folder |
| Right column | resizable, docked `NodeDetailPanel` | resizable, docked size panel |
| Toolbar | top-right, `Button` group | same corner, same group |
| HUD | top-left, 11px mono | same corner, same size |
| Projection control | one cycling button | one cycling button |
| Cross-link | the other view's own tab glyph | same |

## Why it needed stating

Every affordance the size map was missing had been *added* to the graph view at some
point, and each time the size map either did without or grew a different answer:

- Filters lived in a strip above the map, not in a panel.
- Details floated in a card over the canvas, not in a docked column.
- Projections were a four-button rail, not a cycling button.
- Cross-links were the words "Graph" and "Sizes", not glyphs.
- There was no folder tree at all.

None of those were wrong in isolation. Together they meant two tabs showing the same
tree had two different sets of furniture, and a user's muscle memory transferred
across neither. The floating card was defended in its own comment on the grounds that
"there is no sidebar here" — which was true, and was the actual defect.

## Consequences

**Shared state, not merely matching layout.** Panel widths and fold flags moved to
`graph-ui/src/lib/panelState.ts` and both tabs read and write the *same* keys, so
dragging the sidebar on one and switching to the other does not jump. Consistency that
depends on two copies staying in step is not consistency. Same for scene settings:
`fov`, orbit and per-stage appearance are properties of how the 3D view renders, not
of which corpus is in it, so the size map uses the graph's persisted `ViewSettings`
and `AppearanceSet` rather than a second copy.

**One control per job.** A four-button rail and a cycling button are two kinds of
control for one decision. Pick the one that already exists.

**Detail panels match field for field.** The size panel now uses
`NodeDetailPanel`'s exact header: `px-4 pt-4 pb-3`, 2.5 dot, 13px semibold title, 10px
kind pill, 16px close, 11px mono path. The kind moved into the pill, so the redundant
"Kind" row is gone. Two panels in the same slot on two tabs that differ in padding and
type read as one of the two being broken.

**Where divergence is legitimate, say so.** The size map keeps a drill-path row the
graph has no equivalent of, because there the path *is* the view's scope, not a
selection trail. The treemap has no Settings or auto-rotate button because it is DOM,
not a scene — fov and bloom have nothing to act on. Both are noted in the code.

## The type scale, written down

Same failure at a smaller grain. The sizes were drifting because each pass that added
a control picked a plausible-looking value near the existing ones. Found in review: a
14px glyph in a row of 15px icons; a 10px HUD line beside an 11px one; a detail panel
in a different type scale from the panel it sits opposite.

The scale is now recorded in `graph-ui/src/lib/typeScale.ts` — 9 / 10 / 11 / 12 / 13 /
`text-sm`, icons 11 / 13 / 15. Every step was already in use; nothing was invented.
New UI picks a step from the list. A step that does not fit means the list is wrong and
changes there, once.

Deliberately **not** a mass conversion of the existing inline `text-[11px]` utilities
to semantic names: several hundred mechanical edits, real risk, no visual result. The
constants exist so new code has somewhere to point and the values have one home.

## Filter at the source, not at the last surface

A corollary found while implementing the above, and the reason it is in this file
rather than a separate one: the kind chips first filtered the *emitted graph nodes*.
That changed the 3D scene and did nothing whatever to the treemap, which squarifies
the tree directly — and a folder's byte total still counted files that were no longer
drawn, so the two views disagreed about the same folder's size.

Filtering the **file list**, before the tree is built, makes the tree, its folder sums,
the tiles, the projections, the crumbs and the side panel describe one corpus. Filter
where the data enters, not where it happens to be rendered.

The chips themselves tally over the *unfiltered* list, or a chip would vanish the
moment it was switched off and there would be no way to switch it back on.

## Related

- [`2026-07-30-size-map-as-projection.md`](2026-07-30-size-map-as-projection.md) — what
  the size map draws, and the density trade it settles
- [`../notes/2026-07-30-parity-rounds.md`](../notes/2026-07-30-parity-rounds.md) — the
  session spine, with the defects that produced this ruling
