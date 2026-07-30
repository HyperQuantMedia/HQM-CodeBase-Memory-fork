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
vi.mock("./GraphScene", () => ({
  GraphScene: (props: Record<string, unknown>) => {
    sceneProps.push(props);
    return null;
  },
  computeCameraTarget: () => null,
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
    expect(screen.getByLabelText(/Edge brightness/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Colors" }));
    /* One colour row per label present in the graph. */
    expect(screen.getByLabelText("Function color")).toBeInTheDocument();
    expect(screen.getByLabelText("Document color")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Animation" }));
    expect(screen.getByLabelText("Path light color")).toBeInTheDocument();
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
