<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Backlog — proposed, blocked, and undecided

Updated: 2026-07-30 · Queue for planning sessions

## How to use this file

Work that is **not** a defect. Three states only:

- **blocked(owner)** — needs a decision or a go-ahead before any code. A planning session may
  shape the options and the trade-offs; it may not start building.
- **ready** — decided, scoped, nobody has started.
- **open question** — not yet a piece of work; a thing we do not know the answer to.

Defects live in [`bugs.md`](bugs.md). Settled rulings live in [`decisions/`](decisions/) and do
not belong here.

---

## blocked(owner)

### Document distillers

PDF, spreadsheets, slides, Word, images → `ingest_overlay` manifests. **PDF first.**
Extension-keyed, one distiller per source kind, one shared delivery contract.

This is the work the whole "Cartograph generalises past code" position exists to enable — end-user
surfaces never say "HQM", nodes arrive as generic `Document`/`External`/`Missing`. Two rulings
already constrain it before a line is written:

- **Classification is by file extension, never by path pattern** (owner ruling). Generalised
  corpora are disorganised; one person's `docs/` is another's `Scans 2019`.
- **Indexed ≠ present.** Any view answering "what is in this corpus" must name which it means and
  default to *present*. The size map's 98%-of-bytes miss was exactly this bug, and a distiller
  that only reports what it managed to parse repeats it.

Needs: the go-ahead, and a call on whether a distiller runs in-process or as a sidecar.

### Density dial on the size projections

`RADII_FIT_QUANTILE = 0.70`. Judgment on a measured trade curve, not a derived constant. Table of
what each notch costs is in
[`decisions/2026-07-30-size-map-as-projection.md`](decisions/2026-07-30-size-map-as-projection.md).
Revisit once the owner has looked at it (**B1**).

### Whether the treemap stays the default view

It currently takes the slot the graph's force layout occupies, and is what opens on a cold visit.
Defensible — it is the exact answer — but the projections are the reason this work happened. One
line to change either way; not mine to change.

## ready

### Widen `Breadcrumb`'s `onSelect` to pass the `Crumb`

Unblocks **B2** properly instead of working around it. Touches `GraphTab` as well as `SizeTab`,
which is why it was not done inline mid-feature.

### Promote the probe corpus harness out of `scratchpad/`

Both probe rigs load real payloads that are gitignored, so neither runs on a clean checkout. The
harness itself (strided nearest-neighbour sampling, clearance quantiles, the reference measurement
of the approved layout) has proved useful three times now and is the only reason the density
mistake was caught. Blocked on nothing except a call on **where a 47k-node fixture lives** — the
repo, a release asset, or regenerated on demand. See also **B7**.

### Naming residue: "CBM" / "codebase-memory" → Cartograph

End-user surfaces are clean. Remaining hits are localStorage keys (`cbm-*`), the pin file, and
upstream docs. The pin and upstream docs keep the upstream name for provenance — that part is
deliberate, not residue. The storage keys are user-invisible; renaming them silently resets
everyone's panel widths and sort orders, so it needs a migration or a decision not to bother.

## open questions

### Are file-kind colours user-themeable?

Decides how **B3** is fixed, and whether `KIND_COLORS` joins the override store or stays fixed
product palette.

### Does the size map need the graph's dead-code lens equivalent?

The graph has a code-health lens (`status` colouring, entry-point/test filters). The size map has
no equivalent question — "which bytes are dead" is arguably a real one (unreferenced assets,
orphaned build output) but it needs the graph's reachability data joined to the disk walk, and
those two datasets currently do not meet.

### Should the size map share the graph's node budget?

The graph exposes an explicit node budget; the size map hard-caps at 8,000 with a footer notice.
Parity would argue for one control. Against: the size cap exists because a treemap of 400k files is
pathological regardless of what the user asks for.

### Upstream offer boundary

`hqm/` is excluded by construction. Some of this cycle's work is arguably upstream-shaped — the
callback-ref fix, the log level filters, the folder search — and some is not (Cartograph naming, the
size projections). No offer is prepared, and **no PR is raised on the DeusData upstream without
Rahul's explicit instruction**, every time.
