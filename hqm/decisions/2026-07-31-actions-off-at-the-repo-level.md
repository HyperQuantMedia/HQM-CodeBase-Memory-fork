<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# GitHub Actions is disabled at the repository level, not per workflow

Decided: 2026-07-31 · Ruled by: Rahul ("fix this hazard of the CI/CD issues right away") · Status: settled

## The ruling

`repos/HyperQuantMedia/HQM-CodeBase-Memory-fork/actions/permissions` is set to
**`{"enabled": false}`**. The dark-CI posture is now a property of the repository rather than a
per-workflow flag that has to be maintained.

## Why per-workflow disabling could not hold the line

`gh workflow disable` needs a workflow **id**, and an id only exists once GitHub has registered
the file. Registration is **lazy**. So:

- **A file that has never registered cannot be disabled in advance**, and
- **it defaults to ENABLED the moment it registers.**

That is not a hypothesis. Pushing `HQM-dev` on 2026-07-31 registered `soak.yml` as
**`Soak (multi-hour` — `active`**, taking the registry from 9 to 10. Its `push` filter is
`qa/soak-**`, which this fork never creates, so nothing fired — but it arrived enabled, from an
ordinary push of our own branch, with no warning.

The wider exposure at that moment:

| | |
|---|---|
| Workflow files in the repo | **21** |
| Registered (i.e. disable-able) | **10** |
| Files carrying a `push` trigger | **8** |
| Unfiltered `on: push` (every branch) | **`dco.yml`** — its disabled flag was the only thing stopping a run on every push |
| Repo-level Actions | **`enabled: true`** — per-workflow flags were the only control |

Eleven files could still register on any future push, each defaulting to enabled. Chasing them
one at a time is whack-a-mole against a mechanism that always moves first.

## What this replaces

Nothing is un-disabled: the ten registered workflows keep their `disabled_manually` state, and
`Security Gate` (`workflow_call` only, so it cannot self-fire) and `Dependency Graph`
(GitHub-managed, not disable-able) keep theirs. Repo-level off is a second, independent means —
the same belt-and-braces reasoning as the Nightly Soak, where removing the cron stopped the
schedule but did not disable the workflow.

## The cost, stated plainly

**No release can be cut until Actions is re-enabled**, and version cuts run on `main` through
CI/CD by owner ruling. That is the trade, and it is deliberate: a release cut is a decision, so
it should require an act. Two commands, in this order:

```bash
echo '{"enabled":true}' | gh api -X PUT \
  repos/HyperQuantMedia/HQM-CodeBase-Memory-fork/actions/permissions --input -
gh workflow enable release.yml --repo HyperQuantMedia/HQM-CodeBase-Memory-fork
```

Then **turn it back off** when the cut is done. Note that re-enabling the repository does not
re-enable the individual workflows, so a cut still needs its own `gh workflow enable` — two
gates, not one.

## Two things to know when checking this

- **The API reads stale.** The `PUT` returned `204 No Content` and the next two `GET`s still
  reported `enabled: true`. It had applied. Re-read before concluding a settings change failed —
  the first draft of this work nearly reported the disable as broken.
- **Org policy can override, and we cannot see it.** `orgs/HyperQuantMedia/actions/permissions`
  returns 403 without `admin:org` scope. The repo-level setting is what we can observe and
  control; if an org policy ever forces Actions on, the repo reading would be the place it shows.

## Verification

```
gh api repos/HyperQuantMedia/HQM-CodeBase-Memory-fork/actions/permissions   # {"enabled":false}
gh run list --repo HyperQuantMedia/HQM-CodeBase-Memory-fork --limit 5       # newest still 2026-07-30
```

Three branches were pushed in the same session (`HQM-dev`, `Merged`, `main`) and created **no
runs** — checked before and after.
