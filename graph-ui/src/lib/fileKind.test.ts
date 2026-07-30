import { describe, expect, it } from "vitest";
import { extensionOf, fileKind } from "./fileKind";

describe("extensionOf", () => {
  it("reads the extension, not the path", () => {
    expect(extensionOf("src/app/main.TSX")).toBe("tsx");
    expect(extensionOf("a.b/c.tar.gz")).toBe("gz");
  });

  it("treats a dotfile's name as its extension", () => {
    expect(extensionOf(".gitignore")).toBe("gitignore");
    expect(extensionOf("deep/dir/.npmrc")).toBe("npmrc");
  });

  it("returns empty for extensionless names", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf("dir/LICENSE")).toBe("");
  });

  it("handles Windows separators", () => {
    expect(extensionOf("C:\\pics\\holiday.JPEG")).toBe("jpeg");
  });
});

describe("fileKind", () => {
  it("classifies by extension across trades, not just code", () => {
    expect(fileKind("src/main.c")).toBe("code");
    expect(fileKind("contracts/lease.pdf")).toBe("document");
    expect(fileKind("Q3 budget.xlsx")).toBe("spreadsheet");
    expect(fileKind("pitch.pptx")).toBe("presentation");
    expect(fileKind("shoot/DSC_0001.NEF")).toBe("image");
    expect(fileKind("deposition.mp4")).toBe("video");
    expect(fileKind("interview.m4a")).toBe("audio");
    expect(fileKind("export.parquet")).toBe("data");
    expect(fileKind("backup.7z")).toBe("archive");
  });

  it("recognizes extensionless conventional names", () => {
    expect(fileKind("Makefile")).toBe("code");
    expect(fileKind("deep/Dockerfile")).toBe("code");
    expect(fileKind("LICENSE")).toBe("document");
  });

  it("lets a real extension win over a conventional base name", () => {
    expect(fileKind("readme.pdf")).toBe("document");
    expect(fileKind("makefile.py")).toBe("code");
  });

  it("falls back to other rather than guessing", () => {
    expect(fileKind("mystery.qqq")).toBe("other");
    expect(fileKind(undefined)).toBe("other");
    expect(fileKind("")).toBe("other");
  });

  it("ignores path shape entirely — only the extension counts", () => {
    /* The standing ruling: folder conventions cannot be assumed across
     * arbitrary corpora, so a "docs/" prefix must not influence the verdict. */
    expect(fileKind("docs/screenshot.png")).toBe("image");
    expect(fileKind("src/notes.pdf")).toBe("document");
  });
});
