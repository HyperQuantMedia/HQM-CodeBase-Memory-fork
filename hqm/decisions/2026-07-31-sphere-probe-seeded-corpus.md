<!-- HQM-authored documentation. Copyright (C) 2026 HyperQuant Media L.L.P.
     Not part of the upstream MIT-licensed work (c) 2025 DeusData. -->

# The spacing dial gets a committed probe, a seeded corpus, and a delegated thread

Decided: 2026-07-31 · Ruled by: Rahul · Status: settled

## The ruling

The size map's spacing dial (`RADII_FIT_QUANTILE`) is measured by **committed code with
its own seeded corpus**, not by a throwaway rig loading a payload that exists on one
machine. Owner's instruction: *"add a sizemap sphere size probe script"*, camelCase, and
*"it can run on a thread and update the graph view as a delegated action … if the script
takes too long then it sub jobs automatically … but if it still takes more than 2 seconds
then the user will need to be notified."*

That is three rules, and they are now three properties of the code rather than three
intentions.

## What was wrong with the rig it replaces

`graph-ui/scratchpad/size-graph-probe/` produced every number in the trade table
in `viewLayout.ts` — and none of them can be re-checked. It loads `p4.json` (3.2 MB)
and `corpus.json` (25.7 MB), both gitignored, both fetched from a 25 GB tree that
exists on one machine. A future session cannot verify that 0.70 was right; it can only
derive some other value from some other corpus and hope.

That is the same class of problem as the defect the whole size-map arc kept hitting:
**a number nobody can re-derive is a number nobody can overturn.**

## Why a seeded synthetic corpus, and what it costs

**Seeded synthetic** (mulberry32, fixed seed, log-normal bulk with a heavy tail) beat
the three options on the table:

| Option | Why not |
|---|---|
| Commit the real payload | 25.7 MB in a repo we keep cheap to merge, and trimming it to a committable size removes the lopsidedness being measured — the whole question only bites when a 400 MB archive sits beside a 2 KB header |
| Release asset | Release machinery is `disabled_manually` and this cycle deletes the existing draft, so it depends on work that has not happened; and a measurement that reaches the network fails offline |
| Re-fetch from the running binary | Re-fetches *this* machine's `p4`, so the number still is not checkable anywhere else |

**The cost, stated:** the fixture is my construction, so its distribution is an
assertion about what real corpora look like. It holds only as far as it is calibrated,
and that calibration only holds while this machine still has `p4`.

### The calibration, and the fixture fault it caught

The first fixture was wrong, and the way it failed is the argument for measuring the
fixture as well as the layout.

At 6,000 files it swept cleanly and recommended 0.70. At 47,000 it went **degenerate**:
identical numbers at every notch in `tree` (15.0%, extent 8139, unchanged), and a
discontinuous collapse in `sphere` from 33% overlapping at 0.65 to 0.8% at 0.70, flat
from there. That is what a broken layout looks like. **The real `p4` corpus swept
smoothly at the same node count** — which is what proved the fixture, not the layout,
was at fault.

Measured cause: the fixture was too *tame*. One narrow log-normal with a small
multiplier tail gave a max/median spread of ~4,000 against a real **1,195,167**, and a
bushy shallow tree (mean file depth ~4) against a real **9.97**. Both matter, and the
second is the subtle one: the size graph caps at 8,000 nodes and emits heaviest-first,
so a directory-heavy corpus fills that budget with **fixed-radius folder nodes** and
the measurement stops being about byte-driven radii at all.

Rebuilt as a four-component mixture (source · assets · build output · archives) with
depth drawn around a mean rather than biased over a flat list:

| | real `p4` | synthetic, calibrated |
|---|---|---|
| files | 26,411 | 47,000 |
| dirs per file | 0.122 | 0.092 |
| mean path depth | 9.97 | 10.00 |
| max depth | 17 | 17 |
| bytes p50 | 2,157 | 2,194 |
| bytes p90 | 622,488 | 377,563 |
| bytes p99 | 5,470,208 | 13,805,260 |
| bytes max | 2.58 GB | 3.20 GB |
| **spread (max/p50)** | **1,195,167×** | **1,458,144×** |

Both now sweep smoothly and **both recommend 0.70**. The report states this shape on
every run, next to the numbers it produced — a degenerate sweep is usually the fixture,
and that line is what says so in one read instead of one afternoon.

### The shipped value is now measured, not asserted

The real corpus at 0.70 gives **21.8% / 22.0% / 21.0%** of sampled nodes overlapping
across sphere / cone / tree — reproducing the hand-measured table's ~21% from a
different code path, on the corpus the table was built from. **The recommendation is
the value already shipping.** Phase 0's density question is answered by measurement;
the owner's eye still decides, which is B1 and unchanged.

### One finding worth keeping

On the synthetic corpus the `tree` projection returns **identical geometry for every
notch from 0.55 to 0.80** — the radii fit early-returns when its scale factor lands
within 1.02, so the dial has no authority there until 0.85. The real corpus's `tree`
does respond across the whole range. So the dial's reach is
**projection-and-corpus-dependent**, which nothing previously said. Not filed as a
defect: on the corpora that matter it works, and the honest statement is that a roomy
tree needs no separation rather than that the control is broken.

## Calibration is a band, not a target

The probe scores a notch against the **approved relationship graph** — 57% of sampled
nodes intersecting a neighbour, median clearance −0.32× median radius, measured
2026-07-30 — and not against an ideal. An invented "no spheres overlap" target was hit
exactly and produced a near-empty starfield.

A size map wants to be *less* dense than the relationship graph, because a half-buried
sphere misstates its own file's bytes, which is the one thing the view exists to say.
So the acceptance band sits **below** the reference: **5%–25% overlapping**.

Two rules fall out of that, both in code:

- **A notch must hold in every projection.** One dial serves sphere, cone and tree
  (the parity ruling), so a value that only works in `sphere` is not a value.
- **Ties break toward the denser end**, because the failure the owner actually
  overturned was an empty scene, not a crowded one.
- **When no notch qualifies, nothing is applied** and the report says so. Applying the
  best of a bad set is the invented-metric mistake wearing a different hat.

## Why the quantile became an argument

`applyViewMode` now takes the quantile, defaulting to the shipped constant. The
alternative was to reconstruct what a different notch *would* have done from an
already-fitted scene, and that is not recoverable: the fit clamps at 1 and never
shrinks, so the information about a lower quantile is gone by the time it returns.

A probe that measures a replica of the layout instead of the layout is a probe that
drifts from it silently — the same shape as a test defending a regression.

## Why it runs on a thread

The measurement is O(samples × nodes) per notch, 27 notches, so a real corpus is
seconds of arithmetic. On the main thread that is a frozen tab — and **a frozen tab
during a density measurement is indistinguishable from the broken view the measurement
exists to prevent.**

- **Sub-jobs are resumable, not merely queued.** One (view, notch) pair is a job, and
  the nearest-neighbour sweep *inside* a job carries a cursor, so a slice can end
  mid-corpus and pick up where it stopped. The clock is read every 32 samples; a slice
  defaults to 8 ms, half a 60 Hz frame.
- **High priority where the platform has it:** `scheduler.postTask` at
  `user-blocking`, because a plain `setTimeout(0)` is clamped and sits behind
  lower-priority work — which is how a 2-second job becomes a 10-second one. Node has
  neither and falls through to a macrotask.
- **A sliced run must equal a straight one.** Locked by a test: zero-millisecond
  slices (the tightest chunking the stepper can produce) return the identical
  measurement. Otherwise the number depends on how busy the thread was, which is not a
  number.

## The two-second rule

Past `NOTIFY_AFTER_MS = 2000` the user is **told, not interrupted** — the run
continues. The notice names what is on screen meanwhile: *"the view is showing the
previous spacing until it finishes."* Silence would be a lie about the scene, because
the old spacing is still rendering.

Belt as well as braces: the worker reports its own elapsed time, **and** the host holds
a timer, because a worker blocked on spawn or killed by the browser reports nothing at
all — and that silence is exactly what the rule is against.

## Consequences

- **The plan's "probe harness" pending decision is answered** for the committed probe.
  `plans/2026-07-31-v0.2.0-cycle.md` said Phase 0's density value was blocked on where
  a 47k-node fixture lives; it is no longer blocked — the fixture is generated.
- **B7 is narrowed, not closed.** The new sweep runs through its own vitest config, so
  it never joins `npm test`. The two old scratchpad rigs still match the default
  include and would still fail a clean checkout.
- **Phase 0's owner verification is unchanged.** The probe proposes; eyes decide. The
  size view now states the value in force in its footer, so what the eye is judging is
  named on screen instead of buried in a constant.
- 249 tests green (212 before), typecheck clean. **The served bundle was deliberately
  not rebuilt** — B1's visual pass is in flight, and rebuilding mid-verification is the
  moved-target failure Phase 0 exists to avoid. Nothing in the served bundle changes
  until someone runs the build.

## Where it lives

| Path | What |
|---|---|
| `graph-ui/src/lib/sizeMapSphereProbe.ts` | measurement, seeded corpus, calibration band, recommendation |
| `graph-ui/src/lib/sizeMapSphereProbe.test.ts` | 23 tests — slicing-equals-flat, the parity filter, and the fixture's spread and depth pinned to the real corpora |
| `graph-ui/src/workers/sizeMapSphereProbe.worker.ts` | the thread; supersedes rather than queues |
| `graph-ui/src/hooks/useSizeMapSphereProbe.ts` | the delegated action, the 2 s notice, apply-or-don't |
| `graph-ui/src/hooks/useSizeMapSphereProbe.test.ts` | 14 tests against a stand-in worker |
| `graph-ui/scripts/sizeMapSphereProbe.sweep.ts` | headless runner — `npm run probe:spheres` |
| `graph-ui/scripts/vitest.sphereProbe.config.ts` | its own config, so it stays out of `npm test` |
| `graph-ui/scratchpad/sphere-probe/` | output only: `report.txt`, `report.json`, gitignored |
