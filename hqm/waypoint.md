<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Waypoint — HQM work in this fork

Updated: 2026-07-31 · Focus set by: Rahul

---

## ⛳ SESSION HANDOFF — 2026-07-31 evening, read this before anything else

**Branch state (nothing of ours is on `origin`; only the mirror was pushed today):**

| Branch | Local | On origin | State |
|---|---|---|---|
| `vanilla-upstream` | — | **`d698db8e`** | pushed; level with DeusData, 0 behind |
| `Merged` | **`500ac1ce`** | `56c2feb9` | full 547-commit take, **QUARANTINED — do not greenlight** |
| `HQM-dev` | `71a67050` — hardening wave committed | `2be1a469` | green, no daemon |
| `main` | `94498621` | `56c2feb9` | cut from HQM-dev |

**Why `Merged` is quarantined:** the merged binary does not run. `list_projects`,
`daemon start` and `--ui=true` all fail with *"CBM daemon could not start within 30000 ms"*.
Proven inherited, not caused by us: a built worktree at `origin/vanilla-upstream` with **zero
HQM code** fails identically. 98 C-test failures, all daemon/lock family, reproduce there
suite-for-suite. Everything of ours is green (265 UI, httpd 60/60, ui 18/18, watcher 70/70).

### Work in progress: the eight hardening items, hand-applied to `HQM-dev`

This is option 1 of four the owner chose: `Merged` keeps the daemon quarantined; the security
wave comes to our line by hand, because `HQM-dev` was the *less safe* branch (it still phoned
home to DeusData, shipped the dropper composite, and had `GNU_STACK RWE` on every Linux build).

| | Item | State |
|---|---|---|
| 1 | `.note.GNU-stack` + `-Wl,-z,noexecstack` (with new `IS_LINUX` probe) | done |
| 2 | Phone-home removed — thread, notice injection, 4 struct fields, 3 call sites | done, **gate-verified** |
| 3 | Self-update behind `CBM_ENABLE_SELF_UPDATE` (default 0) **and** repointed at HQM releases | done, **gate-verified** |
| 4 | `-DSQLITE_OMIT_LOAD_EXTENSION` | done, **gate-verified** |
| 5 | Private/exclusive temp paths | **done** — `diagnostics.c` via `diag_open_private()`; `mcp.c` search scratch now a `cbm_mkdtemp` private dir with `cbm_mkstemp` files written through their descriptors (`write_scoped_filelist` takes the open stream; three cleanup sites collapse into `search_scratch_close`) |
| 6 | `pass_envscan.c` symlink + buffer truncation | done (needed 3 foundation files, see below) |
| 7 | mimalloc timestamps + `-Wdate-time` + `--no-insert-timestamp` | done |
| 8 | `scripts/ci/check-binary-composition.sh` | **done** — adopted and wired into `scripts/build.sh` (there is no `package-release.sh` on this branch; it arrived with the 547). Runs on every local build, `CBM_SKIP_COMPOSITION_GATE=1` opts out. Move it to packaging, after strip, if packaging is ever adopted |

**Committed on `HQM-dev` as work-in-progress** once the gate went green, so a session switch
loses nothing. It is *not* a finished cycle: items 5 and 8 are incomplete, so do not cut a
release from this state.

### Owner's B1 visual pass — next session, and it still gates Phase 3

The owner runs the visual verification himself in the next session. Serve the current build
first (`scratchpad/c-suite/build-with-ui.sh <version>`, then start the binary with
`--ui=true --port=9749`) and **confirm the served bundle hash changed** before believing
anything shipped:

```
curl -s http://127.0.0.1:9749/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
```

Surfaces are listed in [`bugs.md`](bugs.md) B1. **Two things are newer than that list** and have
never been seen on screen: the size view's footer `spacing 0.70` readout, and the `measure`
link that runs the delegated probe (with its "still measuring" notice past 2 s).

Phase 3 is the parity sweep and touches those same surfaces, so starting it before the pass
moves the target — the exact pattern that cost four rounds in the usability arc.

### One plan dependency did NOT change — Phase 5's A16 (correcting this section's earlier claim)

An earlier version of this section said the missed-graph coverage backend "never reached
`HQM-dev`" — **that was wrong**, verified against git 2026-07-31 late. Two merges were being
conflated: the ten-commit *slice* (`3eb294fa`) was merged directly into `HQM-dev` as
`e2c2a1c0`, is an ancestor of today's tree, brought `test_parse_coverage.c` +
`test_index_resilience.c` (both in tonight's green run) and the coverage table in `store.c` —
and carried **no daemon** (`src/daemon/` does not exist on `HQM-dev`). The quarantine applies
only to the separate full-547 take on `Merged` (`500ac1ce`). So **A16 has its data source and
is a pure display job**, B1-gated like all `graph-ui` work. Phases 3 and 4 unaffected either way.

### Next actions, in order

1. ~~Build + gate.~~ **DONE**: `hard4` built `EXIT=0` / 0 errors, and the gate returned
   **`BINARY COMPOSITION OK: 12 assertions passed`** — A3 now fully absent (`releases/latest`,
   `releases/latest/download`, `api.github.com/repos`, the GitHub `Accept` header), A4 absent +
   `OMIT_LOAD_EXTENSION` present, A2 clean, A0-canary present so the absences mean something.
   **A1 is ELF-only and reported `n/a` on this PE build — item 1 still needs a Linux build to
   prove.** Rerun the gate with:
   `bash scripts/ci/check-binary-composition.sh --variant=ui build/c/codebase-memory-mcp.exe`
2. ~~Build once with `-DCBM_ENABLE_SELF_UPDATE=1`.~~ **DONE** — `build-selfupdate-on.sh`
   compiled and linked clean (`Built with UI`), and the gate failed on exactly the two
   A3 URL assertions (`releases/latest`, `releases/latest/download`) and nothing else —
   which is the flag working in both positions AND the gate proving it can detect the
   updater when present. Log: `scratchpad/c-suite/build-selfupdate-on.log` (`EXIT=2`,
   expected). The ON artifact was then replaced: the default (OFF) `--with-ui` build was
   rerun 2026-07-31 late — **`EXIT=0`, gate `BINARY COMPOSITION OK: 12 assertions passed`**
   (`build-v0.9.0-hqm-v0.2.0-rc.log`), so `build/c/` holds a clean, gate-verified artifact
   ready for the owner's B1 serve.
3. ~~Item 5's `mcp.c` half.~~ **DONE** in `dbd7add7` — `search_scratch_open`/`search_scratch_close`
   over a `cbm_mkdtemp` private dir, files via `cbm_mkstemp`, written through the descriptor
   (see the item-5 row in the table above).
4. ~~Wire item 8.~~ **DONE** in `dbd7add7` — wired into `scripts/build.sh` (no
   `package-release.sh` on this branch); runs on every local build,
   `CBM_SKIP_COMPOSITION_GATE=1` opts out.
5. ~~Both suites.~~ **DONE 2026-07-31 late, both green on the post-hardening tree at
   `71a67050`:** UI `npm ci` + build + vitest — **260/260, 28 files**; C suite —
   **`EXIT=0`, 5767 passed / 0 failed / 18 skipped, "All tests passed"**, log
   `scratchpad/c-suite/run.log`. (Wrapper trap discovered: invoking the script as
   `bash -lc <path> <log-name>` puts the log-name in `$0`, not `$1` — the log falls
   back to `run.log`. Pass the name inside the `-lc` string if it matters.)
6. **A Linux build**, the only way to prove item 1 (A1 is ELF-only).

### Traps that cost real time today — do not rediscover

- **Gating a capability strands its private helpers**, and `-Werror` reveals them one build at
  a time. Four rounds on item 3: `cbm_download_to_file{,_quiet}`, the tar/zip helpers,
  `prefix_icase`, then `detect_os`/`detect_arch`. **Check what a gated span CALLS, not only what
  calls it.**
- **Do not read a build log mid-link.** `grep -c error:` returned 0 on a log that later failed
  with 2. Wait for `EXIT=`.
- **Heredocs mangle `\n`** in generated C. The `cbm_cmd_update` stub shipped literal newlines
  inside string literals — 20 errors. Write generated C with a file, or verify the escapes.
- **A wrong diagnosis stated confidently is worse than none.** TEMP/`cbm_tmpdir` was asserted as
  the root cause of the 98 daemon failures; three-way testing disproved it. The comment in
  `run-tests.sh` now records the disproof.
- **Never edit a shell script that is currently executing.** Bash reads a script
  incrementally, so inserting lines shifts byte offsets under the running interpreter and it
  can execute garbage from the new text. `scripts/build.sh` was edited mid-build on
  2026-07-31; if a build ends inexplicably right after a script edit, rerun it clean before
  believing the result.
- **Never run two builds at once in this tree.** They share `build/c` and collide with
  `unable to rename temporary '…prod_lsp_all-….o.tmp' to output file` — which reads like a
  toolchain fault and is just two makes in one directory. Same rule as the two test suites,
  which share a HOME-based cache. One build at a time, or use a separate worktree.
- Environment: use the wrapper scripts in `scratchpad/c-suite/`. Four separate MSYS gaps
  (`nodejs`, `git`, a real `python3.exe`, `C:/Python314` for its DLL) each fail in a way that
  does not name its cause.

---

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
- **Three toolchain dependencies must be put back on PATH, and each fails differently.** An MSYS
  `CLANG64` login shell drops the Windows PATH, so `nodejs`, `git` **and** `python3` all have to be
  re-exported. `nodejs` fails loudly. The other two do not:
  - `git` → **23 test failures**, cause stated once far up the log.
  - `python3` → **`EXIT=127` at "Step 0e: Windows launcher bundle contract"**, a test that arrived
    with the 2026-07-31 upstream merge. On this machine `python3` resolves to the WindowsApps App
    Execution Alias rather than the real interpreter at `C:/Python314`, so a repo-local shim exists
    at `scratchpad/c-suite/bin/python3` — deliberately not installed into MSYS `/usr/local/bin`,
    which is outside this repo.

  **Use the wrappers rather than reassembling the one-liner**: `scratchpad/c-suite/run-tests.sh
  <log-name>` and `scratchpad/c-suite/build-with-ui.sh <version>`, both invoked as
  `MSYSTEM=CLANG64 /c/msys64/usr/bin/bash -lc <abs-path-to-script>`. They exist because the
  one-liner form also needs an absolute `cd` (a login shell starts in `$HOME`, so the script path
  *and* the log redirect resolve against the wrong directory) — three separate ways to fail before
  a single test runs.
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
  | `Merged` | **integration, long-lived.** Where conflicts between vanilla and `HQM-dev` are resolved. Upstream lands here first; its fallout is fixed here |
  | `HQM-dev` | our development work, protected from raw upstream churn |
  | `main` | our own independent version, cut from `HQM-dev`. Repo default, and **where all CI/CD version cuts run** |

  **Flow: `vanilla-upstream` → `Merged` (merge, fix, verify) → `HQM-dev` (after greenlight and
  stability feedback) → `main` (version cut).** Never a direct commit on `main`.

  An earlier version of this file said "promotion is HQM-dev → Merged → main", which had it
  backwards and made `Merged` look like a staging area for our work instead of the place foreign
  code is absorbed.

  **`Merged` is long-lived and never rewritten.** Not a scratch branch, not recreated per cycle:
  **its history *is* the record of how every vanilla↔HQM-dev conflict was resolved**, and that
  ancestry is what stops the next pull re-conflicting the same hunks. So:

  - **Never `git branch -f`, `git reset --hard`, or delete-and-recreate `Merged`.** That throws
    away resolutions and puts git back to blind. (The 2026-07-31 fast-forward was safe *only*
    because `Merged` was already an ancestor of `HQM-dev` — nothing existed to lose. Check that
    before ever moving it that way again; if `git rev-list --count HQM-dev..Merged` is non-zero,
    a force-move destroys work.)
  - **Bring our work in by merging `HQM-dev` into `Merged`, before taking a vanilla range.**
    Conflicts must be resolved against *current* work. On 2026-07-31 `Merged` sat 20 commits
    behind, so a merge into it as-found would have integrated the missed graph against a tree with
    no spacing probe, no light-stage render model and no size-map parity — and the four
    light-theme defects the port carried would have been invisible until the `Merged → HQM-dev`
    step, where attribution is far harder.

  **Containment is a cycle, not a constant.** Between a take and its greenlight, `Merged` is
  *ahead* of `HQM-dev` — it holds resolutions our line has not accepted yet, which is the whole
  point of the quarantine. After greenlight, `HQM-dev` contains `Merged`, and `main` contains
  whatever was cut. What must hold at all times is only this: **nothing reaches `main` except a
  cut from `HQM-dev`**, and nothing is committed directly on `main`. Check the live state rather
  than assuming a fixed ordering:

  ```
  git rev-list --count HQM-dev..Merged     # >0 = a take is in flight, not yet greenlit
  git rev-list --count HQM-dev..main       # must be 0
  git merge-base --is-ancestor main HQM-dev
  ```

  **All CI/CD version cuts run from `main`** (owner, 2026-07-31). A release is a cut from
  `HQM-dev` to `main`, then the release workflow dispatched **on `main`** — which is also the only
  branch Actions reads workflows, crons and dispatch definitions from, so the two facts are the
  same fact. Consequences worth holding on to:

  - **A release dispatched from any other branch is the wrong branch by definition.** The existing
    `v0.9.0-hqm-v0.1.0` draft was dispatched from `HQM-dev` on 2026-07-29 and failed after 2h16m
    (run `30495762643`); under this rule it was mis-aimed as well as unverified. The plan deletes it.
  - **`main` must be pushed before a cut can run**, and Release is currently `disabled_manually`
    along with most of the rest — so a version cut needs `gh workflow enable release.yml` as a
    deliberate act, not a surprise.
  - Local `--with-ui` builds stay the verification step regardless. CI cuts the version; it is not
    what tells us the tree is good.
- **Syncing `vanilla-upstream`:** `hqm/scripts/sync-vanilla.sh` (report only) then
  `--push`. Never checked out — the push is a refspec from the fetched upstream ref, so no
  local branch exists to drift. It **refuses** when the incoming range adds or renames a file
  under `.github/workflows/`, and refuses when the branch is not an ancestor of
  `upstream/main`. `--setup` is the one-time local config. Ruling and the rejected
  alternatives: [`decisions/2026-07-31-vanilla-sync.md`](decisions/2026-07-31-vanilla-sync.md).
  - Synced 2026-07-31: `7dd8d220 → a65faeb4`, 23 commits, no run created.
  - Synced again 2026-07-31: `a65faeb4 → d698db8e`, **69 commits, and the gate refused** — the range
    adds `pr-acknowledgement.yml`. Owner overrode it; the push was done by hand, because the script
    has no `--force` on purpose. `on: pull_request_target: [opened]`, zero push triggers, and
    `pull_request_target` reads its workflow from a PR's *base* branch — so it is inert on a branch
    that is never a base. Verified after: **no run created, registry still 9, the new file still
    unregistered.** It goes live only if it reaches `main`, which is now the CI/CD branch, so that
    is when to decide whether this fork wants PR auto-comments at all. Full record:
    [`decisions/2026-07-31-first-workflow-gate-override.md`](decisions/2026-07-31-first-workflow-gate-override.md).
  - **`vanilla-upstream` is level with DeusData as of 2026-07-31** — `d698db8e`, 0 behind, 0 ahead.
    Our own line sits **547 commits behind the mirror**, and that is the ruling, not neglect.
  - **Re-measure that number after every sync; never carry it over.** It is measured *against the
    mirror*, so syncing the mirror widens it without changing a thing we hold: 478 before this
    sync, 547 after (478 + the 69 taken in). Both numbers were true, four minutes apart. The
    command is `git rev-list --count HQM-dev..origin/vanilla-upstream`.
- **CI/CD IS OFF AT THE REPOSITORY LEVEL** as of 2026-07-31 — `actions/permissions` is
  `{"enabled": false}`, so nothing registers and nothing fires whatever the workflow files say.
  This replaced per-workflow whack-a-mole: `gh workflow disable` needs an id, ids only exist
  after lazy registration, and a newly registered workflow **defaults to enabled** — pushing
  `HQM-dev` registered `soak.yml` as `active` with no warning. **A release cut therefore needs
  two deliberate acts**, and re-enabling the repo does NOT re-enable individual workflows:
  ```bash
  echo '{"enabled":true}' | gh api -X PUT     repos/HyperQuantMedia/HQM-CodeBase-Memory-fork/actions/permissions --input -
  gh workflow enable release.yml --repo HyperQuantMedia/HQM-CodeBase-Memory-fork
  # ...cut the release, then turn the repository setting back off
  ```
  The API reads stale — a successful `PUT` returns 204 and the next GETs may still say `true`.
  Full record: [`decisions/2026-07-31-actions-off-at-the-repo-level.md`](decisions/2026-07-31-actions-off-at-the-repo-level.md).
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
