import { describe, expect, it } from "vitest";
import { matchesQuery, parseQuery } from "./searchQuery";
import type { GraphNode } from "./types";

function node(over: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 1,
    x: 0,
    y: 0,
    z: 0,
    label: "Function",
    name: "loadConfig",
    file_path: "src/config/load.ts",
    size: 3,
    color: "#fff",
    ...over,
  };
}

describe("parseQuery", () => {
  it("splits field terms from plain text", () => {
    const q = parseQuery("kind:image holiday");
    expect(q.fields).toEqual([{ key: "kind", value: "image" }]);
    expect(q.text).toEqual(["holiday"]);
  });

  it("treats an unknown key as plain text", () => {
    /* A real filename can contain a colon; it must not silently filter all. */
    const q = parseQuery("weird:thing");
    expect(q.fields).toEqual([]);
    expect(q.text).toEqual(["weird:thing"]);
  });

  it("reports an empty query", () => {
    expect(parseQuery("   ").empty).toBe(true);
    expect(parseQuery("x").empty).toBe(false);
  });
});

describe("matchesQuery", () => {
  it("matches plain text against name and path", () => {
    expect(matchesQuery(node(), parseQuery("loadconfig"))).toBe(true);
    expect(matchesQuery(node(), parseQuery("config/load"))).toBe(true);
    expect(matchesQuery(node(), parseQuery("absent"))).toBe(false);
  });

  it("ANDs every term", () => {
    expect(matchesQuery(node(), parseQuery("load config"))).toBe(true);
    expect(matchesQuery(node(), parseQuery("load nope"))).toBe(false);
  });

  it("filters by kind from the extension", () => {
    expect(matchesQuery(node(), parseQuery("kind:code"))).toBe(true);
    expect(matchesQuery(node(), parseQuery("kind:image"))).toBe(false);
    expect(
      matchesQuery(node({ file_path: "shoot/a.png" }), parseQuery("kind:image")),
    ).toBe(true);
  });

  it("filters by label prefix, case-insensitively", () => {
    expect(matchesQuery(node(), parseQuery("label:func"))).toBe(true);
    expect(matchesQuery(node(), parseQuery("label:Class"))).toBe(false);
  });

  it("filters by status", () => {
    expect(matchesQuery(node({ status: "dead" }), parseQuery("status:dead"))).toBe(true);
    expect(matchesQuery(node({ status: "normal" }), parseQuery("status:dead"))).toBe(false);
    expect(matchesQuery(node(), parseQuery("status:dead"))).toBe(false);
  });

  it("combines a field term with text", () => {
    const q = parseQuery("kind:code load");
    expect(matchesQuery(node(), q)).toBe(true);
    expect(matchesQuery(node({ file_path: "a/load.png" }), q)).toBe(false);
  });
});
