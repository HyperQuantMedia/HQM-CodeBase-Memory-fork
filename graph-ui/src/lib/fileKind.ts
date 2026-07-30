/* File-kind classification by extension.
 *
 * Cartograph indexes whatever a project holds — source trees, but equally a
 * folder of PDFs, spreadsheets, photos, or recordings. Classification is keyed
 * PURELY on the file extension: folder conventions cannot be assumed across
 * arbitrary corpora (one person's `docs/` is another's `Scans 2019`), whereas
 * `.pdf` means the same thing everywhere. Path-pattern heuristics belong to
 * tools that know their corpus; this one does not.
 *
 * Used by the `kind:` search filter. Unknown extensions fall to "other"
 * rather than guessing. */

export type FileKind =
  | "code"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "video"
  | "audio"
  | "data"
  | "archive"
  | "config"
  | "other";

/* Extension → kind. Lowercase, no leading dot. Kept flat and explicit: a
 * lookup table is auditable, a regex cascade is not. */
const EXT_KIND: Record<string, FileKind> = {
  /* code */
  c: "code", h: "code", cc: "code", cpp: "code", cxx: "code", hpp: "code", hxx: "code",
  cs: "code", java: "code", kt: "code", kts: "code", scala: "code", swift: "code",
  m: "code", mm: "code", go: "code", rs: "code", rb: "code", py: "code", pyi: "code",
  js: "code", jsx: "code", mjs: "code", cjs: "code", ts: "code", tsx: "code",
  php: "code", pl: "code", pm: "code", lua: "code", r: "code", jl: "code",
  dart: "code", ex: "code", exs: "code", erl: "code", hrl: "code", hs: "code",
  clj: "code", cljs: "code", elm: "code", fs: "code", fsx: "code", ml: "code",
  nim: "code", zig: "code", v: "code", sv: "code", vhd: "code", vhdl: "code",
  asm: "code", s: "code", sh: "code", bash: "code", zsh: "code", fish: "code",
  ps1: "code", psm1: "code", bat: "code", cmd: "code", vb: "code", vbs: "code",
  sql: "code", graphql: "code", gql: "code", proto: "code", thrift: "code",
  sol: "code", tf: "code", hcl: "code", cmake: "code", mk: "code", gradle: "code",
  vue: "code", svelte: "code", astro: "code", css: "code", scss: "code",
  sass: "code", less: "code", html: "code", htm: "code", xhtml: "code",

  /* documents */
  pdf: "document", doc: "document", docx: "document", odt: "document",
  rtf: "document", txt: "document", md: "document", markdown: "document",
  mdx: "document", rst: "document", adoc: "document", asciidoc: "document",
  tex: "document", epub: "document", mobi: "document", pages: "document",
  log: "document",

  /* spreadsheets */
  xls: "spreadsheet", xlsx: "spreadsheet", xlsm: "spreadsheet",
  ods: "spreadsheet", numbers: "spreadsheet", csv: "spreadsheet",
  tsv: "spreadsheet",

  /* presentations */
  ppt: "presentation", pptx: "presentation", odp: "presentation",
  key: "presentation",

  /* images */
  png: "image", jpg: "image", jpeg: "image", gif: "image", bmp: "image",
  webp: "image", svg: "image", ico: "image", tif: "image", tiff: "image",
  heic: "image", heif: "image", avif: "image", raw: "image", cr2: "image",
  nef: "image", arw: "image", dng: "image", psd: "image", ai: "image",
  xcf: "image", eps: "image", tga: "image", exr: "image", hdr: "image",

  /* video */
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video",
  wmv: "video", flv: "video", m4v: "video", mpg: "video", mpeg: "video",
  "3gp": "video", ogv: "video", prproj: "video", aep: "video",

  /* audio */
  mp3: "audio", wav: "audio", flac: "audio", aac: "audio", ogg: "audio",
  oga: "audio", m4a: "audio", wma: "audio", aiff: "audio", aif: "audio",
  opus: "audio", mid: "audio", midi: "audio",

  /* structured data */
  json: "data", jsonl: "data", ndjson: "data", xml: "data", yaml: "data",
  yml: "data", toml: "data", parquet: "data", avro: "data", db: "data",
  sqlite: "data", sqlite3: "data", mdb: "data", accdb: "data", dbf: "data",
  geojson: "data", kml: "data", gpx: "data",

  /* archives */
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive", bz2: "archive",
  xz: "archive", "7z": "archive", rar: "archive", iso: "archive", dmg: "archive",
  jar: "archive", war: "archive", whl: "archive", deb: "archive", rpm: "archive",

  /* config / project metadata */
  ini: "config", cfg: "config", conf: "config", properties: "config",
  env: "config", lock: "config", editorconfig: "config", gitignore: "config",
  dockerignore: "config", npmrc: "config",
};

/* Filenames with no extension that are still recognizably config. */
const NAME_KIND: Record<string, FileKind> = {
  makefile: "code",
  dockerfile: "code",
  rakefile: "code",
  gemfile: "code",
  procfile: "config",
  license: "document",
  readme: "document",
  changelog: "document",
  contributing: "document",
  codeowners: "config",
};

export function extensionOf(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  /* A leading dot is part of the name (".gitignore"), not an extension
   * separator — treat the whole thing as the extension so dotfiles classify. */
  if (dot <= 0) return dot === 0 ? base.slice(1).toLowerCase() : "";
  return base.slice(dot + 1).toLowerCase();
}

export function fileKind(path: string | undefined | null): FileKind {
  if (!path) return "other";
  const base = (path.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase();
  const named = NAME_KIND[base] ?? NAME_KIND[base.replace(/\.[^.]*$/, "")];
  const ext = extensionOf(path);
  /* Extension wins when present and known — "readme.pdf" is a document either
   * way, but "makefile.py" is code by extension, not by its base name. */
  return EXT_KIND[ext] ?? named ?? "other";
}

/* Every kind that can appear, for building filter UI / help text. */
export const FILE_KINDS: FileKind[] = [
  "code",
  "document",
  "spreadsheet",
  "presentation",
  "image",
  "video",
  "audio",
  "data",
  "archive",
  "config",
  "other",
];

/* Kind → colour, for surfaces that show file kinds directly (the size map's
 * tiles, `kind:` filter chips). Deliberately distinct from LABEL_COLORS in
 * colors.ts: that maps *graph node labels* (Function, Class, Folder), which is a
 * different vocabulary — a `.py` file and a Function node are not the same fact,
 * and giving them one palette would imply they were. */
export const KIND_COLORS: Record<FileKind, string> = {
  code: "#3b82f6",
  document: "#fbbf24",
  spreadsheet: "#22c55e",
  presentation: "#fb923c",
  image: "#34d399",
  video: "#a855f7",
  audio: "#ec4899",
  data: "#06b6d4",
  archive: "#94a3b8",
  config: "#eab308",
  other: "#64748b",
};
