/* Headless sweep — the size-map spacing dial, measured.
 *
 *   cd graph-ui && npm run probe:spheres
 *
 * Prints the trade curve for every projection at every notch and names the value it
 * recommends, against the band measured off the *approved* relationship graph. The
 * report lands in `scratchpad/sphere-probe/report.txt` because vitest 4 swallows
 * `console.log` under `run` — the file is the output, not a side effect.
 *
 * Deliberately not a `.test.ts`: it takes tens of seconds on a real corpus and must
 * never join `npm test`. It runs through its own vitest config, which is the only
 * TypeScript runner this package has — the wrapping `it()` is that config's entry
 * point and nothing more. It asserts one thing only: that the sweep produced
 * measurements at all. What the numbers *mean* is a judgment for the report's reader,
 * and a probe that fails a build on a density figure would be the invented-metric
 * mistake all over again.
 *
 * Corpus: seeded and synthetic by default, so any machine reproduces any figure this
 * ever printed. Point it at the territory with
 *
 *   SPHERE_PROBE_CORPUS=/path/to/file-sizes.json npm run probe:spheres
 *
 * where the file is a `/api/file-sizes` response — synthetic data calibrates the
 * dial, it does not replace the corpus the owner actually looks at.
 *
 * **Kept thin on purpose: `tsconfig.json` includes `src` only, so nothing here is
 * typechecked by `tsc -b`** (typing `node:fs` and `process` would mean adding
 * `@types/node` to a fork that has to stay cheap to merge). Everything but file I/O
 * and environment reading belongs in `src/lib/sizeMapSphereProbe.ts`, which is both
 * typechecked and unit-tested. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  DEFAULT_SLICE_MS,
  formatSphereProbeReport,
  runSphereProbe,
  syntheticSizeCorpus,
  type FileSize,
} from "../src/lib/sizeMapSphereProbe";

/* Vite rewrites `import.meta.url` to a served path, so a URL relative to it resolves
 * against the wrong root on Windows. Resolve from the module's own directory. */
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "scratchpad", "sphere-probe");

function corpus(): { name: string; files: FileSize[] } {
  const path = process.env.SPHERE_PROBE_CORPUS;
  if (!path) {
    const fileCount = Number(process.env.SPHERE_PROBE_FILES ?? 47_000);
    const seed = Number(process.env.SPHERE_PROBE_SEED ?? 0x5121);
    return {
      name: `synthetic-${fileCount}-seed-${seed}`,
      files: syntheticSizeCorpus({ fileCount, seed }),
    };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { files?: FileSize[] };
  if (!parsed.files?.length) throw new Error(`no files in ${path}`);
  return { name: path, files: parsed.files };
}

it("sweeps the spacing dial", async () => {
  const { name, files } = corpus();
  const report = await runSphereProbe(
    { name, files },
    /* Node has the thread to itself, so the slice is large — the chunking exists for
     * the browser. Kept above zero anyway so this run exercises the same resumable
     * path the delegated one takes. */
    { sliceMs: DEFAULT_SLICE_MS * 25 },
  );

  const lines = formatSphereProbeReport(report);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "report.txt"), `${lines.join("\n")}\n`, "utf8");
  writeFileSync(
    join(OUT_DIR, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  expect(report.measurements.length).toBeGreaterThan(0);
}, 600_000);
