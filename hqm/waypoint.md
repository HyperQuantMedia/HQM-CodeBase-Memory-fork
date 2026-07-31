<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Waypoint — HQM work in this fork

Updated: 2026-07-31 · Focus set by: Rahul

Read this first if you are opening this repository cold. Everything below is HQM-owned work
layered on the adopted upstream; see [`README.md`](README.md) for why this directory exists.

**A cycle plan is approved and not yet started. Open it first:**
[`plans/2026-07-31-v0.2.0-cycle.md`](plans/2026-07-31-v0.2.0-cycle.md) — the first upstream pull,
the security hardening, the parity sweep, and `v0.9.0-hqm-v0.2.0`. Its rulings are in
[`decisions/2026-07-31-stay-on-the-v0.9.0-line.md`](decisions/2026-07-31-stay-on-the-v0.9.0-line.md);
the pending decisions are at the bottom of the plan. **Phase 0 is B1, and it gates everything
else.**

Three registers carry the rest, and they are where a session starts:

- [`bugs.md`](bugs.md) — open defects, severity, repro, what is `awaiting(Rahul)`
- [`backlog.md`](backlog.md) — proposed work, blocked work, open questions
- [`plans/`](plans/) — what is queued to move next

Do not re-derive any of it from the git log. If work is not in one of those files or in
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

Two CI defects were found and fixed the same day, both in files nobody was working on — surfaced
only because an editor false positive (**B8**) sent us reading them: `nightly-soak.yml` called a
workflow that declared no `workflow_call` and passed an input it never had, and both soak
workflows declared `type: number` on a `workflow_dispatch` input, which is illegal. `7825f288`,
`dce7050c`.

**Landed and pushed to `origin/HQM-dev` on 2026-07-30** (`ea3e54f6..155f7bdc`), all signed, none
promoted further:

| Commit | What |
|---|---|
| `e28279db` | size map as a fourth projection; one shell for both views; 4 defects fixed |
| `e4c21a1c` | the two rulings, the rounds 5–8 spine, `bugs.md` + `backlog.md` |
| `7825f288` | non-callable `soak.yml` reference; deprecated `baseUrl` removed |
| `dce7050c` | `type: number` illegal under `workflow_dispatch` |
| `c4f2aa26` | **B8** — the reusable-workflow diagnostics are an editor false positive |
| `155f7bdc` | the CI-dark claim in this file was wrong; corrected |

**Promotion — done locally on 2026-07-31, not pushed.** `Merged`, `HQM-dev` and `main` all sit at
`e2c2a1c0` on this machine, which is the verified upstream-merge commit (5775 C tests / 0 failed,
260 UI tests, built `--with-ui`, served, bundle hash confirmed changed). `origin` is untouched:
`origin/HQM-dev` at `2be1a469`, `origin/Merged` and `origin/main` at `56c2feb9`. All three pushes
would be fast-forwards (+15 / +31 / +31).

The consequence of pushing `main` is the one to weigh: crons and dispatched workflows are read from
the **default** branch, so the two CI repairs (`nightly-soak.yml`'s non-callable reference, the
illegal `type: number`) take effect the moment it lands, after standing dark since 2026-07-30. No
*new* workflow file is in this range — `pr-acknowledgement.yml` is in upstream work we did not
take. The four commits without `Signed-off-by` (**B6**) also land, inert while DCO is disabled.

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
- [`plans/2026-07-31-v0.2.0-cycle.md`](plans/2026-07-31-v0.2.0-cycle.md) — **the approved cycle**:
  first upstream pull, hardening, parity sweep, `v0.9.0-hqm-v0.2.0`, and every pending decision
- [`decisions/2026-07-31-stay-on-the-v0.9.0-line.md`](decisions/2026-07-31-stay-on-the-v0.9.0-line.md)
  — why we sit on v0.9.0 by choice, why the daemon waits, the version rule
- [`notes/2026-07-31-upstream-issue-overlap.md`](notes/2026-07-31-upstream-issue-overlap.md) —
  DeusData's open issues that touch our work, and what is worth offering back
- [`decisions/2026-07-31-sphere-probe-seeded-corpus.md`](decisions/2026-07-31-sphere-probe-seeded-corpus.md)
  — the spacing dial is measured now: committed probe, seeded corpus, delegated thread, the 2 s
  notify rule, and the fixture fault that looked exactly like a layout fault
- [`decisions/2026-07-31-vanilla-sync.md`](decisions/2026-07-31-vanilla-sync.md) — how
  `vanilla-upstream` follows upstream without lighting the repo up
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
  `panelState.ts` · `typeScale.ts` · `sizeMapSphereProbe.ts`
- **The spacing probe**, the first delegated background job in this UI: `npm run probe:spheres`
  headless, or the size view's footer "measure" link to run it on a worker over the corpus on
  screen. Past 2 s it says so and names what is still being shown; it applies a value only when
  every projection landed inside the band, and never touches the dial otherwise.
  `src/lib/sizeMapSphereProbe.ts` · `src/workers/sizeMapSphereProbe.worker.ts` ·
  `src/hooks/useSizeMapSphereProbe.ts` · `scripts/sizeMapSphereProbe.sweep.ts`
- Shared UI shell: `CollapsibleSection.tsx` · `ResizeHandle.tsx` · `SortControl.tsx` ·
  `TabIcons.tsx` — used by both tabs, so a change lands on both
- `src/ui/http_server.c` — `/api/open` (root-fenced), `/api/file-sizes` (disk walk),
  `/api/processes` + `/api/kill` (Windows path and its guard)

## Reference

- **Build and run (two recipes that each cost real time to find):**
  - C + UI: `MSYSTEM=CLANG64 /c/msys64/usr/bin/bash -lc 'export PATH="$PATH:/c/Program Files/nodejs:/c/Program Files/Git/cmd"; cd /f/Git/HQM-CodeBase-Memory-fork && scripts/build.sh --with-ui --version v0.9.0-hqm-v0.1.0 CC=clang CXX=clang++'` — three traps: plain `bash -lc` picks Git Bash and fails with `compiler 'clang' not found in PATH`; `MSYSTEM` must be set *before* the login shell starts (the shell reads it to configure the toolchain PATH), so exporting it inside `-lc` is too late; and an MSYS login shell drops the Windows PATH, so **both `nodejs` and `Git/cmd` have to be exported back**. Node's absence fails loudly. **Git's absence fails as 23 test failures** — see the test-invocation note below.
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
- **`git` must be on PATH or 23 C tests fail, and none of them say why.** An MSYS `CLANG64` login
  shell has no Windows `git`. The suite's own summary reads `5751 passed, 23 failed`; the cause
  appears once, far up the log, as `'git' is not recognized as an internal or external command`.
  Add `/c/Program Files/Git/cmd` to the export and it is `5775 passed, 0 failed, 18 skipped`.
  Verified both ways on 2026-07-31, in that order, on the same tree.
- **Keep the whole log.** `scripts/test.sh … | tail -35` keeps the summary and discards which tests
  failed, and the pipe also swallows `make`'s exit code, so a failing run reports success. Redirect
  to a file (`> scratchpad/c-suite/run-N.log 2>&1; echo "EXIT=$?"`) and grep it. A clean build takes
  ~25 minutes, so a run whose failures you cannot read costs another 25.
- **`scripts/test.sh` deletes `graph-ui/node_modules`** — its first step is `scripts/clean.sh`,
  which removes both `node_modules` trees and `graph-ui/dist` by design ("no stale node_modules").
  So **run the UI suite before the C suite**, or `npm install` again after. The failure is
  confusing rather than obvious: `npx tsc` then downloads an unrelated `tsc` package from npm and
  prints *"This is not the tsc command you are looking for"*, which reads like a broken toolchain
  rather than a missing install. Run from `graph-ui/`, and check `node_modules` exists first.
- **Spacing sweep:** `cd graph-ui && npm run probe:spheres` — own config, so it never joins
  `npm test`. Output in `graph-ui/scratchpad/sphere-probe/report.txt`. Seeded synthetic corpus by
  default; `SPHERE_PROBE_CORPUS=<file-sizes.json>` points it at a real one, and
  `SPHERE_PROBE_FILES` / `SPHERE_PROBE_SEED` size the synthetic one. **Read the `corpus:` line
  before trusting a sweep** — a degenerate result is usually the fixture, not the layout.
- Probe rigs, both gitignored with their own READMEs:
  `graph-ui/scratchpad/view-layout-probe/` (projection geometry) and
  `graph-ui/scratchpad/size-graph-probe/` (size-map overlap and clearance, plus the reference
  measurement of the approved server layout). Durable invariants are banked in
  `graph-ui/src/lib/*.test.ts`.
- **Branches and the direction work flows — corrected by the owner 2026-07-31.**

  | Branch | Job |
  |---|---|
  | `vanilla-upstream` | vanilla drops. Mirror only, never checked out, holds no HQM code |
  | `Merged` | **integration.** Upstream lands *here first*; merge conflicts and fallout are fixed *here* |
  | `HQM-dev` | our development work, protected from raw upstream churn |
  | `main` | our own independent version, cut from `HQM-dev`. Repo default |

  **Flow: `vanilla-upstream` → `Merged` (merge, fix, verify) → `HQM-dev` (after greenlight and
  stability feedback) → `main` (version cut).** Never a direct commit on `main`.

  **So containment runs the opposite way from a normal release chain: `main` ⊆ `HQM-dev` ⊆
  `Merged`.** `Merged` is the *most* advanced branch, not the least — it carries upstream work our
  own line has not accepted yet. An earlier version of this file said "promotion is HQM-dev →
  Merged → main", which had it backwards and made `Merged` look like a staging area for our work
  instead of a quarantine for theirs.

  **Bring `Merged` up to `HQM-dev` before each upstream take.** `Merged` is not a long-lived
  divergent branch; it is a landing strip. Merging upstream into a stale `Merged` integrates
  against a base that lacks our current work, and the fallout then surfaces at the
  `Merged → HQM-dev` step where it is far harder to attribute. Live example: on 2026-07-31
  `Merged` sat **20 commits behind** `HQM-dev`, so the missed-graph merge would have been
  integrated against a tree with no spacing probe, no light-stage render model and no size-map
  parity — and the four light-theme defects the port carried would have been invisible.
- **Syncing `vanilla-upstream`:** `hqm/scripts/sync-vanilla.sh` (report only) then
  `--push`. Never checked out — the push is a refspec from the fetched upstream ref, so no
  local branch exists to drift. It **refuses** when the incoming range adds or renames a file
  under `.github/workflows/`, and refuses when the branch is not an ancestor of
  `upstream/main`. `--setup` is the one-time local config. Ruling and the rejected
  alternatives: [`decisions/2026-07-31-vanilla-sync.md`](decisions/2026-07-31-vanilla-sync.md).
  Last synced 2026-07-31: `7dd8d220 → a65faeb4`, 23 commits, no run created.
- **CI is mostly dark** (owner order). Build and validate locally. Verify the real state
  rather than trusting this list — `gh workflow list --all --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
  As of 2026-07-30: `disabled_manually` = CodeQL SAST, DCO, Deploy Pages, Release, OpenSSF
  Scorecard, Stale, **Nightly Soak**. Still **active** = Security Gate and Dependency Graph.
  - Neither active one can fire on its own: `_security.yml` (Security Gate) declares
    `workflow_call` and nothing else, so it runs only when a caller runs — and its only caller,
    `release.yml`, is disabled. Dependency Graph is GitHub-managed and cannot be disabled with
    `gh workflow disable` (seconds of runtime). **A push to HQM-dev starts no run**; confirmed
    on the 2026-07-30 push of `ea3e54f6..155f7bdc`, which created nothing.
  - **Nightly Soak was `active` until 2026-07-30** despite its header comment implying the
    cron removal had handled it. Removing a cron stops the schedule; it does not disable the
    workflow. Two independent means are now in place. Check state, do not infer it from a
    comment.
  - Crons and dispatched workflows are read from the *default* branch, so a CI-config fix only
    takes effect once it reaches main. Re-enable with
    `gh workflow enable <file> --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
  - **`gh workflow list` is not an inventory.** 21 workflow files sit on `main`; only **9**
    are registered with Actions (8 file-backed + `dynamic/dependabot/update-graph`).
    Registration is lazy, so the other 13 have no workflow id and **cannot be disabled in
    advance** — a workflow file arriving from upstream is enabled by default with nothing to
    have switched off. This is why the vanilla sync refuses on an added workflow file rather
    than relying on a pre-emptive disable.
  - Only **`dco.yml`** has an unfiltered `on: push`; it is disabled. Everything else is scoped
    to `main`, to `qa/**`, or is `workflow_call` / `workflow_dispatch` / `schedule`. That is
    the reason a push to a non-`main` branch starts nothing — verify it, do not assume it:
    `gh run list --repo HyperQuantMedia/HQM-CodeBase-Memory-fork --limit 5`.
- **Ignore the 7 "Unable to find reusable workflow" errors** VS Code shows on the same-repo
  `uses:` lines in `release.yml` and `nightly-soak.yml`. Editor false positive, evidence and the
  rejected "fix" recorded as **B8** in [`bugs.md`](bugs.md). Do not rewrite those paths.
- Release `v0.9.0-hqm-v0.1.0` exists as a **draft** with every platform asset built; publish by
  hand with
  `gh release edit v0.9.0-hqm-v0.1.0 --draft=false --repo HyperQuantMedia/HQM-CodeBase-Memory-fork`.
  HQM-Astra's `cbm.pin.json` update waits on a published release.
- Upstream patch offer (owner-gated):
  `git checkout -b feat/knowledge-overlay-ingest upstream/main && git cherry-pick c8d4d25c 28f32e70 f52a791f`
  — one help-text conflict in `cli.c` resolves to the 16-tool list. **This repo IS a true
  GitHub fork** (`fork: true`, parent `DeusData/codebase-memory-mcp`, confirmed against the API
  2026-07-31), so a direct cross-repo PR is available whenever an offer is authorised. An earlier
  version of this file claimed the opposite; it was wrong.
  The `upstream` remote's **push URL is set to `DISABLED`** so a stray `git push upstream` cannot
  reach DeusData. Fetch is unaffected. Restore it deliberately when making an offer:
  `git remote set-url --push upstream https://github.com/DeusData/codebase-memory-mcp.git`.
- Commits carry Rahul's git identity and a `Signed-off-by` trailer. **No AI co-author trailer,
  ever.**

## Board and release, outside this repo

- Publish the draft release, then update HQM-Astra's `cbm.pin.json`.
- Board writes still pending: **#69** comment, **#68** close.
