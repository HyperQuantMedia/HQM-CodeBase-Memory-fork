/* @vitest-environment jsdom */
/* The partly-parsed section of the filter panel, ported from upstream.
 *
 * Its wording is a contract, not copy. Upstream called these files "not fully
 * indexed", which is the size view's territory — those files ARE in the index and
 * their bytes are in the size view's indexed total, so borrowing the word had the two
 * views contradicting each other about one corpus. The three states are named on
 * `MissedGraph` in lib/types.ts; this pins the words for the surface that broke. */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterPanel } from "./FilterPanel";
import type { GraphData } from "../lib/types";

const DATA: GraphData = {
  nodes: [
    { id: 1, x: 0, y: 0, z: 0, label: "File", name: "a.ts", file_path: "a.ts", size: 3, color: "#3b82f6" },
    { id: 2, x: 1, y: 0, z: 0, label: "Function", name: "run", file_path: "a.ts", size: 2, color: "#06b6d4" },
  ],
  edges: [{ source: 1, target: 2, type: "DEFINES" }],
  total_nodes: 2,
};

function renderPanel(over: Partial<Parameters<typeof FilterPanel>[0]> = {}) {
  const props = {
    data: DATA,
    enabledLabels: new Set(["File", "Function"]),
    enabledEdgeTypes: new Set(["DEFINES"]),
    showLabels: false,
    onToggleLabel: vi.fn(),
    onToggleEdgeType: vi.fn(),
    onToggleShowLabels: vi.fn(),
    onEnableAll: vi.fn(),
    onDisableAll: vi.fn(),
    deadCodeView: false,
    showOnlyDead: false,
    hideEntryPoints: false,
    hideTests: false,
    onToggleDeadCodeView: vi.fn(),
    onToggleShowOnlyDead: vi.fn(),
    onToggleHideEntryPoints: vi.fn(),
    onToggleHideTests: vi.fn(),
    hideUnlinked: false,
    unlinkedCount: 0,
    onToggleHideUnlinked: vi.fn(),
    missedView: true,
    missedCount: 4,
    onToggleMissedView: vi.fn(),
    ...over,
  };
  return { props, ...render(<FilterPanel {...props} />) };
}

describe("FilterPanel — partly-parsed section", () => {
  it("says parsed, never indexed", () => {
    const { container } = renderPanel();
    expect(screen.getByText(/partly parsed/i)).toBeInTheDocument();
    /* The exact phrase that caused the contradiction. */
    expect(container.innerHTML).not.toMatch(/not fully indexed/i);
    expect(container.innerHTML).not.toMatch(/fully indexed/i);
  });

  it("states the count and lets it be toggled", () => {
    const { props } = renderPanel();
    expect(screen.getByText("4 files")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/show partly-parsed files/i));
    expect(props.onToggleMissedView).toHaveBeenCalledTimes(1);
  });

  /* Best-effort means best-effort: an empty result is "nothing known", not "nothing".
   * The distinction is the whole reason coverage is a signal and not a guarantee. */
  it("claims no completeness when there is nothing to show", () => {
    renderPanel({ missedCount: 0 });
    expect(screen.getByText(/not a completeness guarantee/i)).toBeInTheDocument();
  });

  /* The count is files only. The skeleton also carries the directory nodes that hold
   * it together, and counting those would overstate what the parser missed. */
  it("shows the caller's count verbatim", () => {
    renderPanel({ missedCount: 1, missedView: false });
    expect(screen.getByText("1 files")).toBeInTheDocument();
  });

  it("uses ink roles rather than opacity modifiers", () => {
    /* `text-foreground/30` compiles to a real alpha and can never be theme-aware, so
     * the ported markup was unreadable on the light stage.
     *
     * Scoped to this section deliberately. The panel's relationship chips still carry
     * a `text-foreground/60` from before either of these passes — a real instance of
     * the same problem, and Phase 3's sweep, not this merge's. Asserting over the
     * whole panel would make this test fail for someone else's line. */
    renderPanel();
    const section = screen.getByText(/partly parsed/i).closest("div.px-4");
    expect(section).not.toBeNull();
    expect(section!.innerHTML).not.toMatch(/text-foreground\/\d/);
    expect(section!.innerHTML).toMatch(/text-ink-/);
  });
});
