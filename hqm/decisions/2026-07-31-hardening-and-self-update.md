<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# The security wave comes to HQM-dev by hand; self-update is gated and repointed

Decided: 2026-07-31 · Ruled by: Rahul · Status: settled (Phase 2 of the v0.2.0 cycle, done)

## The ruling

The eight hardening items are **hand-applied to `HQM-dev`** while the daemon stays quarantined on
`Merged`. Self-update is **compiled out by default** *and* **repointed at HQM's own releases**
when enabled — the owner asked for both, not either.

## Why hand-applied rather than taken with the merge

Because `HQM-dev` was the **less safe branch**, and that is the opposite of how it looked. Our
line still phoned home to DeusData on every session start, still shipped the
download → decompress → pick-executable → `chmod +x` composite, still produced Linux binaries with
`GNU_STACK RWE`, and had no gate proving any of it. The merged tree fixed most of that — but it
cannot run (see [`../bugs.md`](../bugs.md) **B10**), so taking the fixes with it was not available.

The items were separable, but **not** for the reason first assumed. Checking each file for
*daemon* coupling found none, and that was the wrong test: `pass_envscan.c` needed
`cbm_canonical_path` and `cbm_path_to_wide`, so it pulled `compat_fs.{c,h}` and `win_utf8.h` with
it. **Absence of daemon coupling is not absence of coupling — the build is the authority.**

## The eight, and where each came from

| | Item | Source | Verified |
|---|---|---|---|
| 1 | `.note.GNU-stack` + `-Wl,-z,noexecstack` (needed a new `IS_LINUX` probe) | upstream's file, copied | **NO — A1 is ELF-only, `n/a` on PE. Needs a Linux build** |
| 2 | Update check removed — thread, notice injection, 4 struct fields, 3 call sites | ours, surgical | gate A3 |
| 3 | Self-update gated + repointed | **ours entirely — upstream never fixed this** | gate A3, both flag positions built |
| 4 | `-DSQLITE_OMIT_LOAD_EXTENSION` | upstream's flags | gate A4 |
| 5 | Private/exclusive temp paths | ours, following upstream's pattern | reasoned, not gate-covered |
| 6 | `pass_envscan.c` symlinks + 512-byte buffer truncation | upstream's file (+3 foundation files) | reasoned |
| 7 | mimalloc timestamps + `-Wdate-time` + `--no-insert-timestamp` | upstream's file + flags | reasoned |
| 8 | `check-binary-composition.sh`, wired into `scripts/build.sh` | upstream's script, our wiring | it *is* the verification |

**Item 3 is the correction worth remembering.** An earlier reading of this cycle claimed the merge
fixed the dropper composite. It does not — `cbm_extract_binary_from_zip` and `gzip_decompress` are
still in the merged tree and the gate has no assertion for them. That claim was asserted from a
summary rather than checked, and the check was one grep.

## Self-update: why absent, and why repointed

`update` downloaded a release archive, decompressed it, picked an executable out of it, marked it
executable and replaced the running binary — after offering to **delete the user's indexes**. On a
fork the default URL made that a **self-destruct**: it pointed at DeusData's releases, so `update`
replaced Cartograph with vanilla upstream, losing the light theme, the size map, the spacing probe,
`ingest_overlay` and the 16-tool set, and dragging in the daemon that cannot start.

- **Absent, not unreachable.** `CBM_ENABLE_SELF_UPDATE` defaults to 0. The gate scans strings in
  the artifact, so an `if (0)` would still fail it. Five spans are gated: the decompress/extract
  block with its tar and zip helpers, both curl wrappers, `verify_download_checksum`,
  `detect_os`/`detect_arch`, and the chain from `extract_and_install_binary` through
  `cbm_cmd_update`. Eight tests and their fixture are gated with the code — a default build has
  neither the capability nor tests asserting it works.
- **An `#else` stub keeps `update` explaining itself** and pointing at `install.sh`/npm/PyPI,
  because an unknown-subcommand error reads as a broken build rather than a decision.
- **Repointed when enabled:** `CBM_RELEASE_DOWNLOAD_BASE` and `CBM_RELEASE_LATEST_URL` name HQM's
  releases. A fork that fetches its replacement from upstream replaces itself *with* upstream.
  `CBM_DOWNLOAD_URL` still overrides at runtime, which is how installers and tests point it local.
- **Both positions are built.** A flag that only compiles in the off position is a deletion wearing
  a flag's clothes. The on build compiles with 0 errors and then **fails gate A3** on the HQM URLs —
  that failure is the flag working, and it is why the default build is the one that ships.

## The gate's wiring, and why not where upstream puts it

Upstream calls it from `scripts/package-release.sh` after strip. **This branch has no
`package-release.sh`** — packaging arrived with the upstream work we did not take. The local build
IS this fork's verification path while CI is dark, so the gate runs at the end of
`scripts/build.sh` on every build. `CBM_SKIP_COMPOSITION_GATE=1` opts out for bisecting a build
failure; a release built with it set is unverified by definition. Move the call to packaging,
after strip, if packaging is ever adopted — strip is the last byte-changing step.

## Result

`BINARY COMPOSITION OK: 12 assertions passed` on the default build — A0-canary present (so the
absences mean something), A2 seams absent, A3 all four updater needles absent, A4 symbols absent
with `OMIT_LOAD_EXTENSION` present. A1 reports `n/a`: **item 1 remains applied but unproven until a
Linux build runs the gate.** Owner's call: later, before any release.

## The rule this cost five builds to learn

**Gating a capability strands everything only it used, in both directions** — what the span calls,
and what calls into it from outside. `-Werror` finds them one build at a time:
`cbm_download_to_file{,_quiet}`, the tar/zip helpers, `prefix_icase`, `detect_os`/`detect_arch`,
and `create_test_targz` (a test fixture sitting *above* the gated block). Trace both directions
before building, not after.
