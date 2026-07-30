#!/usr/bin/env bash
# HQM-authored tooling. Copyright (C) 2026 HyperQuant Media L.L.P.
# Not part of the upstream MIT-licensed work (c) 2025 DeusData.
#
# sync-vanilla.sh — fast-forward `vanilla-upstream` to DeusData/codebase-memory-mcp,
# refusing if the incoming range would add a workflow file.
#
# Why the workflow gate exists (the whole point of this script):
#
#   Actions in this repo is deliberately dark — workflows are switched off one by
#   one with `gh workflow disable`. That only reaches workflows GitHub has actually
#   *registered*, and registration is lazy: as of 2026-07-31 only 9 workflows are
#   registered against 21 files on `main`. A workflow file arriving from upstream is
#   therefore enabled by default, with no id that could have been disabled ahead of
#   time. No pre-emptive disable can cover it. So the sync stops instead, and hands
#   the decision back to the owner.
#
#   `dco.yml` is the only workflow with an unfiltered `on: push`, and it is disabled;
#   everything else is scoped to `main`, to `qa/**`, or is workflow_call / dispatch /
#   schedule (schedules read the default branch only). That is why a push to
#   `vanilla-upstream` starts nothing today — and why a *new* push-triggered workflow
#   is the one thing that would change it.
#
# The branch is never checked out. The push is a refspec straight from the fetched
# upstream ref, so no local `vanilla-upstream` exists to go stale, drift, or take a
# stray commit. Safe to run from any branch with a dirty tree; touches no working file.
#
# Usage:
#   hqm/scripts/sync-vanilla.sh            report only, push nothing (default)
#   hqm/scripts/sync-vanilla.sh --push     do the fast-forward push
#   hqm/scripts/sync-vanilla.sh --setup    one-time local git config (see below)
#
# Exit codes:
#   0  up to date, or reported cleanly, or pushed
#   1  usage / environment error
#   2  ancestry gate: vanilla-upstream is not an ancestor of upstream/main
#   3  workflow gate: the range adds or renames a file under .github/workflows/
#   4  push failed
#
# Related: hqm/decisions/2026-07-31-vanilla-sync.md · hqm/waypoint.md

set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
ORIGIN_REMOTE="origin"
VANILLA_BRANCH="vanilla-upstream"
PINNED_TAG="v0.9.0" # what HQM-Astra/src/tools/dev/cbm.pin.json pins

# Overridable so the gates can be exercised against a historical range that is known
# to trip them — a gate nobody has watched refuse is not a gate. Overriding forces
# report-only (see the --push guard below), so this can never aim a push somewhere new.
SRC_REF="${SYNC_SRC_REF:-${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}}"
DST_REF="${SYNC_DST_REF:-${ORIGIN_REMOTE}/${VANILLA_BRANCH}}"
refs_overridden=0
if [ -n "${SYNC_SRC_REF:-}" ] || [ -n "${SYNC_DST_REF:-}" ]; then
    refs_overridden=1
fi

do_push=0
do_setup=0

for arg in "$@"; do
    case "$arg" in
    --push) do_push=1 ;;
    --setup) do_setup=1 ;;
    -h | --help)
        sed -n '5,40p' "$0"
        exit 0
        ;;
    *)
        printf 'unknown argument: %s (try --help)\n' "$arg" >&2
        exit 1
        ;;
    esac
done

if [ "$refs_overridden" -eq 1 ] && [ "$do_push" -eq 1 ]; then
    printf 'SYNC_SRC_REF/SYNC_DST_REF are for exercising the gates — --push is refused.\n' >&2
    exit 1
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    printf 'not inside a git repository\n' >&2
    exit 1
}
cd "$repo_root"

git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 || {
    printf 'no "%s" remote — expected DeusData/codebase-memory-mcp\n' "$UPSTREAM_REMOTE" >&2
    exit 1
}

# ── --setup: one-time local config ──────────────────────────────────────────
#
# Local config only, nothing committed. Kept here rather than in a shell history
# so it is recorded, repeatable, and reviewable.
if [ "$do_setup" -eq 1 ]; then
    # A stray `git push upstream` would otherwise reach DeusData. Offers upstream are
    # owner-gated every time, so the default is a URL that cannot resolve. Fetch is
    # untouched. Undo on the day an offer is deliberately made:
    #   git remote set-url --push upstream https://github.com/DeusData/codebase-memory-mcp.git
    git remote set-url --push "$UPSTREAM_REMOTE" DISABLED
    printf 'set: %s push url → DISABLED (fetch unchanged)\n' "$UPSTREAM_REMOTE"

    # Unused by the sync path above — it pushes by refspec and never checks the branch
    # out. These matter the moment the branch *is* checked out locally to build vanilla
    # for comparison: pull comes from upstream, push goes to ours.
    git config "branch.${VANILLA_BRANCH}.remote" "$UPSTREAM_REMOTE"
    git config "branch.${VANILLA_BRANCH}.merge" "refs/heads/${UPSTREAM_BRANCH}"
    git config "branch.${VANILLA_BRANCH}.pushRemote" "$ORIGIN_REMOTE"
    printf 'set: %s tracks %s, pushes to %s\n' \
        "$VANILLA_BRANCH" "$SRC_REF" "$ORIGIN_REMOTE"
    printf '\nsetup done. Run again without --setup to check for upstream commits.\n'
    exit 0
fi

# ── Fetch ───────────────────────────────────────────────────────────────────
#
# Both remotes: the local upstream ref lags reality, and the ancestry gate compares
# against origin's idea of the branch, which someone else may have moved.
printf 'fetching %s and %s ...\n' "$UPSTREAM_REMOTE" "$ORIGIN_REMOTE"
git fetch "$UPSTREAM_REMOTE" --prune --quiet
git fetch "$ORIGIN_REMOTE" --prune --quiet

src_sha=$(git rev-parse "$SRC_REF")
dst_sha=$(git rev-parse "$DST_REF")

printf '\n%-18s %s\n' "$DST_REF" "${dst_sha:0:8}"
printf '%-18s %s\n\n' "$SRC_REF" "${src_sha:0:8}"

if [ "$src_sha" = "$dst_sha" ]; then
    printf 'already up to date — nothing to do.\n'
    exit 0
fi

# ── Gate 1: ancestry ────────────────────────────────────────────────────────
#
# `vanilla-upstream` is upstream and nothing else. If it is not an ancestor of
# upstream/main, someone has put a commit on it — that is a question for the owner,
# not something to force past.
if ! git merge-base --is-ancestor "$dst_sha" "$src_sha"; then
    printf 'REFUSED — %s is not an ancestor of %s.\n\n' "$DST_REF" "$SRC_REF"
    printf 'Commits on %s that are not upstream:\n' "$DST_REF"
    git log --oneline "${src_sha}..${dst_sha}"
    printf '\nThe branch is meant to be pure upstream. Owner decision, not a force-push.\n'
    exit 2
fi

commit_count=$(git rev-list --count "${dst_sha}..${src_sha}")
printf 'ahead by %s commit(s), clean fast-forward.\n\n' "$commit_count"

# ── Gate 2: workflow files ──────────────────────────────────────────────────
wf_diff=$(git diff --name-status "$dst_sha" "$src_sha" -- .github/workflows/ || true)

if [ -n "$wf_diff" ]; then
    printf 'workflow files touched in this range:\n'
    printf '%s\n\n' "$wf_diff"
else
    printf 'workflow files touched in this range: none\n\n'
fi

# Status letters: A added, R### renamed, C### copied — each puts a file at a path that
# had no workflow before, which is exactly what no pre-emptive disable can reach.
added=$(printf '%s\n' "$wf_diff" | grep -E '^(A|R[0-9]*|C[0-9]*)[[:space:]]' || true)

if [ -n "$added" ]; then
    printf 'REFUSED — this range adds or renames a workflow file:\n\n'
    printf '%s\n\n' "$added"
    cat <<'EOF'
A workflow file arriving from upstream is enabled by default. `gh workflow disable`
cannot have covered it in advance: it has no workflow id until GitHub registers it,
and registration is lazy.

To proceed deliberately:
  1. Read the new file's `on:` block. It only matters here if it can fire on a push
     to vanilla-upstream — an unfiltered `on: push`, or one whose branch filter
     matches. main-scoped, qa/**-scoped, workflow_call, workflow_dispatch and
     schedule triggers cannot.
  2. Push anyway if it is inert, or push and immediately disable it once it registers:
       gh workflow disable <file>.yml --repo HyperQuantMedia/HQM-CodeBase-Memory-fork
  3. Record the call in hqm/decisions/ if it changes the dark-repo posture.
EOF
    exit 3
fi

# ── Report ──────────────────────────────────────────────────────────────────
printf 'incoming commits:\n'
git log --oneline --no-decorate "${dst_sha}..${src_sha}" | sed 's/^/  /'
printf '\n'

# A newer upstream release means HQM-Astra's pin is a decision waiting to be made,
# not a file waiting to be edited. Report it; never act on it here.
latest_tag=$(gh release view --repo DeusData/codebase-memory-mcp --json tagName \
    --jq .tagName 2>/dev/null || true)
if [ -n "$latest_tag" ] && [ "$latest_tag" != "$PINNED_TAG" ]; then
    printf 'NOTE: upstream latest release is %s; cbm.pin.json pins %s.\n' \
        "$latest_tag" "$PINNED_TAG"
    printf '      Re-pinning is an owner decision — see hqm/waypoint.md.\n\n'
elif [ -n "$latest_tag" ]; then
    printf 'upstream latest release: %s (matches the pin)\n\n' "$latest_tag"
fi

if [ "$do_push" -eq 0 ]; then
    printf 'report only — nothing pushed. Re-run with --push to fast-forward %s.\n' "$DST_REF"
    exit 0
fi

# ── Push ────────────────────────────────────────────────────────────────────
#
# Refspec straight from the fetched upstream ref: no checkout, no local branch, no
# working-tree change. No --force — the ancestry gate above already established this
# is a fast-forward, and if git disagrees the push should fail.
printf 'pushing %s → %s/%s ...\n' "$SRC_REF" "$ORIGIN_REMOTE" "$VANILLA_BRANCH"
if ! git push "$ORIGIN_REMOTE" "${src_sha}:refs/heads/${VANILLA_BRANCH}"; then
    printf '\npush failed.\n' >&2
    exit 4
fi

printf '\n%s is now %s.\n' "$DST_REF" "${src_sha:0:8}"
cat <<'EOF'

Confirm the repo stayed dark — this is the claim that matters, so verify it:
  gh run list --repo HyperQuantMedia/HQM-CodeBase-Memory-fork --limit 5
  gh api "repos/HyperQuantMedia/HQM-CodeBase-Memory-fork/actions/workflows?per_page=100" --jq .total_count
EOF
