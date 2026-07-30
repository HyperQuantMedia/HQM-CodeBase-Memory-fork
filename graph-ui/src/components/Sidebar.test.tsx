/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { GraphNode } from "../lib/types";

function node(id: number, name: string, path: string): GraphNode {
  return {
    id,
    x: 0,
    y: 0,
    z: 0,
    label: "File",
    name,
    file_path: path,
    size: 6,
    color: "#3b82f6",
  };
}

/* "parser" appears as a folder name AND inside a file name, so the two scope chips
 * have something to actually separate. */
const NODES: GraphNode[] = [
  node(1, "parse.ts", "src/parser/parse.ts"),
  node(2, "tokens.ts", "src/parser/tokens.ts"),
  node(3, "parser-notes.md", "docs/parser-notes.md"),
  node(4, "index.ts", "src/index.ts"),
];

function renderSidebar() {
  return render(
    <Sidebar nodes={NODES} onSelectPath={() => {}} selectedPath={null} project="demo" />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("Sidebar search scope", () => {
  it("returns both folders and files by default", () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "parser" },
    });
    /* The folder src/parser and the file docs/parser-notes.md both match. */
    expect(screen.getByText("src/parser")).toBeInTheDocument();
    expect(screen.getByText("parser-notes.md")).toBeInTheDocument();
  });

  it("narrows to folders only", () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "parser" },
    });
    fireEvent.click(screen.getByTitle("Search folders only"));
    expect(screen.getByText("src/parser")).toBeInTheDocument();
    expect(screen.queryByText("parser-notes.md")).not.toBeInTheDocument();
  });

  it("narrows to files only", () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "parser" },
    });
    fireEvent.click(screen.getByTitle("Search files only"));
    expect(screen.getByText("parser-notes.md")).toBeInTheDocument();
    expect(screen.queryByText("src/parser")).not.toBeInTheDocument();
  });

  it("releases the scope when the active chip is pressed again", () => {
    /* The two are exclusive, so without this there is no way back to both. */
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "parser" },
    });
    fireEvent.click(screen.getByTitle("Search folders only"));
    fireEvent.click(screen.getByTitle(/Search folders only — click to search both/));
    expect(screen.getByText("parser-notes.md")).toBeInTheDocument();
    expect(screen.getByText("src/parser")).toBeInTheDocument();
  });

  it("says nothing matched rather than showing an empty list", () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "zzz-nothing" },
    });
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });
});

describe("Sidebar folder order", () => {
  it("sorts top-level folders by name when the name button is pressed", () => {
    renderSidebar();
    fireEvent.click(screen.getByTitle(/Sort folders by name, A to Z/));
    const rows = screen.getAllByText(/^(docs|src)$/).map((el) => el.textContent);
    expect(rows).toEqual(["docs", "src"]);
  });

  it("reverses on a second press of the active key", () => {
    renderSidebar();
    fireEvent.click(screen.getByTitle(/Sort folders by name, A to Z/));
    fireEvent.click(screen.getByTitle(/Sort folders by name, Z to A/));
    const rows = screen.getAllByText(/^(docs|src)$/).map((el) => el.textContent);
    expect(rows).toEqual(["src", "docs"]);
  });
});
