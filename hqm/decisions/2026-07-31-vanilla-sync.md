<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Syncing `vanilla-upstream`: the gate is a new workflow file, not a disabled one

Decided: 2026-07-31 · Ruled by: Rahul · Status: settled

## The ruling

`vanilla-upstream` follows `upstream/main` on demand, through
[`hqm/scripts/sync-vanilla.sh`](../scripts/sync-vanilla.sh). Manual trigger, report by
default, push behind an explicit `--push`. The sync **refuses** when the incoming range
adds or renames a file under `.github/workflows/`.

## Why a refusal gate rather than a pre-emptive disable

Actions in this repo is dark by owner order, enforced workflow-by-workflow with
`gh workflow disable`. That command reaches only workflows GitHub has **registered**, and
registration is lazy. Measured 2026-07-31:

| | Count |
|---|---|
| Workflow files on `main` | 21 |
| Workflows registered with Actions | 9 (8 file-backed + `dynamic/dependabot/update-graph`) |

So **13 workflow files have no workflow id at all**. A workflow arriving from upstream is
enabled by default and has nothing that could have been disabled ahead of time. There is no
pre-emptive control to reach for — which is precisely why the sync stops and hands the
decision back rather than pretending one exists.

What makes this narrow enough to be worth automating at all: of the 21 files, **only
`dco.yml` carries an unfiltered `on: push`**, and it is disabled. Everything else is scoped
to `main`, scoped to `qa/**`, or is `workflow_call` / `workflow_dispatch` / `schedule` — and
schedules and dispatches read the *default* branch, so the contents of `vanilla-upstream`
cannot reach them. A push to that branch therefore starts nothing today. A new
push-triggered workflow is the single thing that would change that, and it is exactly what
the gate catches.

The gate is deliberately blunt — it fires on **any** added or renamed workflow file, not
only on ones that look dangerous. Deciding whether an `on:` block can fire is a reading
task, and the point of the gate is to force that reading rather than to attempt it.

## Rejected: turn Actions off repo-wide

Absolute, and it would cover the unregistered files. It also costs the ability to run
anything without flipping the switch back, and it converts a per-workflow posture that is
currently legible (`gh workflow list` tells you the state of each) into a single blunt flag.
The dark-repo order is about what *fires unbidden*, not about never running CI again.

## Rejected: a scheduled GitHub Action doing the sync

Unattended sync would have to live in a workflow, and schedules are read from the **default
branch**. That means committing it to `main` — which breaks the
`HQM-dev → Merged → main` promotion order — and installing a live, firing workflow in a
repository whose whole CI posture is that nothing fires unbidden. The convenience does not
pay for either.

## Why the branch is never checked out

The push is a refspec taken straight from the fetched upstream ref:

```
git push origin <upstream/main sha>:refs/heads/vanilla-upstream
```

No local `vanilla-upstream` exists, so there is nothing to go stale, drift, or quietly
receive a commit that would later trip the ancestry gate. The script is safe to run from any
branch with a dirty tree; it touches no working file.

The tracking config (`branch.vanilla-upstream.remote = upstream`,
`.merge = refs/heads/main`, `.pushRemote = origin`) is still set by `--setup`. It is unused
by the sync path, and correct the moment the branch *is* checked out by hand to build vanilla
for comparison: pull from upstream, push to ours.

## The `upstream` push URL is disabled

`git remote set-url --push upstream DISABLED`. Offers upstream are owner-gated **every
time**; the remote should not be one typo away from reaching DeusData. Fetch is untouched.
Reversed in one command on the day an offer is deliberately made.

## Correction to the record

`waypoint.md` stated that the fork has no GitHub fork linkage, and that a cross-repo PR
would therefore need a true fork or an issue-plus-patch offer. **That is wrong.** The GitHub
API reports `fork: true` with parent `DeusData/codebase-memory-mcp`. A direct cross-repo PR
is available whenever an offer is authorised. Corrected in `waypoint.md` on 2026-07-31.

## Consequences

- Upstream's latest release is still `v0.9.0` — the tag
  `HQM-Astra/src/tools/dev/cbm.pin.json` already pins. Syncing forces no re-pin. The script
  reports a newer upstream release when one appears, and does nothing about it: re-pinning
  is an owner decision.
- The gates were each watched refusing before the first real push — workflow-add against
  upstream `054075e2` (which added `fast-repro.yml`), divergence against `HQM-dev`. A gate
  nobody has seen refuse is not a gate.
- First real sync: `7dd8d220 → a65faeb4`, 23 commits, fast-forward. `gh run list` confirmed
  no run was created and the workflow registry still stood at 9.
