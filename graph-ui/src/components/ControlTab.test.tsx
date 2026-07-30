/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlTab, logLevel } from "./ControlTab";

const LOGS = [
  "t=1 level=error msg=\"index failed\" project=demo",
  "t=2 level=warn msg=\"slow walk\" project=demo",
  "t=3 level=info msg=\"indexed 40 files\" project=demo",
  "t=4 level=info msg=\"served /api/layout\"",
  "  continuation line with no level at all",
];

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/logs")) {
        return new Response(JSON.stringify({ lines: LOGS }), { status: 200 });
      }
      if (url.startsWith("/api/processes")) {
        return new Response(
          JSON.stringify({ processes: [], self_rss_mb: 12, self_user_cpu_s: 1 }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("logLevel", () => {
  it("reads the logfmt level key", () => {
    expect(logLevel("t=1 level=error msg=x")).toBe("error");
    expect(logLevel("level=WARN msg=x")).toBe("warn");
  });

  it("does not match a level-like substring of another key", () => {
    /* `sublevel=` shares the letters but is a different key. */
    expect(logLevel("sublevel=error msg=x")).toBe("other");
  });

  it("reports a line with no level as other rather than guessing", () => {
    /* Continuation lines of a multi-line message carry no level. Dropping them
     * would silently hide the body of every stack trace. */
    expect(logLevel("    at frobnicate (main.c:12)")).toBe("other");
  });
});

describe("log filters", () => {
  it("offers a chip per level actually present, with counts", async () => {
    mockFetch();
    render(<ControlTab />);
    await screen.findByTitle(/Hide error lines/);
    expect(screen.getByTitle(/Hide warn lines/)).toBeInTheDocument();
    expect(screen.getByTitle(/Hide info lines/)).toBeInTheDocument();
    expect(screen.getByTitle(/Hide other lines/)).toBeInTheDocument();
    /* No chip for a level the buffer does not contain — a control that does
     * nothing. */
    expect(screen.queryByTitle(/Hide debug lines/)).not.toBeInTheDocument();
  });

  it("mutes a level, and restores it on a second click", async () => {
    mockFetch();
    render(<ControlTab />);
    const chip = await screen.findByTitle(/Hide error lines/);
    expect(screen.getByText(/index failed/)).toBeInTheDocument();

    fireEvent.click(chip);
    expect(screen.queryByText(/index failed/)).not.toBeInTheDocument();
    /* Still there, still counted — the chip says "Show" now. */
    fireEvent.click(screen.getByTitle(/Show error lines/));
    expect(screen.getByText(/index failed/)).toBeInTheDocument();
  });

  it("filters by substring, case-insensitively, and says how many are hidden", async () => {
    mockFetch();
    render(<ControlTab />);
    const box = await screen.findByLabelText("Filter log lines by substring");
    fireEvent.change(box, { target: { value: "SLOW" } });
    await waitFor(() =>
      expect(screen.getByText(/slow walk/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/index failed/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 5 lines/)).toBeInTheDocument();
  });

  it("says nothing matched rather than looking like an empty log", async () => {
    mockFetch();
    render(<ControlTab />);
    const box = await screen.findByLabelText("Filter log lines by substring");
    fireEvent.change(box, { target: { value: "zzz-no-such-thing" } });
    await waitFor(() =>
      expect(screen.getByText(/No lines match/)).toBeInTheDocument(),
    );
  });
});
