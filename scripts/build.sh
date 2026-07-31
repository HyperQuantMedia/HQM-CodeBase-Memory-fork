#!/usr/bin/env bash
# build.sh — Clean build of production binary (standard or with UI).
#
# Usage:
#   scripts/build.sh                              # Standard binary
#   scripts/build.sh --with-ui                    # Binary with embedded UI
#   scripts/build.sh --version v0.8.0             # With version stamp
#   scripts/build.sh --arch x86_64                # Force x86_64 build
#   scripts/build.sh CC=gcc-14 CXX=g++-14        # Override compiler
#
# This script is the SINGLE source of truth for building release binaries.
# Used identically in local development and CI workflows.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Pre-parse --arch flag before sourcing env.sh
for arg in "$@"; do
    case "$arg" in
        --arch=*) export CBM_ARCH="${arg#--arch=}" ;;
    esac
done
prev_arg=""
for arg in "$@"; do
    if [[ "${prev_arg:-}" == "--arch" ]]; then
        export CBM_ARCH="$arg"
    fi
    prev_arg="$arg"
done

# shellcheck source=env.sh
source "$ROOT/scripts/env.sh"

# Parse remaining arguments
WITH_UI=false
VERSION=""
EXTRA_MAKE_ARGS=()

prev_arg=""
for arg in "$@"; do
    # Skip --arch and its value (already handled)
    if [[ "${prev_arg:-}" == "--arch" ]]; then
        prev_arg="$arg"
        continue
    fi
    case "$arg" in
        --with-ui)
            WITH_UI=true
            ;;
        --version)
            prev_arg="$arg"
            continue
            ;;
        --arch|--arch=*)
            ;; # already handled
        CC=*|CXX=*)
            export "${arg}"
            EXTRA_MAKE_ARGS+=("$arg")
            ;;
        *)
            # Check if this is the value for --version
            if [[ "${prev_arg:-}" == "--version" ]]; then
                VERSION="$arg"
            else
                EXTRA_MAKE_ARGS+=("$arg")
            fi
            ;;
    esac
    prev_arg="$arg"
done

# Version flag
CFLAGS_EXTRA=""
if [[ -n "$VERSION" ]]; then
    CLEAN_VERSION="${VERSION#v}"
    CFLAGS_EXTRA="-DCBM_VERSION=\"\\\"$CLEAN_VERSION\\\"\""
fi

print_env "build.sh"
echo "  ui=$WITH_UI version=${VERSION:-dev}"

# Verify compiler supports target arch
verify_compiler "$CC"

# Step 1: Clean C build artifacts only (not node_modules — npm ci handles that)
rm -rf "$ROOT/build/c"

# Step 2: Build (Makefile applies $ARCHFLAGS for the target arch on macOS)
if $WITH_UI; then
    make -j"$NPROC" -f Makefile.cbm cbm-with-ui \
        CFLAGS_EXTRA="$CFLAGS_EXTRA" "${EXTRA_MAKE_ARGS[@]+"${EXTRA_MAKE_ARGS[@]}"}"
else
    make -j"$NPROC" -f Makefile.cbm cbm \
        CFLAGS_EXTRA="$CFLAGS_EXTRA" "${EXTRA_MAKE_ARGS[@]+"${EXTRA_MAKE_ARGS[@]}"}"
fi

echo "=== Build complete: build/c/codebase-memory-mcp ==="

# Step 3: Binary composition gate.
#
# Asserts what must NOT be inside the artifact — an executable stack, updater URLs,
# SQLite extension loading, test-only environment seams — plus a canary proving the
# needle scan can read the file at all, so a compressed or empty binary fails instead
# of passing. Source review cannot establish any of it: each item regresses invisibly
# through one restored #include, one Makefile edit, or one revived call site.
#
# Upstream runs this from scripts/package-release.sh, which this fork does not have —
# packaging arrived with upstream work we have not taken. The local build IS this
# fork's verification path (CI is dark by owner order), so it runs here, on every
# build, rather than at a packaging step that does not exist yet. When packaging is
# adopted, move it there: after strip, which is the last byte-changing step.
#
# CBM_SKIP_COMPOSITION_GATE=1 skips it. Intended for bisecting a build failure, not
# for release work — a release built with it set is unverified by definition.
GATE="$ROOT/scripts/ci/check-binary-composition.sh"
BUILT="$ROOT/build/c/codebase-memory-mcp"
[ -f "$BUILT" ] || BUILT="$BUILT.exe"
if [ "${CBM_SKIP_COMPOSITION_GATE:-0}" = "1" ]; then
    echo "=== composition gate SKIPPED (CBM_SKIP_COMPOSITION_GATE=1) ==="
elif [ ! -f "$GATE" ]; then
    echo "=== composition gate missing: $GATE ===" >&2
    exit 2
else
    # --variant matters: the gate expects the embedded HTTP/UI server in a ui build
    # and asserts its absence in a standard one.
    if $WITH_UI; then GATE_VARIANT=ui; else GATE_VARIANT=standard; fi
    bash "$GATE" --variant="$GATE_VARIANT" "$BUILT" || exit 2
fi
