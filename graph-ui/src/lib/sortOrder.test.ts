import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  nextSort,
  sortActionLabel,
  sortByOrder,
  type SortOrder,
} from "./sortOrder";

const ENTRIES: [string, number][] = [
  ["Function", 40],
  ["class", 40],
  ["Module", 7],
  ["alpha", 120],
];

const names = (out: [string, number][]) => out.map((e) => e[0]);
const by = (order: SortOrder) => names(sortByOrder(ENTRIES, (e) => e[0], (e) => e[1], order));

describe("nextSort", () => {
  it("flips direction when the active key is clicked again", () => {
    expect(nextSort({ key: "count", dir: "desc" }, "count")).toEqual({
      key: "count",
      dir: "asc",
    });
  });

  it("switches key at that key's own natural direction", () => {
    /* Inheriting "desc" from the count sort would land on Z–A, which is not what
     * clicking an A–Z button means. */
    expect(nextSort({ key: "count", dir: "desc" }, "name")).toEqual({
      key: "name",
      dir: "asc",
    });
    expect(nextSort({ key: "name", dir: "asc" }, "count")).toEqual({
      key: "count",
      dir: "desc",
    });
  });
});

describe("sortByOrder", () => {
  it("sorts by name in both directions, case-insensitively", () => {
    expect(by({ key: "name", dir: "asc" })).toEqual([
      "alpha",
      "class",
      "Function",
      "Module",
    ]);
    expect(by({ key: "name", dir: "desc" })).toEqual([
      "Module",
      "Function",
      "class",
      "alpha",
    ]);
  });

  it("sorts by count in both directions", () => {
    /* Function and class tie at 40 and break alphabetically, which is why they
     * keep the same relative order in both directions. */
    expect(by({ key: "count", dir: "desc" })).toEqual([
      "alpha",
      "class",
      "Function",
      "Module",
    ]);
    expect(by({ key: "count", dir: "asc" })).toEqual([
      "Module",
      "class",
      "Function",
      "alpha",
    ]);
  });

  it("breaks count ties alphabetically in both directions", () => {
    /* Function and class both have 40. Without a tie-break they would come out in
     * whatever order the Map yielded, so flipping the direction would shuffle
     * equal-count entries rather than reverse them. */
    const asc = by({ key: "count", dir: "asc" });
    const desc = by({ key: "count", dir: "desc" });
    expect(asc.indexOf("class")).toBeLessThan(asc.indexOf("Function"));
    expect(desc.indexOf("class")).toBeLessThan(desc.indexOf("Function"));
  });

  it("does not mutate its input", () => {
    const before = names(ENTRIES);
    by({ key: "name", dir: "desc" });
    expect(names(ENTRIES)).toEqual(before);
  });

  it("defaults to the order these lists already had", () => {
    expect(DEFAULT_SORT).toEqual({ key: "count", dir: "desc" });
  });
});

describe("sortActionLabel", () => {
  it("describes what the click will do, not the current state", () => {
    expect(sortActionLabel("node types", "name", { key: "count", dir: "desc" })).toBe(
      "Sort node types by name, A to Z",
    );
    expect(sortActionLabel("node types", "name", { key: "name", dir: "asc" })).toBe(
      "Sort node types by name, Z to A",
    );
    expect(sortActionLabel("folders", "count", { key: "count", dir: "desc" })).toBe(
      "Sort folders by count, fewest first",
    );
  });
});
