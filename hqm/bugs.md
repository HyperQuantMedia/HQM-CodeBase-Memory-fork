<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# Open defects — Cartograph and this fork's HQM surfaces

Updated: 2026-07-31 · Register for bug-tracking sessions

## How to use this file

One heading per defect. Every entry carries **Severity**, **Status**, and a **repro** or the
observation that stands in for one. A defect leaves this file only when it is fixed *and* the
fix is verified — by a test where the failure is testable, by the owner's eyes where it is
visual. Fixed entries move to the bottom under "Closed this cycle" with the commit that
closed them, and are cleared when the cycle is wrapped.

`awaiting(Rahul)` means the next move is the owner's, not a session's. Do not "fix" one of
those by guessing what the answer should be.

**Never close a visual defect on a metric of my own choosing.** That rule cost four rounds to
learn; see `notes/2026-07-30-usability-arc.md`.

Fix shapes for **B2**, **B3**, **B4**, **B5** and **B6** were settled on 2026-07-31 —
[`decisions/2026-07-31-stay-on-the-v0.9.0-line.md`](decisions/2026-07-31-stay-on-the-v0.9.0-line.md)
§ *Also settled in this session*. Each entry below now carries its ruling; **B1** is unchanged and
still the gate ([`plans/2026-07-31-v0.2.0-cycle.md`](plans/2026-07-31-v0.2.0-cycle.md) Phase 0).

---

## OPEN

### B1 — Round 5–8 UI work is unverified by eyes

**Severity:** was blocking the cycle · **Status:** density APPROVED (round 2); **round 6
(`index-Bo_D9Kfv` — colour system, A3a, the round-4/5 layout) SERVED and NOT APPROVED — owner
deferred all verdicts to the next session.** Eye-certified so far: round 1's approvals and the
0.85 density only. Remaining: everything since, plus the unnamed "mostly" remainder

**Round 2 (bundle `index-LIahPU0Q`): spacing 0.85 approved by eye.** Owner's words: it reads
right *because it is a 3D view, not a 2D perspective, and the rotation matters* — density
judgment is bound to parallax and orbit, worth remembering when anyone proposes judging spacing
from a static screenshot. The recalibration ruling lives in the probe's `CALIBRATION` comment and
`e88c0b90`: ceiling 18%, sparse tie-break, dial 0.85, probe recommendation = shipped value on the
real corpus. **Phase 0 is satisfied — Phases 3 and 4 are unblocked.**

Owner's first pass on the served build (`assets/index-BcsUzG7C.js`):

- **Approved:** header tab icons (hand-drawn graph glyph *as a tab icon*); graph sidebar
  ("mostly" — no specific defect named); Diagnostics chips + line filter.
- **Right panel dock:** correct.
- **New defects:** **B12** (sort says count, means bytes; file-count sort missing), **B13**
  (treemap hides Settings/toggles), **B14** (cross-link glyph reads as share — owner could not
  find the button while looking for it).
- **Density:** no verdict on 0.70 yet. Owner asked for the per-repo/live measurement — the
  footer `measure` link IS that (worker probe over the on-screen corpus); phrasing reads as a
  lean toward the probe running itself on view change — logged as owner input on the parked
  Phase 4b question.

Everything from this session is green in the suite and unlooked-at on screen. Green suites
missed all sixteen defects of rounds 1–4 and all four of round 5. The surfaces to look at:

- header tab icons, and the hand-drawn graph glyph in particular (third attempt)
- size map: left panel (Filters/Folders), docked right detail panel, cycling view button,
  HUD, drill path, footer
- size map in sphere / cone / tree — **the density is the specific question.** 0.70 on the
  fit quantile is a judgment on a trade curve, not a derived value; the table in
  `decisions/2026-07-30-size-map-as-projection.md` says what each notch costs
- graph sidebar: sort chips, folders/files scope chips, folder search results
- Diagnostics: level chips + line filter
- both tabs' cross-link buttons (icons now, not words)
- type: whether the scale in `graph-ui/src/lib/typeScale.ts` is the one that was liked

**Repro:** hard-reload `http://127.0.0.1:9749`.

**The density half is measured and answered** (2026-07-31). `npm run probe:spheres` sweeps
`RADII_FIT_QUANTILE` through the real layout and scores every notch against the band below the
**already-approved** relationship graph (57% of sampled nodes intersecting a neighbour). It
recommends **0.70 — the value already shipping** — on the real 26k-file corpus (21.8% / 22.0% /
21.0% overlapping across sphere / cone / tree) and on the seeded synthetic corpus independently,
reproducing the hand-measured table from a different code path. Ruling and the fixture calibration:
[`decisions/2026-07-31-sphere-probe-seeded-corpus.md`](decisions/2026-07-31-sphere-probe-seeded-corpus.md).

The question left for the eye is therefore *"does 0.70 look right"*, not *"what number"* — and the
size view's footer now names the value in force, so what is being judged is on screen rather than
buried in a constant. **No longer blocked on B7.**

### B2 — Size-view breadcrumb resolves a crumb by its label

**Severity:** low · **Status:** **fixed in `6b4a58be`** (onSelect passes the whole Crumb; the graph tab now feeds the sidebar the full path, which the label never matched) — awaiting eyes, B1 round 3

`SizeTab`'s picked-node trail passes `Breadcrumb`, whose `onSelect` hands back only the
crumb's label, not its prefix. With a repeated path segment (`src/parser/src`) a click jumps
to the deepest match rather than the one clicked.

The drill-path row above the map is unaffected — it carries real prefixes.

**Fix shape — settled 2026-07-31:** widen `Breadcrumb`'s `onSelect` to pass the whole `Crumb`
(touches `GraphTab` too). A crumb is an identity, not a display string; a second trail component
would be two implementations of one thing and owes the parity ruling anyway. Lands in the Phase 3
parity sweep.

**Repro:** need a corpus with a repeated segment; none of the indexed projects has one, which
is why this is unverified rather than confirmed.

### B3 — Colours tab does nothing for the size view

**Severity:** low · **Status:** **CLOSED 2026-08-01, `7f24d030`** — kinds joined the override
store (`colorForKind`, overrides in `appearance.labelColors` — lowercase kinds cannot collide
with Capitalised labels), the one Colors tab lists the kinds in the size view, and every
kind-coloured surface resolves through the override chain. Owner eye pending in the next round.

`SettingsMenu`'s Colours tab overrides colours resolved through `colorForLabel()`
(`LABEL_COLORS`). The size view colours by file *kind* out of `KIND_COLORS`. Passing kind
names would render swatches that change nothing, so `labels={[]}` is passed and the tab is
empty on that tab.

**Fix shape — settled 2026-07-31:** kind colours **are** user-themeable, so `KIND_COLORS` joins the
override store and the one Colours tab works in both views. No separate size-view colour section —
that would be a second control for one job, against the parity ruling. Lands in Phase 4a beside the
edge-colour system.

### B4 — `src/ui/embedded_assets.c` is untracked and must stay that way

**Severity:** papercut, but it bites every new session · **Status:** **silenced locally
2026-07-31** — upstream's omission stands

Generated by `scripts/embed-frontend.sh`, deleted by `clean.sh`; upstream never gitignored
it. It showed in `git status` forever. **Do not commit it.** Adding it to `.gitignore` would be
a change to an upstream-owned file — worth offering upstream, not worth doing unilaterally.

**Applied:** the path is listed in **`.git/info/exclude`**, which is local, uncommitted and
touches no upstream file — so the tidiness-versus-clean-diff trade-off was false. A fresh clone
does not inherit it; re-add the line, or expect the noise back.

### B5 — `graph-ui/tsconfig.tsbuildinfo` is tracked and dirties on every typecheck

**Severity:** papercut · **Status:** **silenced locally 2026-07-31** — upstream's choice stands

A build artifact under version control. Every `tsc -b` marked it modified, so it rode along in
any commit that was not staged path-by-path.

**Applied:** `git update-index --skip-worktree graph-ui/tsconfig.tsbuildinfo`. Local to this
index; untrack + gitignore would touch an upstream-owned file, so it stays an upstream offer or
an explicit owner decision to diverge.

**Two things to know about the flag.** It hides *real* incoming changes too: a merge or checkout
that needs to update this path will refuse rather than overwrite. **Checked for Phase 1** — no
commit in the incoming `3eb294fa` range touches it, so that merge is unaffected. Undo with
`git update-index --no-skip-worktree graph-ui/tsconfig.tsbuildinfo`; a fresh clone does not
inherit the flag.

### B6 — Four commits lack `Signed-off-by`

**Severity:** downgraded to inert · **Status:** **settled 2026-07-31 — no action**

`629d43f2`, `7438a2df`, `0bb03c48`, `279d7e25`. DCO is disabled so nothing caught it; my drift.
Everything from `ea3e54f6` on is signed.

**Why it is inert:** DCO only matters for commits **offered to DeusData**, and all four are
UI/size-map work — none is in the upstream-offer set (`c8d4d25c`, `28f32e70`, `f52a791f`). The fix
would rewrite pushed history to satisfy a gate they will never reach. Left alone deliberately;
re-open only if one of these four ever enters an offer.

### B7 — Probe rigs are picked up by the default test run

**Severity:** papercut · **Status:** **narrowed 2026-07-31** — the replacement is clean; the two
old rigs are not

`graph-ui/scratchpad/view-layout-probe/probe.test.ts` and `.../size-graph-probe/probe.test.ts`
match vitest's default include, so `npx vitest run` executes them on a machine that has their
gitignored JSON fixtures — and would fail on a clean checkout, since the fixtures are not
committed.

Not fixed by adding `scratchpad/**` to vitest's `exclude`: `exclude` beats an explicit path
filter, so that would also break the documented way of *running* the probes.

**Fix shape:** rename the rigs off the `.test.ts` suffix and invoke them through their own
config, or commit small fixtures. Neither is urgent while the rigs are throwaway.

**That fix shape is now demonstrated, not theoretical.** The sphere probe that replaces
`size-graph-probe/` does both halves: `graph-ui/scripts/sizeMapSphereProbe.sweep.ts` is not named
`*.test.ts` and runs through `scripts/vitest.sphereProbe.config.ts`, so `npm test` never collects
it; and its corpus is generated from a seed, so it needs no fixture on disk. **The 47k-node fixture
question that gated this is gone** — nothing has to be committed, released, or refetched.

The two old rigs still match the default include and still hold gitignored payloads, so B7 stays
open for them. They are kept for one reason: `p4.json` and `corpus.json` are the only real corpora
on this machine, and they are the calibration reference the synthetic fixture is checked against.
Deleting them is cheap to say and expensive to undo — `p4` needs a 25 GB re-index.

### B8 — VS Code reports "Unable to find reusable workflow" on every local `uses:`

**Severity:** noise, but expensive noise · **Status:** editor-side false positive — **do not "fix" the
paths**

The GitHub Actions extension flags every same-repo reusable-workflow reference as an error. Seven
diagnostics, all identical, one per reference and nothing else:

```
release.yml      :44 :49 :54 :62 :69 :77   uses: ./.github/workflows/_{security,lint,test,build,smoke,soak}.yml
nightly-soak.yml :33                       uses: ./.github/workflows/soak.yml
message: "Unable to find reusable workflow"   severity 8 (Error)
```

**The references are correct.** Three independent confirmations:

1. All seven callee files exist at those repo-relative paths and every one declares `workflow_call`.
2. `./.github/workflows/<file>.yml` is GitHub's **only** valid same-repo form, and it is what all 16
   references across 7 caller workflows use — there is no other convention in this repo to conform to.
3. **GitHub itself resolved them.** Run `30495762643` (release.yml, 2026-07-29) produced jobs named
   `security / security-static`, `lint / lint`, `test / test-unix (…)`, `build / build-windows`. That
   `caller / callee` naming only happens when a reusable reference resolves; an unresolvable one fails
   the run at parse time and produces no jobs at all.

Likely cause: the extension resolves `./` against the wrong workspace folder. This is a 15-folder
multi-root window, and `F:\Git\.github\workflows` and `F:\Git\HyperQuantMedia\.github\workflows` both
do not exist — so a lookup from either root finds nothing, while the nine pinned third-party actions
in release.yml keep resolving over the network. Survived a window reload. The same misbinding is the
best explanation for files rendering as untracked in the explorer while `git status` reports them
clean.

**Confirmation test:** open `F:\Git\HQM-CodeBase-Memory-fork` in its own single-root window. If the
seven clear, it is the extension.

**Do not** rewrite these to `owner/repo/.github/workflows/x.yml@ref` to silence it. That form is valid
syntax but cross-repo semantics: the callee is read from the named ref rather than the commit under
test, so a PR changing a reusable workflow would be validated against the old copy; it hard-codes the
fork's name, breaking on other branches and poisoning any patch offered upstream; and it would leave
two conventions in one repo. Weighed and rejected 2026-07-30.

Two *real* defects were found in these files while chasing this, and both are fixed: the non-callable
`soak.yml` reference (`7825f288`) and `type: number` under `workflow_dispatch`, which is illegal —
only `boolean`, `choice`, `environment`, `string` are (`dce7050c`).

### B10 — Upstream's daemon never starts on Windows, so the merged tree is unusable

**Severity:** blocking `Merged` entirely · **Status:** upstream's defect, **not ours to fix** —
`Merged` is quarantined because of it

Not a defect in our code, and recorded here because it is the single fact that decides what
`Merged` is allowed to do. On the full-take tree, nothing stateful runs:

```
--version       ok            (stateless, bypasses the daemon)
list_projects   CBM daemon could not start within 30000 ms
daemon start    CBM daemon could not start within 30000 ms   (error exit)
daemon status   daemon: not running
--ui=true       no response at all
```

`main.c` routes every MCP session, hook and one-shot CLI command through
`cbm_daemon_bootstrap_endpoint_new()`, so no CLI, no MCP, no UI.

**Proven inherited, not caused by our merge.** A detached worktree at
`origin/vanilla-upstream` — zero HQM code — was built and run on this machine and fails
identically, same two messages, same error exit. The C suite agrees: **98 failures**, every one
in the daemon/lock family, reproduced there suite-for-suite (`daemon_runtime` 33, `daemon_ipc`
27, `version_cohort` 13, `daemon_bootstrap` 10, `private_file_lock` 6, `project_lock` 1).

**The ACL layer is NOT the cause, despite appearances.** The runtime directory is created
correctly with every lock file and a valid rendezvous record naming its pipe
(`cbm-lifetime.lock`, `cbm-startup-v2.lock`, `cbm-rendezvous.lock`, four version-cohort locks).
The failing *tests* pass an explicit temp-dir parent; production uses `LOCALAPPDATA` via
`SHGetFolderPathW` and that path works. So the runtime defect is **later** than the one the tests
exhibit — the daemon child never comes up or never serves — and it is a **different, more severe
bug than upstream's open #1351**. Chasing the ACL layer would be chasing the wrong defect.

Two dead ends already paid for: `TEMP`/`cbm_tmpdir` was asserted as the cause and disproved by
testing three values (`/tmp`, `C:\msys64\tmp`, a real user temp — identical failure); and
`win_private_directory_tree_secure`'s drive-absolute check is a real mechanism that is not the
one firing.

**Repro:** build any tree containing `src/daemon/` and run `list_projects`.
`scratchpad/c-suite/build-vanilla-binary.sh` builds the pure-upstream comparison.

**What would close it:** upstream tagging a release whose daemon starts on Windows. That is the
revisit condition in
[`decisions/2026-07-31-stay-on-the-v0.9.0-line.md`](decisions/2026-07-31-stay-on-the-v0.9.0-line.md)
— a behaviour test, not a version number, because `v0.9.1-rc.1` is newer and changes nothing
(prerelease, contains all 24 daemon files, and is the build #1351 reports broken).

### B9 — Relationship chips use an opacity modifier, so they ignore the light stage

**Severity:** low · **Status:** **fixed in `6b4a58be`** (`text-ink-soft`) — awaiting eyes, B1 round 3

`FilterPanel.tsx`'s relationship chips carry `text-foreground/60`. Tailwind v4 opacity modifiers
compile to a real alpha, so the colour cannot be theme-aware — the standing ruling is to name the
ink role instead ([`decisions/2026-07-30-light-is-a-render-model.md`](decisions/2026-07-30-light-is-a-render-model.md)).
Same class of defect as the ported missed-graph markup fixed in the merge, but this one predates it
and is ours.

Found by a test written for the *ported* section: asserting "no opacity modifiers" over the whole
panel failed on this line, so the assertion was scoped to the new section and this was recorded
rather than quietly widened. **Fix belongs to Phase 3's parity sweep**, which is already touching
this panel.

**Repro:** switch to the light theme and compare a relationship chip's contrast against a node-type
chip beside it.

### B12 — Size panel's sort button says "count" but sorts by bytes; file-count sort missing

**Severity:** medium — a control that lies · **Status:** **fixed in `2f669858`** (name/size/files keys, distinct glyphs, legacy count→size migration) — awaiting eyes, B1 round 3

`lib/sortOrder.ts` knows two keys, `name | count`, and `SizeTree.tsx:74` feeds **bytes** into the
count slot — so the size panel's button is labelled count and actually sorts by size. The owner's
ruling: **sort by size and sort by file-count are two different questions and get two controls**
(plus name). Fix shape: a third key (or a per-list measure label) in `sortOrder.ts`, `SizeTree`
passes bytes AND fileCount separately, `SortControl`'s accessible label names the real measure.
Belongs to Phase 3 (the sweep already touches this panel).

### B13 — Treemap view hides Settings and the toggle rail

**Severity:** medium · **Status:** **fixed in `2f669858`** (rail stable on every view; orbit disabled with a reason on the treemap) — awaiting eyes, B1 round 3

`SizeTab.tsx` gates the auto-rotate toggle AND `SettingsMenu` behind `view !== "treemap"` (the
comment reasons fov/bloom have nothing to act on in a DOM view). Owner ruling: **cycling views
must not make controls appear and disappear** — keep the rail stable; disable or empty what does
not apply. Phase 3.

### B14 — The graph cross-link glyph reads as a share icon (third attempt still misread)

**Severity:** low, but it defeated its own purpose · **Status:** **fixed in `2f669858`** (the word carries the destination: "Graph" / "Size map") — awaiting eyes, B1 round 3

The size tab's cross-link button ("Open the relationship graph") is the hand-drawn graph glyph —
and the owner, hunting for exactly this button, could not find it because it reads as a platform
share affordance. The 2026-07-30 ruling replaced `Share2` for this exact reason; the replacement
inherited the problem. Fix shape: draw it again (fourth attempt) or pair the glyph with a visible
label; verify by the owner finding it unprompted.

### B11 — Executable-stack fix applied but unproven on ELF output

**Severity:** release-gating for any Linux artifact · **Status:** open until a Linux build runs
the gate — owner's call on when, before any release

Hardening item 1: `vendored/nomic/code_vectors_blob.S` (the only assembly in the build) lacked
`.note.GNU-stack`, so GNU ld assumed the worst for the whole link — **every Linux binary ever
shipped from this line had `GNU_STACK RWE`**. The fix is applied on `HQM-dev` (the section note
plus ELF-only `-Wl,-z,noexecstack` behind the new `IS_LINUX` probe), but the gate's A1 assertion
is ELF-only and reports `n/a` on a PE build — so on this machine the fix is present in source and
**machine-unproven in the artifact**. The other seven items do not share this gap; they are gate-
verified on the PE build and closed below.

**What closes it:** one Linux build, then
`scripts/ci/check-binary-composition.sh` showing A1 `PASS` (no `GNU_STACK RWE`).

---

## Closed this cycle

Fixed and verified by test; visual confirmation still rolled up in **B1**.

| | Defect | Closed by |
|---|---|---|
| — | Size map drew nothing — mount-effect could not see a frame behind four early returns | this cycle, `SizeTab.test.tsx` (mutation-verified) |
| — | `Sizes` tab live with no project selected | this cycle |
| — | Folders collapsed to top, overriding the owner's `mt-auto` ruling — *and a test defended the override* | this cycle, test rewritten to assert the ruling |
| — | Size-map scene never framed; read as broken camera controls | this cycle |
| — | Kind chips filtered the 3D scene only; treemap ignored them and folder sums disagreed | this cycle, `SizeTab.test.tsx` |
| — | File tile absorbed its click and did nothing | this cycle |

### The hardening wave — seven of eight closed 2026-07-31

Inherited security defects, hand-applied to `HQM-dev` (`6ffaf719` items 1–4/6/7, `dbd7add7`
items 5+8) because upstream's own fixes edit `src/daemon/application.c`, which our base does not
have — cherry-picking was impossible. Ruling and per-item provenance:
[`decisions/2026-07-31-hardening-and-self-update.md`](decisions/2026-07-31-hardening-and-self-update.md).
Verification is against the **built artifact**, never source review:
`scripts/ci/check-binary-composition.sh` returned **`BINARY COMPOSITION OK: 12 assertions
passed`** on the default build. Item 1 is NOT in this table — it is **B11** above, open until a
Linux build proves it.

| # | Defect | Verification |
|---|---|---|
| 2 | Update check phoned home to DeusData's releases from every shipped binary (`mcp.c:6620`) | gate A3 — all four updater needles absent |
| 3 | Self-update was a download→decompress→`chmod +x` dropper composite, pointed at DeusData so `update` replaced Cartograph with vanilla | gated behind `CBM_ENABLE_SELF_UPDATE` (default 0) and repointed at HQM releases; default build A3-clean, and the ON position **builds** (`build-selfupdate-on.log`) with the gate then failing exactly the two A3 URL assertions — flag and gate both proven |
| 4 | SQLite extension loading compiled in with no caller | gate A4 — both symbols absent, `OMIT_LOAD_EXTENSION` present |
| 5 | Predictable shared temp paths (`mcp.c` search scratch, `artifact.c`, `diagnostics.c`) | no gate assertion exists for behaviour; `cbm_mkdtemp`/`cbm_mkstemp` private-dir pattern applied, written through descriptors, build + suites green |
| 6 | `pass_envscan.c` descended symlinks out of the project root; 512-byte buffers truncated into pointer arithmetic | suite green; needed `compat_fs.{c,h}` + `win_utf8.h` foundations |
| 7 | `__DATE__`/`__TIME__` in mimalloc + linker timestamp made identical source unreproducible | `-Wdate-time`, `-Wl,--no-insert-timestamp`, mimalloc stamp dropped |
| 8 | Nothing verified the shipped artifact's composition at all | the gate itself, wired into `scripts/build.sh` on every local build (`CBM_SKIP_COMPOSITION_GATE=1` opts out); canary A0 proves the needle scan reads the file |
