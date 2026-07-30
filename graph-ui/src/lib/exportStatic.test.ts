import { describe, expect, it } from "vitest";
import { buildStaticPage } from "./exportStatic";
import type { GraphEdge, GraphNode } from "./types";

const NODES: GraphNode[] = [
  { id: 1, x: 0, y: 0, z: 0, label: "File", name: "a.ts", file_path: "src/a.ts", size: 4, color: "#3b82f6" },
  /* Hostile-ish names: a closing script tag and a line separator must both
   * survive serialization without breaking out of the payload block. */
  { id: 2, x: 50, y: 10, z: -5, label: "Function", name: "weird</script>x", file_path: "src/a.ts", size: 3, color: "#06b6d4" },
  { id: 3, x: -40, y: 22, z: 8, label: "Document", name: "sep\u2028here", file_path: "docs/x.md", size: 5, color: "#fbbf24" },
];
const EDGES: GraphEdge[] = [
  { source: 1, target: 2, type: "CONTAINS_FILE" },
  { source: 2, target: 3, type: "CALLS" },
  /* Dangling endpoint — must be dropped, not emitted with a bad index. */
  { source: 2, target: 999, type: "CALLS" },
];

function build() {
  return buildStaticPage({
    project: "demo",
    nodes: NODES,
    edges: EDGES,
    theme: "dark",
    labelColors: { File: "#3b82f6", Function: "#06b6d4", Document: "#fbbf24" },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
}

function payloadOf(html: string) {
  const m = html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  const raw = m![1];
  /* Nothing that would terminate the block early may appear raw. */
  expect(raw).not.toMatch(/<\/script>/i);
  expect(raw.includes("\u2028")).toBe(false);
  expect(raw.includes("\u2029")).toBe(false);
  const decoded = raw
    .replace(/\u003c/g, "<")
    .replace(/\u2028/g, "\u2028")
    .replace(/\u2029/g, "\u2029");
  return JSON.parse(decoded);
}

describe("buildStaticPage", () => {
  it("emits a self-contained page with no external references", () => {
    const html = build();
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="http/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("round-trips the graph through the embedded payload", () => {
    const data = payloadOf(build());
    expect(data.nodes).toHaveLength(3);
    expect(data.nodes[1].n).toBe("weird</script>x");
    expect(data.project).toBe("demo");
  });

  it("drops edges whose endpoints are not in the exported set", () => {
    const data = payloadOf(build());
    expect(data.edges).toHaveLength(2);
    /* Edges are re-indexed to array positions, not raw node ids. */
    expect(data.edges.every((e: [number, number, string]) => e[0] < 3 && e[1] < 3)).toBe(true);
  });

  it("bakes the theme so the file opens looking like the app did", () => {
    expect(build()).toContain('data-theme="dark"');
    const light = buildStaticPage({
      project: "demo", nodes: NODES, edges: EDGES, theme: "light",
      labelColors: {}, generatedAt: "2026-07-30T00:00:00.000Z",
    });
    expect(light).toContain('data-theme="light"');
  });

  it("escapes the project name into the title", () => {
    const html = buildStaticPage({
      project: "<b>x</b>", nodes: [], edges: [],
      theme: "dark", labelColors: {}, generatedAt: "2026-07-30T00:00:00.000Z",
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<title>Cartograph — <b>");
  });
});
