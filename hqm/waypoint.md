<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Waypoint — HQM work in this fork

Updated: 2026-07-30 · Focus set by: Rahul

Read this first if you are opening this repository cold. Everything below is HQM-owned work
layered on the adopted upstream; see [`README.md`](README.md) for why this directory exists.

**The next two modes are planning and bug tracking.** Two registers carry that, and they are
where a session starts:

- [`bugs.md`](bugs.md) — open defects, severity, repro, what is `awaiting(Rahul)`
- [`backlog.md`](backlog.md) — proposed work, blocked work, open questions

Do not re-derive either from the git log. If work is not in one of those two files or in
[`decisions/`](decisions/), it is not tracked.

## Current focus

**Cartograph** — the HQM product name for this fork's viewer (`graph-ui/`). Never
"Codebase Memory" on any end-user surface. Per HQM-Astra's adoption ruling
(`astra/decisions/2026-07-30-cartograph-adopt-viewer.md`), this repository's database and
viewer *are* the interactive map experience; HQM's own static map is feature-frozen as the
shareable artifact and no-binary fallback. HQM data arrives through `ingest_overlay` from
HQM-Astra's `src/tools/dev/hqm-md-bridge.js` as generic `Document`/`External`/`Missing`
nodes — **end-user surfaces never say "HQM", and Cartograph generalizes past code to
documents of any trade** (PDF, sheets, slides, images).

**State:** the 10-item feature port landed (`f410ec71`, `2309365b`); **eight rounds of owner
review** followed. Rounds 1–4 found 16 visual defects the green suite never saw
(`46d3f0c3` … `279d7e25`). Rounds 5–8 fixed four more defects and did the parity work: the
size map became a fourth-projection view of the same hierarchy, and both tabs now share one
shell. 212 tests green, binary rebuilt, served.

**The live edge is the owner's visual verification of rounds 5–8** — logged as **B1** in
[`bugs.md`](bugs.md), with the specific surfaces and the one open question (the size
projections' density). Three of the first four rounds produced corrections nothing local
caught, and rounds 5–8 were *entirely* owner-found or owner-directed. Do not treat a green
suite as evidence that a visual change works.

## Judgment layer

- **Visual work is owner-verified, not suite-verified.** Twenty defects across eight rounds;
  the suite was green for every one, the type checker clean, my own reads unsuspicious. Ship a
  round, then stop and ask for eyes. **Never declare a visual fix done on a metric of my own
  choosing** — I did exactly that on the projections and the owner overturned it, then did it
  again on sphere density (below).
- **Calibrate against something already accepted, not against an ideal.** I built the size
  projections to "no spheres overlap", hit it, and produced a near-empty scene. The *approved*
  relationship graph measures 57% of sampled nodes intersecting a neighbour. An invented target
  that sounds unarguable can be further from the product than the messy thing already shipping.
  Measure the accepted artifact first.
- **A test can defend a regression.** When I overrode the owner's `mt-auto` ruling with my own
  reasoning, I also wrote the test that locked it in — so the suite protected the defect. If a
  test asserts a behaviour, check whose call that behaviour was.
- **Parity is the default across the two views; divergence needs a stated reason.** Owner
  ruling: *"keeping the UI as consistent as possible, only changing the information."* Shared
  shell, shared persistence keys, one control per job. See
  [`decisions/2026-07-30-view-parity.md`](decisions/2026-07-30-view-parity.md).
- **Filter where the data enters, not where it is rendered.** Kind chips first filtered the
  emitted graph nodes: the treemap ignored them entirely and folder byte totals still counted
  hidden files, so two views disagreed about one folder's size.
- **A measurement effect keyed on mount cannot measure an element that mounts later.** Any
  element behind an early return needs a callback ref, not `useRef` + `useEffect([])`. This is
  why the size map drew nothing.
- **"The controls don't work" and "the scene is misframed" look identical from outside.** The
  size map's camera was fine; nothing was framing the scene, and the extent runs ~450 to
  ~19,000 units against a camera at z=800.
- **A theme that changes how light behaves is a render-model change, not a palette change.**
  Reach for the blend equation before the colour picker. Corollary: **Tailwind v4 opacity
  modifiers (`text-foreground/70`) compile to a real alpha and can never be theme-aware** —
  name the ink role instead. See
  [`decisions/2026-07-30-light-is-a-render-model.md`](decisions/2026-07-30-light-is-a-render-model.md).
- **When a visualization looks wrong but the geometry is valid, the metric being optimized is
  the suspect.** Measure what the eye reads (nearest-neighbour spacing), not what is easy to
  compute (extent, aspect); then measure the output and rescale. See
  [`decisions/2026-07-30-layout-spacing-metric.md`](decisions/2026-07-30-layout-spacing-metric.md).
- **When a platform stub becomes real, audit what its authorization was `#ifdef`'d around.**
  The `/api/kill` guard lived inside `#ifndef _WIN32`, so Windows had no check at all. A guard
  that never ran was never tested.
- **Indexed ≠ present.** Any view answering "what is in this corpus" must name which it means
  and default to *present*. Reading `file_hashes.size` for the size map omitted 98% of the
  bytes. This lands directly on the planned document distillers.
- **Classification is by file extension, never by path pattern** (owner ruling). Generalized
  end-user corpora are disorganized; folder conventions cannot be assumed.
- **An icon that makes a claim gets drawn by hand.** Two stock icons failed on the graph tab —
  `Share2` is the platform share affordance, `Waypoints` is a linear path with no fork. Stock is
  fine for ordinary things.
- **Code-level rationale belongs in the code**, in comments beside what it explains — that is
  what travels if a change is offered upstream. `hqm/` carries only what a comment cannot: the
  options rejected, the measurements, the attempts that failed.
- **Never raise a PR on the DeusData upstream without Rahul's explicit instruction.** Preparing
  branches and patches locally is fine; the outward offer is owner-gated, every time.

## Active set

- [`bugs.md`](bugs.md) · [`backlog.md`](backlog.md) — the two working registers
- [`decisions/2026-07-30-view-parity.md`](decisions/2026-07-30-view-parity.md) — one shell, two
  measures; and the type scale
- [`decisions/2026-07-30-size-map-as-projection.md`](decisions/2026-07-30-size-map-as-projection.md)
  — bytes as volume, the density trade table, two dead ends not to retry
- [`decisions/2026-07-30-light-is-a-render-model.md`](decisions/2026-07-30-light-is-a-render-model.md)
  — the two-stage renderer and the constraints behind it
- [`decisions/2026-07-30-layout-spacing-metric.md`](decisions/2026-07-30-layout-spacing-metric.md)
  — spacing is the invariant; extent and aspect are blind
- [`notes/2026-07-30-usability-arc.md`](notes/2026-07-30-usability-arc.md) — rounds 1–4: 16
  defects with real causes, the measurements, the constants' provenance
- [`notes/2026-07-30-parity-rounds.md`](notes/2026-07-30-parity-rounds.md) — rounds 5–8
- Pure logic, all unit-tested without WebGL: `graph-ui/src/lib/` — `sceneInk.ts` ·
  `appearance.ts` · `viewLayout.ts` · `sizeMap.ts` · `sizeGraph.ts` · `sortOrder.ts` ·
  `panelState.ts` · `typeScale.ts`
- Shared UI shell: `CollapsibleSection.tsx` · `ResizeHandle.tsx` · `SortControl.tsx` ·
  `TabIcons.tsx` — used by both tabs, so a change lands on both
- `src/ui/http_server.c` — `/api/open` (root-fenced), `/api/file-sizes` (disk walk),
  `/api/processes` + `/api/kill` (Windows path and its guard)

## Reference

- **Build and run (two recipes that each cost real time to find):**
  - C + UI: `MSYSTEM=CLANG64 /c/msys64/usr/bin/bash -lc 'export PATH="$PATH:/c/Program Files/nodejs"; cd /f/Git/HQM-CodeBase-Memory-fork && scripts/build.sh --with-ui --version v0.9.0-hqm-v0.1.0 CC=clang CXX=clang++'` — two traps: plain `bash -lc` picks Git Bash and fails with `compiler 'clang' not found in PATH`, and `MSYSTEM` must be set *before* the login shell starts (the shell reads it to configure the toolchain PATH), so exporting it inside `-lc` is too late. Node comes from the export because an MSYS login shell drops the Windows PATH.
  - UI only: `cd graph-ui && npm run build && npm run test`.
  - **Stop the server before relinking** — Windows holds the binary open and `ld.lld` fails.
    `Stop-Process` by name, rebuild, then restart.
  - Restart: PowerShell `Start-Process … -ArgumentList "--ui=true","--port=9749" -WindowStyle Hidden`.
    **Not** `nohup ./binary &` from bash — curl then exits 7.
  - Server at `http://127.0.0.1:9749`. **Confirm the served bundle hash actually changed**
    (`curl -s http://127.0.0.1:9749/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'`) before
    believing a UI fix shipped.
  - `ld.lld` duplicate-symbol warnings are an upstream grammar quirk, non-fatal.
- **Test invocation:** `npx vitest run`. `--reporter=basic` was removed in vitest 4 and errors
  out; the default reporter is fine. Vitest 4 also swallows `console.log` under `run`, so the
  probe rigs write a report file instead.
- Probe rigs, both gitignored with their own READMEs:
  `graph-ui/scratchpad/view-layout-probe/` (projection geometry) and
  `graph-ui/scratchpad/size-graph-probe/` (size-map overlap and clearance, plus the reference
  measurement of the approved server layout). Durable invariants are banked in
  `graph-ui/src/lib/*.test.ts`.
- **Branches:** `HQM-dev` = active dev · `vanilla-upstream` = upstream pull-in only ·
  `Merged` = integration · `main` = stable face of Merged, repo default. **Promotion is
  HQM-dev → Merged → main. Never HQM-dev → main, never a direct commit on main.**
- **CI is dark** (owner order): every registered workflow `disabled_manually`. Build and
  validate locally. Crons and dispatched workflows are read from the *default* branch, so a
  CI-config fix only takes effect once it reaches main. Re-enable with
  `gh workflow enable <file> --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
- Release `v0.9.0-hqm-v0.1.0` exists as a **draft** with every platform asset built; publish by
  hand with
  `gh release edit v0.9.0-hqm-v0.1.0 --draft=false --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
  HQM-Astra's `cbm.pin.json` update waits on a published release.
- Upstream patch offer (owner-gated):
  `git checkout -b feat/knowledge-overlay-ingest upstream/main && git cherry-pick c8d4d25c 28f32e70 f52a791f`
  — one help-text conflict in `cli.c` resolves to the 16-tool list. The fork has no GitHub fork
  linkage, so a cross-repo PR needs a true fork or an issue+patch offer.
- Commits carry Rahul's git identity and a `Signed-off-by` trailer. **No AI co-author trailer,
  ever.**

## Board and release, outside this repo

- Publish the draft release, then update HQM-Astra's `cbm.pin.json`.
- Board writes still pending: **#69** comment, **#68** close.
