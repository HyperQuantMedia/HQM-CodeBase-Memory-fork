<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# The ingest contracts — batch indexing (A1) and cross-repo Source edges (A2)

Decided: 2026-08-01 · Ruled by: session, inside the owner's approved plan; deviations flagged ·
Status: built and suite-proven; `CROSS_SOURCE` naming awaits the owner's override or blessing

Two engine-facing contracts landed the same night as the UI arc and deserve their own record —
they outlive any UI and other tools will build against them.

## A1 — `repo_paths` batches the tool without forking it (`ccded900`)

`index_repository` accepts `repo_paths` (1–64 paths) as an alternative to `repo_path`. The
decisions that matter:

- **Expansion happens BEFORE the supervisor gate.** Each path recurses into the single-path
  handler and gets its own supervised worker — one crashing repository skips-and-continues
  instead of taking the batch down. Batching inside one worker was rejected for exactly that
  coupling.
- **Same contract per entry as a lone call**: artifact bootstrap, pipeline lock, coverage
  fields. A batch is a loop, not a new mode.
- **Refusals are explicit**: `repo_path` + `repo_paths` together; `name` with a batch (one
  override cannot cover many repositories); `cross-repo-intelligence` (that mode takes
  `target_projects`). The 64 cap errors loudly rather than truncating silently.
- **Response**: `status: success | partial | failed`, requested/succeeded/failed counts, one
  entry per path with the single-call JSON nested where it parses. `isError` only when every
  path failed — a batch with one bad path is a partial, not an error.
- Proven live the same night: one call indexed HQM-Polaris (1100 nodes) and HQM-DocuTale (578)
  in sequence; the skip-and-continue path is suite-locked
  (`tool_index_repository_batch_two_repos_and_skip_and_continue`).

## A2 — a cross-repo link means `Source:`, and it ships as `CROSS_SOURCE` (`49c4ad7`, HQM-Astra `dev`)

Landed in HQM-Astra per the plan ("this lands in HQM-Astra, not this repo"): the bridge's
`outside` bucket stopped dying as a Document property.

- **Grammar**: `readSourceRefs` joined the single-source grammar in `corpus-header.js` —
  inline-code `Source:` refs are read from the original text (readLinks strips code spans by
  construction), **the colon is required** (`[source]` slash-commands and "Source-stamped" can
  never match), path-shaped spans only. On the Astra corpus: 31 files / 47 refs — the plan's
  own number, recovered exactly.
- **Resolution**: an out-of-root target resolves to the sibling repo that owns it (walk up to
  `.git`); a relative climb is resolved against the RAW target first, because `normalizeRel`
  eats leading `..` and used to mangle climbs into phantom in-root paths — a silent-corruption
  fix that predates this feature.
- **The provider contract**: the edge joins two nodes IN the emitting project's DB; the target
  is a local stub whose `qualified_name` is the sibling's Document QN
  (`<sibling>.doc.<rel>`) — the same matching contract `pass_cross_repo.c` uses;
  `properties.target_project` names the sibling.
- **The naming deviation, flagged for the owner**: the plan says "a `SOURCE` edge", but
  `/api/layout` only surfaces edge types `LIKE 'CROSS_%'` — so it ships as **`CROSS_SOURCE`**,
  the zero-C-changes reading. Owner may override; the rename is one string on the Astra side.
- **Deliberately deferred, recorded in the commit**: reverse edges into the sibling DB
  (`pass_cross_repo` writes bidirectionally; the bridge does not yet), and non-`.md` sibling
  targets (no QN contract to resolve them against). Neither blocks the forward edge.
- **Proven** by an end-to-end fixture (two temp repos, edge asserted) because the live corpus
  currently holds zero resolvable cross-repo `.md` pointers — one dead path, one directory
  target. The mechanism is real; the corpus just has nothing for it yet.

## The topology lesson that rode along (`b95f24a4`)

The corpus claimed the missed-graph coverage backend "never reached `HQM-dev`" and rescoped
A16 on that basis. Git disproved it three ways (`merge-base --is-ancestor`, the coverage tests
present and green, the coverage table in `store.c`): **two merges had been conflated** — the
verified ten-commit slice merged directly into `HQM-dev` (`e2c2a1c0`, no daemon) versus the
quarantined full-547 take on `Merged` (`500ac1ce`). A16 has its data and is a display job.
Lesson: **when the corpus asserts branch topology, verify against git before building on it —
a correction can itself over-correct.**

## Related

[`2026-08-01-b1-rounds-and-the-v020-build-out.md`](2026-08-01-b1-rounds-and-the-v020-build-out.md)
(the same day's UI rulings) · `../plans/2026-07-31-v0.2.0-cycle.md` Phase 5 (the strikes) ·
HQM-Astra `src/tools/corpus-header.js` + `src/tools/dev/hqm-md-bridge.js` (the implementation) ·
`../bugs.md` B10 (why `Merged` is quarantined).
