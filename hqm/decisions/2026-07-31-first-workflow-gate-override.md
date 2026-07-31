<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Overriding the workflow gate: `pr-acknowledgement.yml` crossed into `vanilla-upstream`

Decided: 2026-07-31 · Ruled by: Rahul · Status: settled · The gate's **first** override

## The ruling

`vanilla-upstream` is fast-forwarded to upstream `d698db8e` (69 commits) **despite**
`hqm/scripts/sync-vanilla.sh` refusing the range, because the range adds
`.github/workflows/pr-acknowledgement.yml`.

The gate was not weakened to do it. It has no `--force`, by design — it refuses and hands the
decision back, and this is that decision being made by hand.

## Why the refusal was still correct

The gate does not claim an added workflow is dangerous. It claims **no pre-emptive control exists**
for one: registration with Actions is lazy, so a file that has never been registered has no
workflow id, and `gh workflow disable` cannot reach it in advance. 21 workflow files sit in this
repo and **9** are registered. That asymmetry is the whole reason the gate exists, and it is
unchanged by this override.

Confirmed again after the push, which is the useful part: the file is now on `vanilla-upstream` and
Actions **still has not registered it** — the registry is 9 before and 9 after.

## Why this particular file is inert here

```yaml
on:
  pull_request_target:
    types: [opened]
```

- **No push trigger at all** — grep for `push:` in it returns 0. A push to `vanilla-upstream`
  cannot start it.
- `pull_request_target` resolves its workflow from the **PR's base branch**. `vanilla-upstream` is
  never a base for a pull request, and `main` does not carry the file.

So on this branch it is a file on disk and nothing else. It becomes live only if it reaches `main`
— which now matters more than it did this morning, because **`main` is where all CI/CD version cuts
run** and is the only branch Actions reads workflows, crons and dispatches from.

## What to weigh when it does approach `main`

Not "is it inert" — it will not be. `pull_request_target` runs against the **base** repo with a
token that can write, which is precisely why upstream chose it: a `pull_request` trigger gives fork
PRs a read-only token, so commenting on outside contributions would fail.

Upstream's file is careful about the known hazard — it never checks out, builds or executes PR
code, `actions/checkout` resolves to the base commit, and the PR number reaches the shell through
the environment rather than by inline expansion. **That is their discipline holding, not ours**, and
a later upstream edit to that file would arrive through the same door. Two questions to answer then:
does this fork want to auto-comment on PRs at all, and if not, is it deleted on our line or disabled
after it registers?

## Verification performed

Order matters here — a check run only after the fact cannot distinguish "nothing fired" from
"something fired and finished".

| | Before | After |
|---|---|---|
| `origin/vanilla-upstream` | `a65faeb4`, 69 behind upstream | `d698db8e`, **0 behind** |
| Divergence (ahead of upstream) | 0 | 0 |
| Runs in the repo | newest 2026-07-30 (DCO) | **unchanged — none created** |
| Registered workflows | 9 | **9** |
| `pr-acknowledgement.yml` registered | n/a | **no** |

Pushed as a refspec straight from the fetched upstream ref — no checkout, no local branch, no
`--force`, so git itself would have refused anything but a fast-forward.

## What this does *not* change

- **The gap to our own line stands, and is now 547 commits.** Syncing the mirror takes nothing into
  `Merged`, `HQM-dev` or `main`. It moves a read-only pointer so that ranges can be diffed and
  chosen; the daemon deferral and the stay-on-the-v0.9.0-line ruling are untouched.
  See [`2026-07-31-stay-on-the-v0.9.0-line.md`](2026-07-31-stay-on-the-v0.9.0-line.md).

  **The number moved *because* of the sync, and that is worth understanding rather than
  memorising.** It was 478 before this push and 547 after — 478 + the 69 commits taken in. Nothing
  we hold changed; the gap is measured against the mirror, so advancing the mirror widens it. A
  stale "478" therefore reads as progress where none happened, which is exactly the mistake made in
  the first draft of this file and in `waypoint.md`: a pre-sync number reused in a post-sync
  sentence, minutes apart, both true when written. Re-measure after every sync —
  `git rev-list --count HQM-dev..origin/vanilla-upstream`.
- **The dark-repo posture stands.** Nothing was enabled, nothing fired.
- **The gate stays as it is.** It refused, correctly, and cost one read of one `on:` block. Adding
  an override flag would trade that for a flag someone passes without reading — and the reason the
  gate exists is that the pre-emptive control is the thing that does not exist.

## Correction to the record, found while checking

[`2026-07-31-stay-on-the-v0.9.0-line.md`](2026-07-31-stay-on-the-v0.9.0-line.md) says upstream has
"cut no release since `v0.9.0`". A tag **`v0.9.1-rc.1`** does exist — `560ad40d`, 2026-07-29, in the
mirror, not in `HQM-dev`. It is a release *candidate*, so the version-axis rule ("when upstream cuts
a release, rebase the left axis and reset ours to `hqm-v0.1.0`") is **not** triggered; but the
accurate phrasing is "no non-prerelease tag", and the daemon deferral now has a tag number attached
to its evidence — `v0.9.1-rc.1` is the build DeusData **#1351** reports as leaving Windows cache
files unreadable.

The un-synced range also touched `src/daemon/ipc.c`, i.e. the subsystem we are deliberately not
adopting. Nothing in the sync brings it to us.
