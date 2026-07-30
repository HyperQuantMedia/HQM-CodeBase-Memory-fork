<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. Excluded from
     any patch offered upstream — see "Upstream posture" below. -->

# `hqm/` — HyperQuant Media's own record for this fork

Design records for the HQM-owned work in this repository: the **Cartograph** viewer
(`graph-ui/`), the knowledge-overlay ingest, and the HTTP surfaces added for them.

## Why this directory exists

The rule it satisfies (HQM-Astra, `astra/internal/core/workspace-boundaries.md`):

> Every artifact lands in the repo whose work produced it — decision records, drafts,
> intake docs, changelogs, all of it. The active Astra repo holds at most a distilled
> map-node + `Source:` link to sibling material; never the sibling's doc itself.

These rulings were first written into HQM-Astra's corpus because that is where the
session was rooted, which is precisely the failure that rule names. They live here now.
A session opened in this repo alone should be able to reach competent continuation from
`waypoint.md` without a second checkout.

## Layout

| Path | Holds |
|---|---|
| [`waypoint.md`](waypoint.md) | the resume baton: current edge, load-bearing judgment, what to open, where the work is tracked |
| [`bugs.md`](bugs.md) | open defects — severity, status, repro; what is `awaiting(Rahul)` |
| [`backlog.md`](backlog.md) | proposed work, blocked work, open questions — everything that is *not* a defect |
| [`decisions/`](decisions/) | one settled ruling per file, dated; the *why*, the options weighed, the consequences |
| [`notes/`](notes/) | session captures — the full spine behind a decision, with confidence labels |
| [`scripts/`](scripts/) | HQM-owned tooling that operates on this fork; excluded from upstream offers like the rest of `hqm/` |

`bugs.md` and `backlog.md` are the two working surfaces; `decisions/` is what has stopped
moving. A thing that is in neither register and has no decision record is **not tracked** —
do not reconstruct it from the git log.

Plain markdown in this repo's own conventions. No Astra tooling is installed here (no
linter, no id minting, no index); the corpus machinery is HQM-Astra's and dragging it in
for a handful of documents would couple this fork's tree to it for no gain.

## Upstream posture

This is a fork of an MIT-licensed upstream (`DeusData/codebase-memory-mcp`, © 2025). This
directory is **HQM-authored and HQM-owned** — it documents our additions, not theirs, and
it does not ride along on anything offered upstream. Patch offers are assembled by
cherry-picking named commits onto a branch off `upstream/main`, so `hqm/` is excluded by
construction rather than by a rule someone has to remember.

Code-level rationale stays **in the code**, in comments beside what it explains — that is
what travels if a change is ever offered upstream. This directory carries what a comment
cannot: the options rejected, the measurements, and the attempts that failed first.

## Where the rest of the picture lives

- **HQM-Astra** (`astra/decisions/2026-07-30-cartograph-adopt-viewer.md`) — the ruling that
  adopted this provider's database and viewer wholesale, and the routing contract that
  sends HQM's map view here. That decision governs HQM-Astra's behaviour, so it stays there.
- **HQM-Astra** (`src/tools/dev/hqm-md-bridge.js`) — the bridge that feeds HQM markdown
  corpora into this server's SQLite through `ingest_overlay`. Its code lives there.
