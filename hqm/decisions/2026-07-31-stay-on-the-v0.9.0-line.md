<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Stay on the v0.9.0 line: take one feature and the hardening, leave the daemon

Decided: 2026-07-31 · Ruled by: Rahul · Status: settled

## The ruling

`HQM-dev` stays based on upstream `v0.9.0` **deliberately**. From the 488 unreleased upstream
commits we take exactly two things — the **missed-graph feature** and the **security hardening** —
and leave the rest, principally the daemon.

Execution: [`../plans/2026-07-31-v0.2.0-cycle.md`](../plans/2026-07-31-v0.2.0-cycle.md).

## What the sync exposed

Syncing `vanilla-upstream` to `a65faeb4` on 2026-07-31 revealed that **`HQM-dev` had never taken
any upstream work at all**.

| | |
|---|---|
| Merge base | `b637e333`, 2026-07-08 — the `v0.9.0` release point |
| Upstream ahead | **488 commits** |
| Ours on top | 25 commits |
| Overlap | **19 files** of 93 ours / 350 theirs |
| Dry-merge of all 488 | 11 conflicts |

Upstream has **cut no release since `v0.9.0`**, so every one of those 488 commits is unreleased
work. That is the fact the whole ruling turns on: we are not behind on *releases*, we are behind on
someone's in-flight `main`.

## Why the daemon is refused, for now

Upstream grew a **mandatory per-account daemon** (`src/daemon/`, ~12k lines: `ipc.c`, `runtime.c`,
`application.c`, `host.c`, `bootstrap.c`, …). Every stateful frontend for one OS account meets at a
single endpoint; frontends become thin stdio bridges that "never construct stores or watchers".

On paper it targets our situation well — one watcher and one index job shared across concurrent
agent sessions, project mutation leases, exact-build admission, authenticated local IPC.

It is refused because of its state, not its design:

- **13 days old.** First commit 2026-07-16; 38 commits since.
- **Reverting its own designs.** `3cd1d338 fix(daemon): pool connection threads` landed
  2026-07-25 and was reverted the next day by `7808eee5 revert(daemon): drop the connection thread
  pool`.
- **`wip:` commits in mainline** — `718037f0`, `249e316e`, `3d0d0564`.
- **Windows still being stabilised**, and Windows is our platform:
  `5f2c1468 test(daemon_ipc): pin the Windows startup interleaving`,
  `636dd3f9 fix(test-infra): repair the native Windows soak transport`.
- **Upstream's own tracker agrees.** DeusData **#1351** — *Windows x64: v0.9.1-rc.1 daemon leaves
  existing cache files unreadable (empty ACL)*; **#1362** — *Daemon peak RSS scales ~linearly with
  query concurrency (29 MB idle → 3.07 GB at 20 concurrent queries)*.
- **Unreleased.** No tagged release has ever shipped it.

Cost to us if taken: `bootstrap.h` requires role classification before *any* stateful init in
`main()` — "no store, watcher, UI, diagnostics, or index supervisor may be constructed until the
process is known to be the daemon, one of its internal workers, a thin client, or an explicitly
stateless command". Our `http_server` work moves under a new lifecycle owner. The handlers survive;
the integration point is rewritten. And because the daemon is **mandatory**, there is no partial
adoption.

**Revisit when upstream tags a release containing it** — which is also when it stops being `wip`.

## Why the missed graph is taken

Upstream independently solved **indexed ≠ present** — the same question our size map hit when it
missed 98% of the repo's bytes. Their answer (#963) is a satellite cluster of files the indexer
could not fully cover, toggled from `FilterPanel`, with a `missed_graph` field on the payload.

**Ruling: both halves stand.** Ours (`source=disk|indexed` on `/api/file-sizes`) says *how much*
was missed; theirs says *which files and where*. They answer different halves and must not
contradict each other in the UI.

It ports cleanly for a specific reason: **all eight commits are dated 2026-07-08/09, and the
daemon's first commit is 2026-07-16.** The feature entirely predates the daemon. Dry merge gives
**3 conflicts, all in `graph-ui`** — nothing in `store.c`, `mcp.c`, `http_server.c` or the
pipeline, and **the size map is untouched**, so rounds 5–8 are not put at risk.

**`MissedCallout`'s DeusData deep-link is stripped.** It fetches `upstream_issues_url` from
`/api/ui-config` and links the end user to DeusData's issue tracker. Cartograph's standing rule is
that end-user surfaces never say "HQM"; routing our users into another org's tracker is the same
leak in the other direction. Keep the callout, remove the link and the config key.

## Why the hardening is reimplemented, not cherry-picked

The newest 23 upstream commits are a security wave. Eight defects were verified present **in our
tree** — by reading our source, not their commit message:

1. `vendored/nomic/code_vectors_blob.S` lacks `.note.GNU-stack`. An unannotated object makes GNU ld
   assume the worst for the whole link, so **every Linux binary we have shipped had
   `GNU_STACK RWE`**. It is the only assembly in the build, so it alone decided that property.
2. `src/mcp/mcp.c:6620` — the binary phones home to
   `api.github.com/repos/DeusData/.../releases/latest`. An outbound request in every shipped
   binary, and it points at **DeusData's** releases, which is wrong for a fork on its own merits.
3. `cbm_extract_binary_from_zip` / `gzip_decompress` in `src/cli/cli.h` — download, decompress,
   pick an executable, mark it executable. The canonical dropper composite, compiled into release
   builds.
4. SQLite built without `-DSQLITE_OMIT_LOAD_EXTENSION` despite no caller anywhere in `src/` or
   `internal/`.
5. Predictable temp paths in `mcp.c`, `artifact.c`, `diagnostics.c`.
6. `pass_envscan.c` descends symlinked directories out of the project root, and its fixed 512-byte
   path buffers truncate into pointer arithmetic.
7. mimalloc bakes `__DATE__`/`__TIME__` into every binary, so no two builds of identical source can
   ever share a hash.
8. No gate proving any of the above stays fixed.

**They cannot be cherry-picked.** Upstream's fixes edit `src/daemon/application.c`, which does not
exist on our base — our version check lives in `mcp.c`. On our base these are reimplementations.

`scripts/ci/check-binary-composition.sh` (404 lines, new file, no conflict) is adopted
near-verbatim, because it is the piece that makes the rest **verifiable rather than asserted**: it
checks the built binary, not the source, and asserts a canary so a compressed or empty file fails
instead of passing.

## Consequences

**The existing draft is superseded and deleted.** `v0.9.0-hqm-v0.1.0`, 35 assets, produced by a
`release.yml` run that **failed after 2h16m** (`30495762643`) — the verify stage never passed. It
carries every defect above. A live tag is one accidental `--draft=false` from shipping a binary
with an executable stack.

**Astra currently installs vanilla, not Cartograph.** `HQM-Astra/src/tools/dev/cbm.pin.json` pins
upstream `v0.9.0`, published 2026-07-08 — before every one of those fixes. Owner's call:
**leave the pin** for now. Re-pinning is the only thing that switches Astra onto our viewer.

**Version rule.** The convention at `.github/workflows/release.yml:8` is
`<upstream-version>-hqm-v<hqm-semver>`. Upstream is frozen at `v0.9.0`, so **our axis moves**:
this cycle is **`v0.9.0-hqm-v0.2.0`**. Security-only is a patch; features and ported work are a
minor; **when upstream cuts a release, rebase the left axis and reset ours to `hqm-v0.1.0`** — the
hqm number describes our delta on *that* base.

Accepted quirk: semver parses `0.9.0-hqm-v0.1.0` as `0.9.0` with prerelease `hqm-v0.1.0`, and
prereleases sort **below** the plain release, so strict tooling reads our build as older than
upstream `v0.9.0`. Ordering among our own releases is correct, and nothing in our path compares
across the two. Recorded so it is not rediscovered as a bug.

## Correction to the record

An earlier `waypoint.md` stated that this repo has no GitHub fork linkage and that a cross-repo PR
would need a true fork or an issue-plus-patch offer. **That was wrong** — the API reports
`fork: true`, parent `DeusData/codebase-memory-mcp`. A direct cross-repo PR is available whenever
an offer is authorised. Corrected 2026-07-31.

## Also settled in this session

- **Target scope is any path, up to a whole hard drive** — not a repo-only tool. Four engine
  assumptions break at that scale; see the plan's Scope note. Upstream has an open crash here
  (**#1241**, OOM on root paths).
- **Agent-tag syntax: dropped.** A proposal for novel bracket delimiters marking LLM-facing tags in
  markdown was weighed and rejected — novel delimiters cost tokens, sit out of the model's
  structural distribution, and render as visible junk. **Raw HTML tagging stays**; `<astra-…>`
  HTML5 custom elements remain available if a namespace is ever needed, since a hyphen is legal in
  a CommonMark tag name and a colon is not.
- **B2** — widen `Breadcrumb.onSelect` to pass the whole `Crumb`. Identity, not a display string.
- **B3** — `KIND_COLORS` joins the override store, so the Colours tab works in both views.
- **B4/B5** — fix the git noise **locally**: `.git/info/exclude` for the untracked
  `embedded_assets.c`, `git update-index --skip-worktree` for the tracked `tsbuildinfo`. Neither
  touches a committed file, so the tidiness-versus-clean-diff trade-off was false.
- **B6** — the four unsigned commits are **inert**. All are UI/size-map work and **none** are in the
  upstream-offer set (`c8d4d25c`, `28f32e70`, `f52a791f`). DCO only matters for commits offered to
  DeusData.
- **The ADR panel is hidden.** `manage_adr` is cross-session agent memory wearing the name ADR;
  `waypoint.md` and `decisions/` already do it with discipline. Upstream knows — DeusData **#507**
  asks for real markdown ADRs.

## Markdown conformance — recorded, unactioned

Measured over `HQM-Astra/astra`, 104 files, during the same session.

**Clean:** no YAML front matter (the HTML-comment scheme sidesteps the thematic-break collision), no
trailing-double-space hard breaks, no bare autolinks, no task lists, nested list indent at the
CommonMark-correct 2 spaces.

**Undeclared GFM dependency:** tables in **22 of 104** files — tables are **not in CommonMark at
all** — plus `~~strikethrough~~` (3) and `[^footnotes]` (1).

**Real defect:** 10 bare angle-bracket placeholders across 4 files (`<pass>`, `<role>`, `<author>`,
`<phase>`, `<date>`) parse as raw HTML inline and **render as nothing**. Worst is
`decisions/2026-07-19-agent-naming-convention.md:2`, whose H1 renders as
"Agent naming convention: cairn--".

**Gap:** `claude/standards/markdown.md` is a thorough house *style* but never declares which
dialect it extends, and has no angle-bracket escaping rule — which is why those 10 exist.

**Parser check — no active mismatch.** `astra-index.js` / `corpus-header.js` parse with
line-oriented regex and no markdown parser. Five divergences from CommonMark (links inside fenced
code blocks, reference-style links, `)` in URLs, `]` in link text, wrapped `Scope:` lines) — **all
zero hits** in the corpus. It holds by discipline, not by contract; the cheap durable fix is to name
those constructs as prohibited in the standard.

*(Astra's corpus and Astra's standard — the fix belongs in `HQM-Astra`, not here. Recorded here
because this session measured it.)*
