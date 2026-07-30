<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Waypoint — HQM work in this fork

Updated: 2026-07-30 · Focus set by: Rahul

Read this first if you are opening this repository cold. Everything below is HQM-owned work
layered on the adopted upstream; see [`README.md`](README.md) for why this directory exists.

## Current focus

**Cartograph** — the HQM product name for this fork's viewer (`graph-ui/`). Never
"Codebase Memory" on any end-user surface. Per HQM-Astra's adoption ruling
(`astra/decisions/2026-07-30-cartograph-adopt-viewer.md`), this repository's database and
viewer *are* the interactive map experience; HQM's own static map is feature-frozen as the
shareable artifact and no-binary fallback. HQM data arrives through
`ingest_overlay` from HQM-Astra's `src/tools/dev/hqm-md-bridge.js` as generic
`Document`/`External`/`Missing` nodes — **end-user surfaces never say "HQM", and Cartograph
generalizes past code to documents of any trade** (PDF, sheets, slides, images).

**State:** the 10-item feature port landed (`f410ec71`, `2309365b`), then **four rounds of
owner review found 16 visual defects the green suite never saw** — fixed across
`46d3f0c3` … `279d7e25`. 171 tests green, binary rebuilt, served and verified.

**The live edge is the owner's visual verification of round 4.** Three of the four prior
rounds produced corrections nothing local caught. Do not treat a green suite as evidence that
a visual change works.

## Judgment layer

- **Visual work is owner-verified, not suite-verified.** Sixteen defects across four rounds;
  the suite was green for every one, the type checker clean, my own reads unsuspicious. Every
  defect was visual or spatial — invisible ink, collapsed layouts, wasted flex height, a
  treemap of the wrong dataset. Ship a round, then stop and ask for eyes. **Never declare a
  visual fix done on a metric of my own choosing**: I did exactly that on the projections and
  the owner overturned it.
- **A theme that changes how light behaves is a render-model change, not a palette change.**
  Reach for the blend equation before the colour picker — two palette-only fixes failed first.
  Corollary that is easy to get wrong: **Tailwind v4 opacity modifiers (`text-foreground/70`)
  compile to a real alpha and can never be theme-aware** — name the ink role instead. See
  [`decisions/2026-07-30-light-is-a-render-model.md`](decisions/2026-07-30-light-is-a-render-model.md).
- **When a visualization looks wrong but the geometry is valid, the metric being optimized is
  the suspect.** Measure what the eye reads (nearest-neighbour spacing), not what is easy to
  compute (extent, aspect); then measure the output and rescale. Two hand-guessed packing
  constants were both wrong. See
  [`decisions/2026-07-30-layout-spacing-metric.md`](decisions/2026-07-30-layout-spacing-metric.md).
- **When a platform stub becomes real, audit what its authorization was `#ifdef`'d around.**
  The `/api/kill` guard lived inside `#ifndef _WIN32`, so Windows had no check at all — and
  the change that made the process list real is the same change that puts a kill button beside
  every row. A guard that never ran was never tested.
- **Indexed ≠ present.** Any view answering "what is in this corpus" must name which it means
  and default to *present*. Reading `file_hashes.size` for the size map omitted 98% of the
  bytes. This lands directly on the planned document distillers.
- **Classification is by file extension, never by path pattern** (owner ruling). Generalized
  end-user corpora are disorganized; folder conventions cannot be assumed. `lib/fileKind.ts`
  keys on extension only. Path-pattern bucketing is an engineer-corpus affordance.
- **Code-level rationale belongs in the code**, in comments beside what it explains — that is
  what travels if a change is offered upstream. `hqm/` carries only what a comment cannot: the
  options rejected, the measurements, the attempts that failed.
- **Never raise a PR on the DeusData upstream without Rahul's explicit instruction.**
  Preparing branches and patches locally is fine; the outward offer is owner-gated, every time.

## Active set

- [`decisions/2026-07-30-light-is-a-render-model.md`](decisions/2026-07-30-light-is-a-render-model.md) — the two-stage renderer and the constraints behind it
- [`decisions/2026-07-30-layout-spacing-metric.md`](decisions/2026-07-30-layout-spacing-metric.md) — spacing is the invariant; extent and aspect are blind
- [`notes/2026-07-30-usability-arc.md`](notes/2026-07-30-usability-arc.md) — the full session spine: 16 defects with real causes, the measurements, the constants' provenance
- `graph-ui/src/lib/sceneInk.ts` · `appearance.ts` · `viewLayout.ts` · `sizeMap.ts` — the pure logic, all unit-tested without WebGL
- `src/ui/http_server.c` — `/api/open` (root-fenced), `/api/file-sizes` (disk walk), `/api/processes` + `/api/kill` (Windows path and its guard)

## Reference

- **Build and run (two recipes that each cost real time to find):**
  - C + UI: `MSYSTEM=CLANG64 /c/msys64/usr/bin/bash -lc 'export PATH="$PATH:/c/Program Files/nodejs"; cd /f/Git/HQM-CodeBase-Memory-fork && scripts/build.sh --with-ui --version v0.9.0-hqm-v0.1.0 CC=clang CXX=clang++'` — two traps: plain `bash -lc` picks Git Bash and fails with `compiler 'clang' not found in PATH`, and `MSYSTEM` must be set *before* the login shell starts (the shell reads it to configure the toolchain PATH), so exporting it inside `-lc` is too late. Node comes from the export because an MSYS login shell drops the Windows PATH.
  - UI only: `cd graph-ui && npm run build && npm run test`.
  - Restart: PowerShell `Start-Process … -WindowStyle Hidden`. **Not** `nohup ./binary &` from bash — curl then exits 7.
  - Server at `http://127.0.0.1:9749`. Confirm the served bundle hash actually changed before believing a UI fix shipped.
  - `ld.lld` duplicate-symbol warnings are an upstream grammar quirk, non-fatal.
- Layout probe rig: `graph-ui/scratchpad/view-layout-probe/` — gitignored, own `README.md`. Loads a real 47k-node corpus, reports spacing/extent/distinctness. Durable invariants are banked in `graph-ui/src/lib/viewLayout.test.ts`.
- **Branches:** `HQM-dev` = active dev · `vanilla-upstream` = upstream pull-in only · `Merged` = integration · `main` = stable face of Merged, repo default. **Promotion is HQM-dev → Merged → main. Never HQM-dev → main, never a direct commit on main.**
- **CI is dark** (owner order): every registered workflow `disabled_manually`. Build and validate locally. Crons and dispatched workflows are read from the *default* branch, so a CI-config fix only takes effect once it reaches main. Re-enable with `gh workflow enable <file> --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
- Release `v0.9.0-hqm-v0.1.0` exists as a **draft** with every platform asset built; publish by hand with `gh release edit v0.9.0-hqm-v0.1.0 --draft=false --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`. HQM-Astra's `cbm.pin.json` update waits on a published release.
- Upstream patch offer (owner-gated): `git checkout -b feat/knowledge-overlay-ingest upstream/main && git cherry-pick c8d4d25c 28f32e70 f52a791f` — one help-text conflict in `cli.c` resolves to the 16-tool list. The fork has no GitHub fork linkage, so a cross-repo PR needs a true fork or an issue+patch offer.

## Open threads

- Round-4 visual verification (sidebar space, breadcrumb dedup, size-map disk walk, jump buttons, Diagnostics) — awaiting(Rahul).
- Round-4 message item 2 arrived truncated (`2.` with nothing after). Read as the duplicated breadcrumb and fixed as such — awaiting(Rahul) confirmation it was not something else.
- `Signed-off-by` missing on `629d43f2`, `7438a2df`, `0bb03c48`, `279d7e25` — DCO is disabled so nothing caught it; those four fail the gate if it is re-enabled. Ready to fix only if history rewrite is authorized; otherwise carry forward and sign from here.
- Promote the probe rig's corpus harness out of `scratchpad/` — deferred; needs a call on where a 47k-node fixture lives.
- Document distillers (PDF, spreadsheets, slides, Word, images → `ingest_overlay` manifests, PDF first) — blocked(owner go-ahead). Extension-keyed, one distiller per source kind, shared delivery contract.
- Naming residue: "CBM" / "codebase-memory" strings toward Cartograph naming; pin and upstream docs keep the upstream name for provenance.
