/* @vitest-environment jsdom */
/* Cover for the ported missed-coverage callout, and for the two things that were
 * deliberately removed from it.
 *
 * Both removals are asserted as absences with a canary, because this component
 * arrived by merge and the next merge will offer them back. An absence nobody checks
 * is an absence that returns quietly. */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissedCallout } from "./MissedCallout";
import type { GraphNode } from "../lib/types";

const NODE: GraphNode = {
  id: 7,
  x: 0,
  y: 0,
  z: 0,
  label: "File",
  name: "parser.c",
  file_path: "src/parser/parser.c",
  size: 4,
  color: "#e9eef5",
};

let clipboardText: string | null = null;

beforeEach(() => {
  clipboardText = null;
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        clipboardText = text;
      }),
    },
  });
  /* Any fetch at all would be a regression: the removed version called
   * /api/ui-config to learn where to send the user. */
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("MissedCallout must not fetch");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MissedCallout", () => {
  it("names the file and what happened to it", () => {
    render(<MissedCallout node={NODE} project="p" onClose={() => {}} />);
    expect(screen.getByText("src/parser/parser.c")).toBeInTheDocument();
    /* "parsed", not "indexed" — the file IS indexed, and the size view counts its
     * bytes in the indexed total. See the three states on `MissedGraph`. */
    /* Twice over — the heading and the sentence below it — so match all. */
    expect(screen.getAllByText(/not fully parsed/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/not fully indexed/i)).not.toBeInTheDocument();
  });

  /* 1.3 of the cycle: no end-user surface routes a user into anyone's issue
   * tracker. Canary first, so the absences cannot pass on an empty render. */
  it("offers no outbound link", () => {
    const { container } = render(
      <MissedCallout node={NODE} project="p" onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /copy diagnosis prompt/i })).toBeInTheDocument();
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
    expect(container.innerHTML).not.toMatch(/github/i);
    expect(container.innerHTML).not.toMatch(/DeusData|codebase-memory-mcp/i);
  });

  it("does not call the backend for a config it no longer needs", () => {
    render(<MissedCallout node={NODE} project="p" onClose={() => {}} />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("copies a prompt that diagnoses locally and reports nowhere", async () => {
    render(<MissedCallout node={NODE} project="p" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /copy diagnosis prompt/i }));

    await waitFor(() => expect(clipboardText).not.toBeNull());
    expect(clipboardText).toContain("src/parser/parser.c");
    expect(clipboardText).toContain("index_status");
    /* The removed version's prompt told the user's agent to go and file an issue —
     * with, potentially, a snippet of the user's own unindexable code. */
    expect(clipboardText).not.toMatch(/file (a )?(github )?issue/i);
    expect(clipboardText).not.toMatch(/https?:\/\//);
  });

  it("says so when the clipboard refuses, instead of claiming success", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    render(<MissedCallout node={NODE} project="p" onClose={() => {}} />);
    const button = screen.getByRole("button", { name: /copy diagnosis prompt/i });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /copy diagnosis prompt/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/copied/i)).not.toBeInTheDocument();
  });

  it("closes", () => {
    const onClose = vi.fn();
    render(<MissedCallout node={NODE} project="p" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
