<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Upstream issue overlap, and what is worth offering back

Captured: 2026-07-31 · Confidence: high where an issue number is cited; the offer list is a
judgment, not a ruling

DeusData has **373 open issues**. Several land directly on this cycle's findings — which validates
the analysis rather than undermining it. Checked while planning
[`../plans/2026-07-31-v0.2.0-cycle.md`](../plans/2026-07-31-v0.2.0-cycle.md).

## Their open issues that touch our work

| Issue | Title (abbreviated) | Why it matters here |
|---|---|---|
| **#1377** | possibility to bypass specific file, filter based on file extension | **This is our A3b**, filed by someone else. The need is not idiosyncratic |
| **#1241** | memory runaway (12.8 GB+ RSS) during `index_repository` on **root paths** triggers OOM crash | **This is the whole-hard-drive scenario, and it is an open crash.** Our folder-pruning control mitigates; the underlying crash is theirs |
| **#498** | 3D graph visualization freezes browser/system on repos with >10K nodes | Adjacent to the node-budget parity work (C10) |
| **#507** | Support Markdown Architectural Decision Records | They know the ADR field is weak — someone has asked for real ones. Validates hiding it |
| **#518** | Section nodes don't index body text — BM25 can't search markdown content | A markdown indexing gap that bites the Astra corpora directly |
| **#1287** | `index_repository` reports `parse_partial_count: 0` after incremental/artifact reload despite persisted coverage gaps | **A known bug inside the missed-graph coverage feature we are about to port.** Expect it; do not spend the Phase 1 merge debugging it |
| **#1356** | `index_status` returns ~26k tokens on an 11.8k-file repo — payload dominated by deliberately-ignored files, no way to trim | Coverage-adjacent; relevant to A16's display work |
| **#1351** | Windows x64: v0.9.1-rc.1 daemon leaves existing cache files unreadable (empty ACL) | **Validates the daemon deferral**, and it is Windows-specific — our platform |
| **#1362** | Daemon peak RSS scales ~linearly with query concurrency (29 MB idle → 3.07 GB at 20 concurrent) | Same |
| **#1330** | Committed local soak/memlab run outputs on main: 86 files, 1.3 MiB | Already fixed inside our synced range (`66326c2c`) |
| **#573** | Feature request: worktree overlay indexing for branch-aware agent workflows | Same space as our `ingest_overlay` |
| **#398** | task: Architecture — workspaces, cross-repo, worktrees, benchmarks | Their cross-repo tracking issue |
| **#1297** | README: `semantic_query` is not a tool, the tool count is **14** not 15 | **Contradicts our count.** We measured 15 upstream + `ingest_overlay` = 16. Unresolved — check before claiming 16 anywhere public |

## Worth offering back

Ordered by confidence. **No PR is raised on DeusData without Rahul's explicit instruction, every
time.**

### 1. `ingest_overlay` — the prepared offer

`c8d4d25c`, `28f32e70`, `f52a791f`. After 488 upstream commits there is still **no equivalent** —
their tool list is unchanged and carries no overlay ingest. Sits in the same space as their **#573**.

```bash
git checkout -b feat/knowledge-overlay-ingest upstream/main
git cherry-pick c8d4d25c 28f32e70 f52a791f
```

One help-text conflict in `cli.c` resolves to the tool list. Note the count dispute in **#1297**
before writing any number into the help text.

### 2. Windows Diagnostics via Toolhelp32 — verified gap

At their `v0.9.0` base, `src/ui/http_server.c`'s `/api/processes` handler returns a hard-coded
`"processes":[]` under `#ifdef _WIN32`. **Diagnostics is genuinely empty on Windows upstream.** Our
Toolhelp32 implementation fills a real gap, is platform-isolated, and is the cleanest thing we have
to offer. Verified by reading `git show b637e333:src/ui/http_server.c`, not inferred.

### 3. The `/api/process-kill` guard — as a question, not a claim

Upstream ships the endpoint (`http_server.c:573` at base) and its PID-validation forward
declarations sit inside `#ifndef _WIN32` (`:142`). Whether that is reachable on their Windows build
depends on what their kill path actually does there. **Worth asking them; not worth asserting as a
vulnerability.** The hazard became concrete for us only once we made the Windows path real.

### 4. Verify before offering — the two CI fixes

`7825f288` (non-callable `soak.yml` reference) and `dce7050c` (`type: number` illegal under
`workflow_dispatch`). The explanatory comments read during planning were in **our** tree, so it is
unknown whether upstream still carries these. Check `upstream/main` before offering.

## Not worth offering

- **The light theme.** Verified: `graph-ui/src/lib/theme.ts` **does not exist** at `b637e333`. The
  light theme is entirely ours — a feature, not a bug fix.
- **The size map.** Large, fork-shaped, and entangled with Cartograph's identity.
- **Cartograph naming**, the `hqm/` directory, and anything under it — excluded from patch offers
  by construction, since offers are assembled by cherry-picking onto a branch off `upstream/main`.

## Standing rule

`hqm/` is excluded by construction. **No PR is raised on the DeusData upstream without Rahul's
explicit instruction.** Preparing branches and patches locally is fine; the outward offer is
owner-gated, every time. The `upstream` remote's push URL is set to `DISABLED` so a stray
`git push upstream` cannot reach them — restore it deliberately when making an offer.
