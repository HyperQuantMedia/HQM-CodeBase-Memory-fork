/* @vitest-environment jsdom */
/* Integration cover for the features ported from the static map: panel
 * collapse, breadcrumb, settings tabs, help, and open-on-disk. The 3D scene is
 * stubbed (jsdom has no WebGL), so these assert the wiring around it — that
 * state reaches the right component and the right request leaves the app. */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphTab } from "./GraphTab";
import type { GraphData } from "../lib/types";

/* Capture what GraphScene is handed instead of rendering it. */
const sceneProps: Record<string, unknown>[] = [];
/* Every computeCameraTarget call, so a fly-to that never happened is
 * distinguishable from one that did. The stub returns a marker derived from the
 * ids rather than null — returning null made a previous version of the breadcrumb
 * test unable to fail for the right reason. */
const cameraCalls: { count: number; ids: number[] }[] = [];
vi.mock("./GraphScene", () => ({
  GraphScene: (props: Record<string, unknown>) => {
    sceneProps.push(props);
    return null;
  },
  computeCameraTarget: (nodes: { id: number }[], ids: Set<number>) => {
    const list = [...ids].sort((a, b) => a - b);
    cameraCalls.push({ count: nodes.length, ids: list });
    return list.length ? { marker: list.join(",") } : null;
  },
}));

/* A small containment-shaped graph: folder → file → two functions. */
const SAMPLE: GraphData = {
  nodes: [
    { id: 1, x: 0, y: 0, z: 0, label: "Folder", name: "src", file_path: "src", size: 4, color: "#22c55e" },
    { id: 2, x: 10, y: 0, z: 0, label: "File", name: "app.ts", file_path: "src/app.ts", size: 3, color: "#3b82f6" },
    { id: 3, x: 20, y: 5, z: 0, label: "Function", name: "boot", file_path: "src/app.ts", size: 2, color: "#06b6d4", status: "normal" },
    { id: 4, x: 30, y: 9, z: 0, label: "Document", name: "notes.pdf", file_path: "docs/notes.pdf", size: 2, color: "#fbbf24" },
  ],
  edges: [
    { source: 1, target: 2, type: "CONTAINS_FILE" },
    { source: 2, target: 3, type: "DEFINES" },
  ],
  total_nodes: 4,
};

function mockFetch(onOpen?: (body: unknown) => void) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/layout")) {
      return new Response(JSON.stringify(SAMPLE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "/api/open") {
      onOpen?.(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ opened: true }), { status: 200 });
    }
    if (url.startsWith("/api/repo-info")) {
      return new Response(JSON.stringify({ root_path: "/repo", branch: "main", remote_url: "", web_base: "", blob_base: "" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/* The last props GraphScene received. */
function lastScene() {
  return sceneProps[sceneProps.length - 1];
}

beforeEach(() => {
  sceneProps.length = 0;
  cameraCalls.length = 0;
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collapsible sidebar panels", () => {
  it("folds Filters away and back, and remembers the choice", async () => {
    mockFetch();
    const { unmount } = render(<GraphTab project="demo" />);
    expect(await screen.findByText("Filters")).toBeInTheDocument();
    /* Filter chips are visible while expanded. */
    expect(screen.getByText("Node types")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.queryByText("Node types")).not.toBeInTheDocument();
    /* The header itself stays, so the panel can be reopened. */
    expect(screen.getByText("Filters")).toBeInTheDocument();

    /* Persisted: a fresh mount comes back collapsed. */
    unmount();
    sceneProps.length = 0;
    render(<GraphTab project="demo" />);
    expect(await screen.findByText("Filters")).toBeInTheDocument();
    expect(screen.queryByText("Node types")).not.toBeInTheDocument();
  });

  it("folds Folders independently of Filters", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    expect(await screen.findByText("Folders")).toBeInTheDocument();
    /* The folder tree's search box is present while expanded. */
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Folders/ }));
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    /* Filters untouched. */
    expect(screen.getByText("Node types")).toBeInTheDocument();
  });

  it("lets the open section fill the column when its neighbour folds away", async () => {
    /* The section was handed the height and then wasted it: CollapsibleSection
     * rendered its body as a bare flex child, so the content sized to itself and
     * the rest of the box stayed empty — indistinguishable from never having been
     * given the space. */
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    fireEvent.click(screen.getByRole("button", { name: /Folders/ }));
    const filters = screen
      .getByRole("button", { name: /Filters/ })
      .closest("[data-collapsible]")!;
    expect(filters.className).toContain("flex-1");
    /* The body wrapper has to grow too, not merely exist. */
    const body = filters.querySelector(".flex-1.min-h-0");
    expect(body).not.toBeNull();
  });

  it("docks both collapsed sections on the left rail (C7 round 3)", async () => {
    mockFetch();
    const { container } = render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    fireEvent.click(screen.getByRole("button", { name: /Folders/ }));
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    /* C7's ruling chain, all three the owner's calls in order: 2026-07-30
     * anchored a collapsed Folders to the floor (mt-auto); round 1 of the
     * v0.2.0 sweep gathered collapsed strips at the top; round 3 (2026-08-01)
     * moved a collapsed section OFF the column onto a slim rail — each
     * individually, and the wide column exists only while something is open.
     * If this is ever flipped again, check whose call it was first. */
    expect(container.querySelector('[data-rail-tab="Folders"]')).toBeTruthy();
    expect(container.querySelector('[data-rail-tab="Filters"]')).toBeTruthy();
    expect(container.querySelector("[data-collapsible]")).toBeNull();
  });

  it("reopens a section from its rail tab (C7 round 3)", async () => {
    mockFetch();
    const { container } = render(<GraphTab project="demo" />);
    const header = await screen.findByRole("button", { name: /Folders/ });
    fireEvent.click(header);
    /* Collapsed = unmounted from the column, docked on the rail. */
    expect(container.querySelector('[data-collapsible][data-collapsible="open"]')).toBeTruthy();
    const tab = container.querySelector('[data-rail-tab="Folders"]')!;
    expect(tab).toBeTruthy();

    fireEvent.click(tab);
    expect(container.querySelector('[data-rail-tab="Folders"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Folders/ })).toBeTruthy();
  });
});

describe("unlinked-node filter", () => {
  it("drops nodes whose only relationship was switched off", async () => {
    /* The complaint this answers: turning a relationship off removed the links and
     * left the nodes. On the sample corpus that stranded 2,803 External nodes, all
     * of them reachable only by EXTERNAL_LINK, so the filter did exactly what it
     * said and the graph did not get smaller. */
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    const before = (lastScene().data as GraphData).nodes.length;
    expect(before).toBe(4);

    /* notes.pdf has no edges at all in the sample, so it is the unlinked one. */
    fireEvent.click(screen.getByRole("button", { name: /Hide unlinked nodes/ }));
    await waitFor(() => {
      const nodes = (lastScene().data as GraphData).nodes;
      expect(nodes.map((n) => n.id).sort()).toEqual([1, 2, 3]);
    });
  });

  it("strands nothing when a relationship is switched off with the filter on", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    fireEvent.click(screen.getByRole("button", { name: /Hide unlinked nodes/ }));

    /* DEFINES is the only thing attaching "boot" to the file. */
    fireEvent.click(screen.getByRole("button", { name: /defines/ }));
    await waitFor(() => {
      const nodes = (lastScene().data as GraphData).nodes;
      expect(nodes.map((n) => n.id).sort()).toEqual([1, 2]);
    });
  });

  it("shows how many nodes it would remove before it is switched on", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    const toggle = screen.getByRole("button", { name: /Hide unlinked nodes/ });
    /* One unlinked node in the sample — the count makes the trade visible. */
    expect(toggle.textContent).toContain("1");
  });
});

describe("per-theme appearance", () => {
  it("stores appearance under one key split by theme, and resets only that theme", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Display" }));
    fireEvent.change(screen.getByLabelText(/Node size/), { target: { value: "2.5" } });

    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem("cbm-appearance")!);
      expect(raw.dark.nodeScale).toBe(2.5);
      /* The other theme is untouched — that is the point of the split. */
      expect(raw.light.nodeScale).toBe(1.45);
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem("cbm-appearance")!);
      expect(raw.dark.nodeScale).toBe(1);
    });
  });

  it("hands the scene the active theme's values", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    /* jsdom reports no light preference, so the dark bucket is active. */
    expect(lastScene().stage).toBe("dark");
    expect((lastScene().display as { nodeScale: number }).nodeScale).toBe(1);
  });
});

describe("view modes", () => {
  it("reprojects node positions when a projection is chosen", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    const before = (lastScene().data as GraphData).nodes.map((n) => `${n.x},${n.y},${n.z}`);

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.change(screen.getByLabelText("Projection"), { target: { value: "sphere" } });

    await waitFor(() => {
      const after = (lastScene().data as GraphData).nodes.map((n) => `${n.x},${n.y},${n.z}`);
      expect(after).not.toEqual(before);
    });
    /* Node identity and count survive the reprojection. */
    const after = lastScene().data as GraphData;
    expect(after.nodes.map((n) => n.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("keeps the server layout in default mode", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    const nodes = (lastScene().data as GraphData).nodes;
    const original = SAMPLE.nodes.find((n) => n.id === 2)!;
    const shown = nodes.find((n) => n.id === 2)!;
    expect([shown.x, shown.y, shown.z]).toEqual([original.x, original.y, original.z]);
  });

  it("passes the camera FOV through to the scene", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    expect(lastScene().fov).toBe(50);

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.change(screen.getByLabelText(/Perspective/), { target: { value: "80" } });
    await waitFor(() => expect(lastScene().fov).toBe(80));
  });
});

describe("breadcrumb", () => {
  it("appears on selection with the ancestor chain, and clears with Escape", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    expect(screen.queryByLabelText("Selection path")).not.toBeInTheDocument();

    /* Selecting a node is what the 3D scene would do on click. */
    const onNodeClick = lastScene().onNodeClick as (n: unknown) => void;
    fireEvent.click(screen.getByRole("button", { name: /Folders/ })); /* free some room */
    onNodeClick(SAMPLE.nodes[2]); /* the "boot" function, nested under src/app.ts */

    const nav = await screen.findByLabelText("Selection path");
    expect(nav).toBeInTheDocument();
    /* Chain runs root → file → symbol. */
    expect(nav.textContent).toContain("src");
    expect(nav.textContent).toContain("app.ts");
    expect(nav.textContent).toContain("boot");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Selection path")).not.toBeInTheDocument(),
    );
  });

  it("flies the camera to an ancestor's subtree when its segment is clicked", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    const onNodeClick = lastScene().onNodeClick as (n: unknown) => void;
    onNodeClick(SAMPLE.nodes[2]); /* "boot", nested under src/app.ts */
    await screen.findByLabelText("Selection path");
    cameraCalls.length = 0;

    fireEvent.click(screen.getByRole("button", { name: /^src$/ }));
    await waitFor(() => expect(cameraCalls.length).toBeGreaterThan(0));
    /* src's subtree is the folder, the file and both symbols under it. */
    expect(cameraCalls[cameraCalls.length - 1].ids).toEqual([1, 2, 3]);
    expect(lastScene().cameraTarget).not.toBeNull();
  });
});

describe("path light", () => {
  it("sends an ordered root→node chain to the scene, and honours the off switch", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    const onNodeClick = lastScene().onNodeClick as (n: unknown) => void;
    onNodeClick(SAMPLE.nodes[2]);
    await waitFor(() => expect(lastScene().lightPath).toEqual([1, 2, 3]));

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Animation" }));
    fireEvent.click(screen.getByRole("button", { name: /Path light on selection/ }));
    await waitFor(() => expect(lastScene().lightPath).toBeUndefined());
  });
});

describe("settings tabs", () => {
  it("switches between the four tabs", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

    expect(screen.getByLabelText("Projection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Display" }));
    /* jsdom reports no light preference, so the dark stage's wording applies. */
    expect(screen.getByLabelText(/Link brightness/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Node size/)).toBeInTheDocument();
    /* Appearance is stored per theme, and the panel says which one it is editing. */
    expect(screen.getByText("Dark theme")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset to defaults" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Colors" }));
    /* One colour row per label present in the graph. */
    expect(screen.getByLabelText("Function color")).toBeInTheDocument();
    expect(screen.getByLabelText("Document color")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Animation" }));
    expect(screen.getByLabelText("Light color")).toBeInTheDocument();
  });

  it("offers colour presets once the light is set to a fixed colour", () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    return screen.findByText("Filters").then(() => {
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(screen.getByRole("tab", { name: "Animation" }));

      /* Default is "follow the strand", where a fixed colour would be ignored —
       * so the picker and its presets stay hidden until the mode calls for one. */
      expect(screen.queryByLabelText("Path light color")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Light color"), {
        target: { value: "custom" },
      });
      expect(screen.getByLabelText("Path light color")).toBeInTheDocument();
      expect(screen.getByLabelText("North star")).toBeInTheDocument();
      expect(screen.getByLabelText("Emerald")).toBeInTheDocument();
    });
  });

  it("keeps per-level acceleration off unless asked", () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    return screen.findByText("Filters").then(() => {
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(screen.getByRole("tab", { name: "Animation" }));
      const toggle = screen.getByRole("button", { name: /Accelerate per level/ });
      /* CheckRow marks its checked state with the primary colour. */
      expect(toggle.className).toContain("text-ink-soft");
    });
  });
});

describe("help modal", () => {
  it("opens from the toolbar and closes on Escape", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Filters");

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(await screen.findByRole("dialog", { name: /How the graph works/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /How the graph works/ })).not.toBeInTheDocument(),
    );
  });
});

describe("open on disk", () => {
  it("posts the project-relative path and kind to /api/open", async () => {
    const opened: unknown[] = [];
    mockFetch((body) => opened.push(body));
    render(<GraphTab project="demo" />);
    await screen.findByText("Folders");

    /* Search surfaces a flat result list whose rows carry the open buttons. */
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "notes" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Open file" }));

    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual({
      project: "demo",
      path: "docs/notes.pdf",
      kind: "file",
    });
  });
});

describe("kind: search", () => {
  it("filters the folder panel by file kind, not by path text", async () => {
    mockFetch();
    render(<GraphTab project="demo" />);
    await screen.findByText("Folders");
    const box = screen.getByPlaceholderText(/search/i);

    fireEvent.change(box, { target: { value: "kind:document" } });
    expect(await screen.findByText("notes.pdf")).toBeInTheDocument();
    expect(screen.queryByText("boot")).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: "kind:code" } });
    await waitFor(() => expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument());
    expect(screen.getByText("boot")).toBeInTheDocument();
  });
});
