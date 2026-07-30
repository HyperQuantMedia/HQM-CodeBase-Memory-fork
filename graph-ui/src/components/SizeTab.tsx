import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildSizeTree,
  findSizeNode,
  formatBytes,
  sizeCrumbs,
  squarify,
  type FileSize,
  type SizeNode,
} from "../lib/sizeMap";
import { fileKind, KIND_COLORS } from "../lib/fileKind";
import { OpenButtons } from "./OpenButtons";

/* Size map — the same nested corpus, measured in bytes instead of links.
 *
 * Sizes come from a live walk of the project root by default. Reading
 * file_hashes.size instead was the first attempt and it was cheap for the wrong
 * reason: that table holds only what the parser hashed, so on a 25 GB tree it saw
 * 496 MB and missed 98% of the bytes. The indexed reading is still selectable,
 * because "how big is the corpus I can search" is a real question — just not the
 * one this view is for. Which source is showing is stated in the footer. */

interface SizeTabProps {
  project: string | null;
  /** Switch to the relationship graph for the same project. */
  onOpenGraph?: () => void;
}

interface Payload {
  files: FileSize[];
  total_bytes: number;
  file_count: number;
  truncated?: boolean;
  source?: string;
}

/* Which files the map covers.
 *
 * "disk" walks the working tree; "indexed" reads what the parser hashed. The
 * default is disk because the indexed set answers a different question and, on a
 * real tree, a much smaller one: on a 25 GB checkout it covered 1,940 files and
 * 496 MB while omitting 24.5 GB — the profiler captures, object files and static
 * libraries that are where the weight actually is. */
type SizeSource = "disk" | "indexed";

const SOURCE_LABEL: Record<SizeSource, string> = {
  disk: "All files on disk",
  indexed: "Indexed files only",
};

/* Below this many pixels a tile gets no label — there is nowhere to put one. */
const LABEL_MIN_W = 46;
const LABEL_MIN_H = 18;

export function SizeTab({ project, onOpenGraph }: SizeTabProps) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /* Which folder is being shown. Drilling in rather than rendering every level at
   * once: a 1,500-file corpus nested eight deep has no readable single frame. */
  const [focus, setFocus] = useState("");
  const [hovered, setHovered] = useState<SizeNode | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [source, setSource] = useState<SizeSource>("disk");
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFocus("");
    fetch(
      `/api/file-sizes?project=${encodeURIComponent(project)}&source=${source}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setData(d as Payload);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, source]);

  /* The frame is sized by flex, so the tile geometry has to follow its real box
   * rather than assume one. */
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tree = useMemo(
    () => (data ? buildSizeTree(data.files, project ?? "") : null),
    [data, project],
  );
  const node = useMemo(
    () => (tree ? findSizeNode(tree, focus) ?? tree : null),
    [tree, focus],
  );
  const crumbs = useMemo(() => (tree ? sizeCrumbs(tree, focus) : []), [tree, focus]);

  const { tiles, omitted } = useMemo(() => {
    if (!node || box.w <= 0 || box.h <= 0) return { tiles: [], omitted: 0 };
    return squarify(node.children, 0, 0, box.w, box.h);
  }, [node, box.w, box.h]);

  const onTileClick = useCallback((target: SizeNode) => {
    /* Folders drill in; files are leaves and stay selected for the detail strip. */
    if (target.children.length > 0) setFocus(target.path);
  }, []);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-dim text-sm">Select a project from the Projects tab</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-dim text-sm">
          {source === "disk" ? "Walking the project tree…" : "Reading indexed file sizes…"}
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }
  if (!tree || !node || !data || data.file_count === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-dim text-sm">
          {source === "indexed"
            ? "No indexed file sizes for this project — re-index to populate them."
            : "Nothing readable under this project's root path."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Path + drill-out */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 shrink-0 flex-wrap">
        <nav aria-label="Size map path" className="flex items-center gap-1 flex-wrap min-w-0">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={crumb.path || "__root"} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-ink-dim select-none" aria-hidden="true">
                    /
                  </span>
                )}
                <button
                  onClick={() => setFocus(crumb.path)}
                  className={`text-[11px] max-w-[200px] truncate transition-colors ${
                    last ? "text-foreground font-medium" : "text-ink-soft hover:text-primary"
                  }`}
                >
                  {crumb.name || project}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-soft tabular-nums">
            {formatBytes(node.bytes)} · {node.fileCount.toLocaleString()} files
          </span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SizeSource)}
            aria-label="Which files to measure"
            className="bg-input border border-border/60 rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
          >
            {(["disk", "indexed"] as SizeSource[]).map((v) => (
              <option key={v} value={v}>
                {SOURCE_LABEL[v]}
              </option>
            ))}
          </select>
          {focus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocus(crumbs[crumbs.length - 2]?.path ?? "")}
            >
              Up
            </Button>
          )}
          {onOpenGraph && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenGraph}
              title="Same corpus, measured in relationships"
            >
              Graph
            </Button>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div ref={frameRef} className="relative flex-1 min-h-0 overflow-hidden">
        {tiles.map((tile) => {
          const isFolder = tile.node.children.length > 0;
          const color = isFolder
            ? "var(--color-info)"
            : KIND_COLORS[fileKind(tile.node.path)];
          const showLabel = tile.w >= LABEL_MIN_W && tile.h >= LABEL_MIN_H;
          return (
            <button
              key={tile.node.path}
              onClick={() => onTileClick(tile.node)}
              onMouseEnter={() => setHovered(tile.node)}
              onMouseLeave={() => setHovered((h) => (h === tile.node ? null : h))}
              title={`${tile.node.path} — ${formatBytes(tile.node.bytes)}${
                isFolder ? ` · ${tile.node.fileCount.toLocaleString()} files` : ""
              }`}
              aria-label={`${tile.node.path}, ${formatBytes(tile.node.bytes)}`}
              className="absolute overflow-hidden text-left border border-background/60 hover:border-primary transition-colors"
              style={{
                left: tile.x,
                top: tile.y,
                width: Math.max(0, tile.w),
                height: Math.max(0, tile.h),
                /* A flat fill would make a folder of one big file look identical to
                 * the file itself; the tint carries kind, the border carries the
                 * nesting. */
                backgroundColor: `color-mix(in oklab, ${color} 32%, transparent)`,
                cursor: isFolder ? "pointer" : "default",
              }}
            >
              {showLabel && (
                <span className="block px-1 pt-0.5 text-[10px] leading-tight text-foreground/85 truncate">
                  {tile.node.name}
                </span>
              )}
              {showLabel && tile.h >= 32 && (
                <span className="block px-1 text-[9px] leading-tight text-ink-dim tabular-nums truncate">
                  {formatBytes(tile.node.bytes)}
                </span>
              )}
            </button>
          );
        })}
        {tiles.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-dim">
            Nothing large enough to draw here.
          </p>
        )}
      </div>

      {/* Footer: what is on screen, and what is not */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border/40 shrink-0 text-[10px] text-ink-dim flex-wrap">
        <span>
          {formatBytes(data.total_bytes)} indexed across{" "}
          {data.file_count.toLocaleString()} files
        </span>
        {omitted > 0 && (
          <span className="text-warning">
            {omitted.toLocaleString()} item{omitted === 1 ? "" : "s"} too small to draw at
            this size
          </span>
        )}
        {data.truncated && (
          <span className="text-warning">
            tree too large to walk in full — listing stopped early
          </span>
        )}
        <span className="ml-auto">
          {source === "disk"
            ? "Live from disk, excluding .git."
            : "Indexed files only, as of the last index."}
        </span>
        {hovered && hovered.children.length === 0 && (
          <OpenButtons project={project} path={hovered.path} />
        )}
      </div>
    </div>
  );
}
