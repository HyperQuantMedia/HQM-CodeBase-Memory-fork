/// <reference types="vitest" />
/* Runner for the headless spacing sweep — see sizeMapSphereProbe.sweep.ts.
 *
 * A separate config rather than an entry in the default suite, because the sweep is
 * tens of seconds of arithmetic and belongs nowhere near `npm test`. It is also why
 * the sweep is not named `*.test.ts`: adding `scratchpad/**` or `scripts/**` to the
 * default `exclude` would not work, since `exclude` beats an explicit path filter and
 * would break the documented way of *running* it. */
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  test: {
    /* Plain node: the sweep touches no DOM, and jsdom would only slow it down. */
    environment: "node",
    globals: true,
    include: ["scripts/sizeMapSphereProbe.sweep.ts"],
    /* One long job, so vitest's default parallelism buys nothing and the per-test
     * timeout has to allow a real corpus. */
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
