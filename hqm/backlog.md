<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Backlog — proposed, blocked, and undecided

Updated: 2026-07-31 · Queue for planning sessions

## How to use this file

Work that is **not** a defect. Three states only:

- **blocked(owner)** — needs a decision or a go-ahead before any code. A planning session may
  shape the options and the trade-offs; it may not start building.
- **ready** — decided, scoped, nobody has started.
- **open question** — not yet a piece of work; a thing we do not know the answer to.

Defects live in [`bugs.md`](bugs.md). Settled rulings live in [`decisions/`](decisions/) and do
not belong here.

**Much of this list is now absorbed by the approved cycle plan** —
[`plans/2026-07-31-v0.2.0-cycle.md`](plans/2026-07-31-v0.2.0-cycle.md). The plan's own *Pending
decisions* section is the live list of what is undecided; what follows is what predates it and is
still open on its own terms.

**Retired 2026-07-31**, because a ruling answered them — kept here as a pointer only, so nobody
re-opens them:

| Retired entry | Answer, and where it now lives |
|---|---|
| Density dial on the size projections | Not a judgment call any more. Sweep the quantile and match the **approved** graph's 57% intersection figure — method in [`bugs.md`](bugs.md) **B1**, Phase 0 |
| Should the size map share the graph's node budget? | **Yes** — Phase 3 **C10**. The graph already solved it properly: user-controllable budget, persisted per project, honest notice. The size map's hardcoded 8,000 gets the same |
| Are file-kind colours user-themeable? | **Yes** — `KIND_COLORS` joins the override store, so the one Colours tab serves both views. [`bugs.md`](bugs.md) **B3**, Phase 4a |

---

## blocked(owner) — added 2026-07-31

### Whitelist semantics for the ignore rules — decided by a session, not the owner

The target scope became **any path, including a whole hard drive**. The plan resolves whitelisting
as **two controls** — folder rules prune the walk, filetype rules filter with descent handled for
us — because that is the only reading that survives drive scale. **That is a session's call sitting
in the owner's plan.** Confirm or override before Phase 4c.

### When does promotion happen

`main` is **14+ commits behind** and crons read the default branch, so **no CI fix is in effect**.
This cycle adds more. At some point the gap stops being deferral and becomes a second branch nobody
tests. Not scheduled.

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

### Whether the treemap stays the default view

It currently takes the slot the graph's force layout occupies, and is what opens on a cold visit.
Defensible — it is the exact answer — but the projections are the reason this work happened. One
line to change either way; not mine to change.

## ready

### Widen `Breadcrumb`'s `onSelect` to pass the `Crumb`

Unblocks **B2** properly instead of working around it. Touches `GraphTab` as well as `SizeTab`,
which is why it was not done inline mid-feature. Settled 2026-07-31 and scheduled — it lands in the
Phase 3 parity sweep.

### Promote the remaining probe rig out of `scratchpad/`

**Half done, 2026-07-31.** The size-map half is promoted and committed — `sizeMapSphereProbe.ts`
plus its worker, hook, runner and tests, with a **seeded synthetic corpus**, so the fixture question
that blocked this ("where does a 47k-node fixture live") is answered by not needing one. Ruling:
[`decisions/2026-07-31-sphere-probe-seeded-corpus.md`](decisions/2026-07-31-sphere-probe-seeded-corpus.md).

**Still in `scratchpad/`: `view-layout-probe/`** — the projection-geometry rig, which measures the
relationship graph's own layout rather than the size map's radii. Same treatment would work
(generated corpus, own vitest config); nobody has needed it since. Its `corpus.json` is also the
approved graph's reference measurement, so promoting it means deciding what stands in for a real
47k-node *graph* payload — a harder question than the size map's, because the calibration figure
itself came from that file.

### Naming residue: "CBM" / "codebase-memory" → Cartograph

End-user surfaces are clean. Remaining hits are localStorage keys (`cbm-*`), the pin file, and
upstream docs. The pin and upstream docs keep the upstream name for provenance — that part is
deliberate, not residue. The storage keys are user-invisible; renaming them silently resets
everyone's panel widths and sort orders, so it needs a migration or a decision not to bother.

## open questions

### Should the spacing dial be a user control?

The probe measures it and the footer now states it, but nobody can move it by hand — the delegated
measurement is the only writer. Two things argue for a control: the value is
**projection-and-corpus-dependent** (measured — the `tree` fit no-ops across half the range on one
corpus and responds across all of it on another), and C10 is already giving the size map a
user-controllable node budget, so a second dial in the same menu is cheap. Against: two controls
that both change how crowded the scene looks, and the measured answer has agreed with the shipped
value on every corpus tried so far.

### Does the size map need the graph's dead-code lens equivalent?

The graph has a code-health lens (`status` colouring, entry-point/test filters). The size map has
no equivalent question — "which bytes are dead" is arguably a real one (unreferenced assets,
orphaned build output) but it needs the graph's reachability data joined to the disk walk, and
those two datasets currently do not meet.

### Upstream offer boundary

`hqm/` is excluded by construction. Some of this cycle's work is arguably upstream-shaped — the
callback-ref fix, the log level filters, the folder search — and some is not (Cartograph naming, the
size projections). No offer is prepared, and **no PR is raised on the DeusData upstream without
Rahul's explicit instruction**, every time.
