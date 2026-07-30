/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SizeTab } from "./SizeTab";

/* The size map's tiles are laid out against the measured size of the frame, and
 * the frame only exists in the loaded branch — below the "select a project",
 * "walking the tree", error and empty-corpus returns. That ordering is what broke
 * it: a mount-time effect ran while the placeholder was on screen, found no
 * element, and never attached a ResizeObserver, so the box stayed 0×0 and every
 * tile was squarified into nothing. The view then showed "Nothing large enough to
 * draw here" over a perfectly good payload.
 *
 * These tests pin the measurement, not the pixels. jsdom reports 0 for every
 * layout box, so clientWidth/clientHeight are stubbed to give the frame a real
 * size; what is being asserted is that the component reads the frame at all once
 * it is on screen. */

const FILES = [
  { path: "src/big.ts", bytes: 400_000 },
  { path: "src/small.ts", bytes: 120_000 },
  { path: "docs/readme.md", bytes: 60_000 },
];

function mockSizesFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/file-sizes")) {
      return new Response(
        JSON.stringify({
          files: FILES,
          total_bytes: 580_000,
          file_count: FILES.length,
          source: "disk",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.startsWith("/api/ui-config")) {
      return new Response(JSON.stringify({ lang: "en" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/* Give every element a non-zero box. Restored by the returned undo. */
function stubLayoutBox(w: number, h: number) {
  const proto = window.HTMLElement.prototype;
  const width = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  const height = Object.getOwnPropertyDescriptor(proto, "clientHeight");
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => w });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => h });
  return () => {
    if (width) Object.defineProperty(proto, "clientWidth", width);
    else delete (proto as unknown as Record<string, unknown>).clientWidth;
    if (height) Object.defineProperty(proto, "clientHeight", height);
    else delete (proto as unknown as Record<string, unknown>).clientHeight;
  };
}

describe("SizeTab tile geometry", () => {
  let restoreBox: () => void;

  beforeEach(() => {
    restoreBox = stubLayoutBox(800, 600);
  });

  afterEach(() => {
    restoreBox();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("measures the frame that appears after loading, so tiles are drawn", async () => {
    /* No ResizeObserver at all: the first measurement has to come from the ref
     * callback itself, not from the observer's initial notification. */
    vi.stubGlobal("ResizeObserver", undefined);
    mockSizesFetch();
    render(<SizeTab project="demo" />);

    await waitFor(() =>
      expect(screen.getByLabelText(/^src,/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Nothing large enough to draw here/),
    ).not.toBeInTheDocument();
  });

  it("opens a detail panel when a file tile is clicked", async () => {
    /* A file tile used to absorb the click and do nothing, which left the area of a
     * rectangle as the only way to find out how big the file was. */
    vi.stubGlobal("ResizeObserver", undefined);
    mockSizesFetch();
    render(<SizeTab project="demo" />);

    const tile = await screen.findByLabelText(/^src,/);
    fireEvent.click(tile); /* folder: drills in */
    const leaf = await screen.findByLabelText(/^src\/big\.ts,/);
    fireEvent.click(leaf);

    expect(await screen.findByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Depth")).toBeInTheDocument();
    /* The kind comes from the extension and rides in the header pill, matching how
     * the graph tab's panel shows a node label. Two matches, not one: the left
     * panel's classifier chip names the same kind. The byte figure is spelled out
     * rather than left to be inferred from an area. */
    expect(screen.getAllByText("code").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("391 KB").length).toBeGreaterThan(0);
    /* And it closes. */
    fireEvent.click(screen.getByLabelText("Close the detail panel"));
    expect(screen.queryByText("Depth")).not.toBeInTheDocument();
  });

  it("muting a kind changes the tiles, not only the 3D scene", async () => {
    /* The first version filtered the emitted graph nodes, so the chips did nothing
     * at all to the treemap and a folder's bytes still counted files that were no
     * longer drawn. Filtering the file list instead makes every surface agree. */
    vi.stubGlobal("ResizeObserver", undefined);
    mockSizesFetch();
    render(<SizeTab project="demo" />);

    /* docs/ holds only a .md, so muting documents must remove that tile entirely. */
    expect(await screen.findByLabelText(/^docs,/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Hide document —/));
    expect(screen.queryByLabelText(/^docs,/)).not.toBeInTheDocument();
    /* The chip survives being switched off, or there would be no way back. */
    fireEvent.click(screen.getByTitle(/Show document —/));
    expect(await screen.findByLabelText(/^docs,/)).toBeInTheDocument();
  });

  it("observes the frame for later resizes", async () => {
    const observed: Element[] = [];
    class FakeResizeObserver {
      constructor(public cb: () => void) {}
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mockSizesFetch();
    render(<SizeTab project="demo" />);

    await waitFor(() =>
      expect(screen.getByLabelText(/^src,/)).toBeInTheDocument(),
    );
    /* The observed element is the tile frame, which only exists post-load. */
    expect(observed).toHaveLength(1);
  });
});
