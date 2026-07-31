import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildSizeTree,
  findSizeNode,
  formatBytes,
  sizeCrumbs,
  squarify,
  type FileSize,
  type SizeNode,
} from "../lib/sizeMap";
import { fileKind, KIND_COLORS, type FileKind } from "../lib/fileKind";
import { drawnRadius, FOLDER_COLOR, sizeTreeToGraph } from "../lib/sizeGraph";
import { OpenButtons } from "./OpenButtons";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphScene, computeCameraTarget, type CameraTarget } from "./GraphScene";
import { VIEW_MODE_ICON } from "./ViewModeIcons";
import { SettingsMenu } from "./SettingsMenu";
import { Breadcrumb } from "./Breadcrumb";
import { CollapsibleSection } from "./CollapsibleSection";
import { ResizeHandle } from "./ResizeHandle";
import { SizeTree } from "./SizeTree";
import { GraphTabIcon } from "./TabIcons";
import { loadFlag, loadWidth, saveFlag, saveWidth } from "../lib/panelState";
import { useSizeMapSphereProbe } from "../hooks/useSizeMapSphereProbe";
import {
  APPEARANCE_DEFAULTS,
  loadAppearances,
  saveAppearances,
  type Appearance,
  type AppearanceSet,
} from "../lib/appearance";
import { stageForTheme } from "../lib/sceneInk";
import { resolvedTheme, themeVar } from "../lib/theme";
import { loadViewSettings, saveViewSettings, type ViewSettings } from "../lib/viewSettings";
import {
  applyViewMode,
  DEFAULT_LAYOUT_PARAMS,
  VIEW_MODE_LABEL,
  type Crumb,
  type ViewMode,
} from "../lib/viewLayout";
import type { GraphNode } from "../lib/types";

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

/* How the size map is drawn.
 *
 * "treemap" is the squarified rectangles this view started as. The other three are
 * the relationship graph's own projections applied to the size hierarchy, which is
 * the same containment tree measured in bytes — nested spheres, nested cones, an
 * organic tree, with a node's sphere volume proportional to its file's size.
 *
 * The treemap is not being replaced. It is unbeatable at one specific thing —
 * exact proportion, no occlusion, every tile comparable to every other by area —
 * and that is why every tool ships one. What it cannot do is show *shape*: a
 * treemap of a 26k-file corpus is a wall of slivers with no sense of how deep the
 * nesting runs or where the structure clumps. The projections trade exact
 * proportion for exactly that. Two questions, two answers, one switch.
 *
 * The relationship graph's fourth mode is "default" — the server's force layout —
 * which has no counterpart here: nothing computes a force layout over file sizes,
 * and a size map's default should be the exact one anyway. So the treemap takes
 * that slot. */
type SizeView = "treemap" | Exclude<ViewMode, "default">;

const SIZE_VIEWS: SizeView[] = ["treemap", "sphere", "cone", "tree"];

const SIZE_VIEW_LABEL: Record<SizeView, string> = {
  treemap: "Treemap — exact proportion by area",
  sphere: VIEW_MODE_LABEL.sphere,
  cone: VIEW_MODE_LABEL.cone,
  tree: VIEW_MODE_LABEL.tree,
};

const SIZE_VIEW_KEY = "cbm-size-view";

function loadSizeView(): SizeView {
  try {
    const raw = window.localStorage.getItem(SIZE_VIEW_KEY);
    if (raw && (SIZE_VIEWS as string[]).includes(raw)) return raw as SizeView;
  } catch {
    /* no storage */
  }
  return "treemap";
}

export function SizeTab({ project, onOpenGraph }: SizeTabProps) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /* Which folder is being shown. Drilling in rather than rendering every level at
   * once: a 1,500-file corpus nested eight deep has no readable single frame. */
  const [focus, setFocus] = useState("");
  const [hovered, setHovered] = useState<SizeNode | null>(null);
  /* The 3D views have no hover-to-footer equivalent (the scene owns its own
   * tooltip), so a click on a file parks it here for the open-on-disk buttons. */
  const [picked, setPicked] = useState<SizeNode | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [source, setSource] = useState<SizeSource>("disk");
  /* File kinds switched off. Exclusions rather than inclusions, so a kind that only
   * appears after drilling into a new folder is visible immediately. */
  const [mutedKinds, setMutedKinds] = useState<Set<FileKind>>(new Set());
  /* Labels name the biggest files, which on a size map is exactly the list worth
   * naming — NodeLabels ranks by node size. */
  const [showLabels, setShowLabels] = useState(true);
  /* Panel geometry and fold state, on the same keys the graph tab uses so the shell
   * does not jump when switching between the two. */
  const [leftWidth, setLeftWidth] = useState(() => loadWidth("cbm-left-w", 260));
  const [rightWidth, setRightWidth] = useState(() => loadWidth("cbm-right-w", 280));
  const [filtersOpen, setFiltersOpen] = useState(() => loadFlag("cbm-filters-open", true));
  const [foldersOpen, setFoldersOpen] = useState(() => loadFlag("cbm-folders-open", true));
  const [view, setView] = useState<SizeView>(loadSizeView);
  const observerRef = useRef<ResizeObserver | null>(null);

  /* The 3D canvas clears with a literal colour, so it cannot inherit the theme —
   * the same reason GraphTab keeps a tick. */
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const onTheme = () => setThemeTick((t) => t + 1);
    window.addEventListener("cbm-theme-change", onTheme);
    return () => window.removeEventListener("cbm-theme-change", onTheme);
  }, []);
  const stage = useMemo(() => stageForTheme(resolvedTheme()), [themeTick]);
  const canvasBg = useMemo(
    () => themeVar("--color-canvas", stage === "light" ? "#f2f4fa" : "#06090f"),
    [themeTick, stage],
  );

  /* Scene settings, shared with the graph tab rather than duplicated: fov, orbit
   * behaviour and per-stage appearance are properties of *how the 3D view is
   * rendered*, not of which corpus is in it, and having them diverge between two
   * tabs showing the same tree would be its own defect. */
  const [appearances, setAppearances] = useState<AppearanceSet>(() => loadAppearances());
  const appearance = appearances[stage] ?? APPEARANCE_DEFAULTS[stage];
  const updateAppearance = useCallback(
    (next: Appearance) => {
      setAppearances((prev) => {
        const merged = { ...prev, [stage]: next };
        saveAppearances(merged);
        return merged;
      });
    },
    [stage],
  );
  const resetAppearance = useCallback(() => {
    updateAppearance({ ...APPEARANCE_DEFAULTS[stage], labelColors: {} });
  }, [stage, updateAppearance]);
  const [viewSettings, setViewSettings] = useState<ViewSettings>(() => loadViewSettings());
  const updateViewSettings = useCallback((next: ViewSettings) => {
    setViewSettings(next);
    saveViewSettings(next);
  }, []);

  /* Camera framing. The projections are sized from the radii and their extent
   * lands anywhere from ~450 to ~19,000 world units, while the canvas starts its
   * camera at z=800 — so without an explicit reframe the scene is either a speck or
   * the camera is inside it, which reads as "the view does not work" rather than
   * "the view is misframed". Same reason GraphTab reframes on a projection change. */
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  const changeView = useCallback((next: SizeView) => {
    try {
      window.localStorage.setItem(SIZE_VIEW_KEY, next);
    } catch {
      /* no storage — the choice just does not persist */
    }
    setView(next);
  }, []);

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
   * rather than assume one.
   *
   * A callback ref, not useRef plus a mount effect. This is why the map drew
   * nothing: the frame only exists in the loaded branch, below four early
   * returns, so at mount the component is rendering the "walking the tree"
   * placeholder and frameRef.current is null. An effect with an empty dep list
   * fires exactly then, finds no element, attaches no observer, and never runs
   * again once the data arrives and the frame appears. box stayed 0×0, squarify
   * got a zero-area rect and returned no tiles, and the view fell through to
   * "Nothing large enough to draw here" — an empty pane that looks like an empty
   * corpus while the API was returning every file correctly.
   *
   * A callback ref runs when the node actually attaches, and again with null on
   * detach, so it cannot miss the mount. The first measurement is taken directly
   * rather than waiting on the observer's initial callback, which keeps the tiles
   * correct in environments with no ResizeObserver at all. */
  const attachFrame = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) {
      return;
    }
    const measure = () =>
      setBox({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observerRef.current = ro;
  }, []);

  /* Kind filtering happens HERE, at the file list, before the tree is built — not
   * downstream on the emitted graph nodes.
   *
   * Filtering the graph was the first version and it was half a feature: the chips
   * changed the 3D scene and did nothing at all to the treemap, because the treemap
   * squarifies the tree directly. Worse, a folder's bytes would still have counted
   * the files that were no longer drawn, so the two views disagreed about the same
   * folder's size. Dropping the files at the source means the tree, its folder sums,
   * the tiles, the projections, the crumbs and the side panel all describe one
   * corpus. */
  const visibleFiles = useMemo(() => {
    if (!data) return [];
    if (mutedKinds.size === 0) return data.files;
    return data.files.filter((f) => !mutedKinds.has(fileKind(f.path)));
  }, [data, mutedKinds]);

  const tree = useMemo(
    () => (data ? buildSizeTree(visibleFiles, project ?? "") : null),
    [data, visibleFiles, project],
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
    /* Folders drill in; files open the detail panel. Before, a file tile absorbed
     * the click and did nothing at all. */
    if (target.children.length > 0) setFocus(target.path);
    else setPicked(target);
  }, []);

  /* ── Projected views ──────────────────────────────────────────── */

  /* Built from the *focused* subtree, not the whole corpus, so drilling in narrows
   * the scene exactly as it narrows the treemap — and keeps the node count down
   * without any special casing. */
  const sizeGraph = useMemo(
    () => (view === "treemap" || !node ? null : sizeTreeToGraph(node)),
    [view, node],
  );

  /* Classifier chips: which file kinds the corpus holds, how many, how heavy.
   *
   * Tallied over the UNFILTERED file list on purpose. Counting only what survives the
   * filter would make a chip vanish the moment it was switched off, leaving no way to
   * switch it back on — the control would delete itself. Folders never appear: they
   * are structure, and their bytes are their children's, so a "folders" chip would
   * either do nothing or hide the tree. */
  const kindTally = useMemo(() => {
    if (!data) return [];
    const tally = new Map<FileKind, { count: number; bytes: number }>();
    for (const f of data.files) {
      const kind = fileKind(f.path);
      const row = tally.get(kind) ?? { count: 0, bytes: 0 };
      row.count++;
      row.bytes += f.bytes;
      tally.set(kind, row);
    }
    return [...tally.entries()]
      .map(([kind, row]) => ({ kind, ...row, color: KIND_COLORS[kind] }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [data]);

  const toggleKind = useCallback((kind: FileKind) => {
    setMutedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  /* The spacing dial, and the delegated job that measures it.
   *
   * The probe is the only thing that moves this value, and it moves it only when
   * every projection landed inside the band measured off the approved relationship
   * graph. Until someone asks for a measurement it sits at the shipped default, so a
   * cold visit renders exactly what it rendered before this existed. */
  const sphereProbe = useSizeMapSphereProbe();

  const measureSpacing = useCallback(() => {
    if (visibleFiles.length === 0) return;
    /* The corpus that is actually on screen — the *focused* subtree's files, kind
     * filters already applied. Measuring the whole corpus would answer a question
     * about a scene nobody is looking at. */
    /* Paths are re-rooted at the focus, so the probe builds the same tree shape the
     * scene did — `sizeTreeToGraph(node)` starts from the focused subtree, and a
     * corpus still carrying its ancestor segments would nest one level deeper and
     * measure a different layout. */
    const prefix = focus === "" ? "" : `${focus}/`;
    sphereProbe.measure({
      name: project ?? "",
      files: visibleFiles
        .filter((f) => prefix === "" || f.path.startsWith(prefix))
        .map((f) => ({ path: f.path.slice(prefix.length), bytes: f.bytes })),
    });
  }, [focus, project, sphereProbe, visibleFiles]);

  const scene = useMemo(() => {
    if (!sizeGraph || view === "treemap") return null;
    /* radiusOf is what makes this a size map rather than a graph of the same tree:
     * the layout reserves room for each sphere's real radius and takes its spacing
     * target from the radii, so a 400 MB archive gets a 400 MB archive's worth of
     * space instead of one node's. */
    const placed = applyViewMode(
      sizeGraph.nodes.map((n) => ({ ...n })),
      sizeGraph.edges,
      view,
      DEFAULT_LAYOUT_PARAMS,
      undefined,
      drawnRadius,
      sphereProbe.quantile,
    );
    return { nodes: placed, edges: sizeGraph.edges, total_nodes: placed.length };
  }, [sizeGraph, view, sphereProbe.quantile]);

  /* Frame the whole scene whenever the geometry changes shape — a new projection, a
   * new focus, a kind switched off. Not on every render: reframing on a no-op would
   * yank a camera the user had just positioned. */
  useEffect(() => {
    if (!scene || scene.nodes.length === 0) {
      setCameraTarget(null);
      return;
    }
    const all = new Set(scene.nodes.map((n) => n.id));
    setCameraTarget(computeCameraTarget(scene.nodes, all, viewSettings.fov));
    /* Keyed on what changes the layout, deliberately not on `scene` itself. The
     * spacing dial belongs in that list: adopting a new notch rescales the whole
     * scene, and a camera framed for the old extent leaves it half off screen —
     * which reads as broken controls, not as a resize. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [view, focus, source, mutedKinds, sphereProbe.quantile]);

  /* Clicking a sphere does what clicking a tile does. */
  const onSceneNodeClick = useCallback(
    (clicked: GraphNode) => {
      const target = sizeGraph?.bySizeNode.get(clicked.id);
      if (!target) return;
      if (target.children.length > 0) setFocus(target.path);
      else setPicked(target);
    },
    [sizeGraph],
  );

  /* The picked file may not exist in a new subtree, and a stale detail panel
   * describing something off screen is worse than no panel. */
  useEffect(() => {
    setPicked(null);
  }, [focus, source]);

  /* The picked node's graph id, so the scene highlights it. Matched on path because
   * ids are assigned per conversion and change whenever the scene rebuilds. */
  const pickedIds = useMemo(() => {
    if (!picked || !sizeGraph) return null;
    for (const [id, sizeNode] of sizeGraph.bySizeNode) {
      if (sizeNode.path === picked.path) return new Set([id]);
    }
    return null;
  }, [picked, sizeGraph]);

  /* Ancestry of the picked node, for the header trail. Built from the path rather
   * than from a hierarchy walk: the size tree keys on the path already, so the
   * segments *are* the ancestors. */
  const pickCrumbs = useMemo<Crumb[]>(() => {
    if (!picked) return [];
    const segments = picked.path.split("/").filter(Boolean);
    return segments.map((segment, i) => ({
      label: segment,
      full: segments.slice(0, i + 1).join("/"),
      nodeId: null,
      subtreeIds: [],
    }));
  }, [picked]);

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

  /* The shell is the graph tab's shell: a resizable left column with the same two
   * collapsible sections, the view in the middle with its toolbar floating top-right,
   * and a docked, resizable detail panel on the right. Same widths, same fold keys,
   * same gestures — only the information differs. The earlier version put filters in
   * a strip above the view and the details in a card floating over it, which meant
   * two tabs showing the same tree had two different sets of furniture. */
  const ViewIcon = view === "treemap" ? null : VIEW_MODE_ICON[view];
  const pickedColor = picked
    ? picked.children.length > 0
      ? FOLDER_COLOR
      : KIND_COLORS[fileKind(picked.path)]
    : FOLDER_COLOR;

  return (
    <div className="h-full flex">
      {/* Left panel — resizable */}
      <div
        className="border-r border-border/30 flex flex-col h-full bg-sidebar/90 backdrop-blur-md shrink-0"
        style={{ width: leftWidth }}
      >
        <CollapsibleSection
          title="Filters"
          open={filtersOpen}
          onToggle={() =>
            setFiltersOpen((v) => {
              saveFlag("cbm-filters-open", !v);
              return !v;
            })
          }
          /* Same capping rule as the graph tab, for the same reason: 55% while the
             tree is open, the whole column once it folds away. */
          className={`border-b border-border/40 ${
            !filtersOpen
              ? "shrink-0"
              : foldersOpen
                ? "max-h-[55%] shrink-0"
                : "flex-1 min-h-0"
          }`}
          actions={
            mutedKinds.size > 0 ? (
              <button
                onClick={() => setMutedKinds(new Set())}
                className="text-[10px] text-primary/70 hover:text-primary transition-colors"
              >
                All
              </button>
            ) : undefined
          }
        >
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 pb-3 space-y-3">
              {/* Which files are being measured. In the panel rather than the
                  toolbar: it is a filter on the data, like everything else here. */}
              <div>
                <p className="text-[10px] font-medium text-ink-soft mb-1.5 uppercase tracking-wider">
                  Measuring
                </p>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as SizeSource)}
                  aria-label="Which files to measure"
                  className="w-full bg-input border border-border/60 rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
                >
                  {(["disk", "indexed"] as SizeSource[]).map((v) => (
                    <option key={v} value={v}>
                      {SOURCE_LABEL[v]}
                    </option>
                  ))}
                </select>
              </div>

              {/* File kinds — the graph tab's "Node types" chips, weighed in bytes
                  instead of counted, and doubling as the legend for the colours. */}
              {kindTally.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-ink-soft mb-1.5 uppercase tracking-wider">
                    File kinds
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {kindTally.map(({ kind, count, bytes, color }) => {
                      const on = !mutedKinds.has(kind);
                      return (
                        <button
                          key={kind}
                          onClick={() => toggleKind(kind)}
                          aria-pressed={on}
                          title={`${on ? "Hide" : "Show"} ${kind} — ${count.toLocaleString()} files, ${formatBytes(bytes)}`}
                          className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[10px] font-medium transition-all border ${
                            on
                              ? "border-border/60 bg-foreground/[0.04]"
                              : "border-transparent opacity-25"
                          }`}
                        >
                          <span
                            className="w-[5px] h-[5px] rounded-full"
                            style={{ backgroundColor: on ? color : "#7b7b7b" }}
                          />
                          <span style={{ color: on ? color : "#8a8a8a" }}>{kind}</span>
                          <span className="text-ink-faint tabular-nums">
                            {formatBytes(bytes)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          {/* Display options, pinned to the section's foot exactly as the graph
              tab's are. */}
          <div className="px-4 py-2.5 border-t border-border/20 shrink-0">
            <button
              onClick={() => setShowLabels((v) => !v)}
              aria-pressed={showLabels}
              title="Name the largest files in the scene"
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-all ${
                showLabels ? "text-primary" : "text-ink-dim"
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                  showLabels ? "border-primary bg-primary/20" : "border-foreground/15"
                }`}
              >
                {showLabels && <span className="text-primary text-[9px]">✓</span>}
              </span>
              Show labels
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Folders"
          open={foldersOpen}
          onToggle={() =>
            setFoldersOpen((v) => {
              saveFlag("cbm-folders-open", !v);
              return !v;
            })
          }
          /* `mt-auto` unconditionally — the same owner ruling as the graph tab's
             Folders section. See GraphTab.tsx for why it does not depend on whether
             Filters is open. */
          className={
            foldersOpen ? "flex-1 min-h-0" : "shrink-0 mt-auto border-t border-border/40"
          }
          actions={
            <span className="text-[10px] text-ink-dim tabular-nums">
              {formatBytes(node.bytes)}
            </span>
          }
        >
          <SizeTree
            root={node}
            focus={focus}
            pickedPath={picked?.path ?? null}
            onFocus={setFocus}
            onPick={setPicked}
            project={project}
          />
        </CollapsibleSection>
      </div>
      <ResizeHandle
        side="left"
        onResize={(d) => {
          setLeftWidth((w) => {
            const nw = Math.max(150, Math.min(500, w + d));
            saveWidth("cbm-left-w", nw);
            return nw;
          });
        }}
      />

      {/* Map area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Drill path. The graph tab has no equivalent because its breadcrumb is a
            selection trail; here the path IS the view's scope. */}
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
          <span className="ml-auto text-[11px] text-ink-soft tabular-nums shrink-0">
            {formatBytes(node.bytes)} · {node.fileCount.toLocaleString()} files
          </span>
          {focus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocus(crumbs[crumbs.length - 2]?.path ?? "")}
            >
              Up
            </Button>
          )}
        </div>

        <div className="flex-1 relative min-h-0 overflow-hidden">
          {/* The picked node's ancestry, in the header slot the graph tab uses — so
              the same information sits in the same place whichever tab is open. */}
          {pickCrumbs.length > 0 && (
            <Breadcrumb
              crumbs={pickCrumbs}
              root={project}
              onSelect={(label) => {
                /* A crumb names a level; jumping there means focusing its prefix.
                   The deepest crumb is the file itself, not a folder to focus. */
                const crumb = [...pickCrumbs].reverse().find((c) => c.label === label);
                if (!crumb) {
                  setPicked(null);
                  return;
                }
                setFocus(crumb.full === picked?.path ? focus : crumb.full);
              }}
            />
          )}

          {/* Projected views — the size hierarchy through the graph's own lenses. */}
          {scene && (
            <>
              <ErrorBoundary>
                <GraphScene
                  data={scene}
                  highlightedIds={pickedIds}
                  cameraTarget={cameraTarget}
                  showLabels={showLabels}
                  display={appearance}
                  onNodeClick={onSceneNodeClick}
                  stage={stage}
                  background={canvasBg}
                  fov={viewSettings.fov}
                  autoRotate={viewSettings.autoRotate}
                  edgeCurve={appearance.edgeCurve}
                />
              </ErrorBoundary>
              {/* Orbit, pan and zoom come from the canvas; say so once rather than
                  leaving the controls to be discovered. */}
              <p className="absolute bottom-3 left-4 text-[11px] text-ink-faint pointer-events-none select-none font-mono">
                drag to orbit · right-drag to pan · scroll to zoom
              </p>
            </>
          )}

          {/* HUD, in the graph tab's corner and its type size. */}
          <div className="absolute top-4 left-4 text-[11px] text-ink-dim pointer-events-none font-mono z-10">
            <p>
              {view === "treemap"
                ? `${tiles.length.toLocaleString()} tiles`
                : `${(scene?.nodes.length ?? 0).toLocaleString()} nodes`}
            </p>
            {mutedKinds.size > 0 && (
              <p className="mt-0.5">
                {mutedKinds.size} kind{mutedKinds.size === 1 ? "" : "s"} hidden
              </p>
            )}
          </div>

          {/* Toolbar, in the graph tab's corner and control style. */}
          <div className="absolute top-4 right-4 flex gap-2 items-center z-10">
            {picked && (
              <Button size="sm" onClick={() => setPicked(null)}>
                Clear selection
              </Button>
            )}
            {/* One button cycling the four views, exactly like the graph's
                projection cycle — not a four-button rail, which was a second kind of
                control for the same job. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                changeView(SIZE_VIEWS[(SIZE_VIEWS.indexOf(view) + 1) % SIZE_VIEWS.length])
              }
              aria-label={`View: ${SIZE_VIEW_LABEL[view]} — click to cycle`}
              title={`${SIZE_VIEW_LABEL[view]} — click to cycle view`}
            >
              {ViewIcon ? (
                <ViewIcon />
              ) : (
                <LayoutDashboard size={15} strokeWidth={1.6} aria-hidden="true" />
              )}
            </Button>
            {view !== "treemap" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateViewSettings({
                    ...viewSettings,
                    autoRotate: viewSettings.autoRotate === "on" ? "off" : "on",
                  })
                }
                aria-label={
                  viewSettings.autoRotate === "on" ? "Stop auto-rotate" : "Start auto-rotate"
                }
                title={
                  viewSettings.autoRotate === "on"
                    ? "Stop the camera orbit"
                    : "Start the camera orbit"
                }
              >
                {viewSettings.autoRotate === "on" ? "❚❚" : "▶"}
              </Button>
            )}
            {/* Scene settings + per-theme appearance, only where there is a scene to
                settle. The treemap is DOM, so fov and bloom have nothing to act on. */}
            {view !== "treemap" && (
              <SettingsMenu
                stage={stage}
                appearance={appearance}
                onAppearanceChange={updateAppearance}
                onAppearanceReset={resetAppearance}
                view={viewSettings}
                onViewChange={updateViewSettings}
                /* Empty on purpose: the Colors tab overrides colours resolved by
                   colorForLabel(), and this view colours by file *kind* out of
                   KIND_COLORS. Feeding it kind names would render swatches that
                   change nothing. Logged in hqm/backlog.md. */
                labels={[]}
              />
            )}
            {onOpenGraph && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenGraph}
                aria-label="Open the relationship graph"
                title="Same corpus, measured in relationships"
              >
                <GraphTabIcon />
              </Button>
            )}
          </div>

      {/* Tiles */}
      {view === "treemap" && (
      <div ref={attachFrame} className="absolute inset-0 overflow-hidden">
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
      )}
        </div>

      {/* Footer: what is on screen, and what is not. Spans the map column only, so
          the side panels keep their full height the way the graph tab's do. */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border/40 shrink-0 text-[10px] text-ink-dim flex-wrap">
        <span>
          {formatBytes(data.total_bytes)} indexed across{" "}
          {data.file_count.toLocaleString()} files
        </span>
        {view === "treemap" && omitted > 0 && (
          <span className="text-warning">
            {omitted.toLocaleString()} item{omitted === 1 ? "" : "s"} too small to draw at
            this size
          </span>
        )}
        {/* The projections cap their node count, so say what the cap dropped. A
            truncated scene that stays silent reads as the whole corpus. */}
        {sizeGraph && sizeGraph.omitted > 0 && (
          <span className="text-warning">
            {sizeGraph.omitted.toLocaleString()} lightest item
            {sizeGraph.omitted === 1 ? "" : "s"} not drawn (
            {formatBytes(sizeGraph.omittedBytes)}) — drill in to see them
          </span>
        )}
        {sizeGraph && (
          <span>
            {sizeGraph.nodes.length.toLocaleString()} drawn · sphere volume is file size
          </span>
        )}
        {/* Spacing: the value in force, and the delegated job that measures it.
            Stated rather than hidden, because it is the one number that decides
            whether a sphere's own bytes are readable, and the earlier version of it
            was a constant nobody could check. */}
        {sizeGraph && (
          <span className="flex items-center gap-2">
            <span>spacing {sphereProbe.quantile.toFixed(2)}</span>
            {sphereProbe.status === "running" ? (
              <button
                type="button"
                onClick={sphereProbe.cancel}
                className="underline underline-offset-2 hover:text-ink"
              >
                measuring
                {sphereProbe.progress
                  ? ` ${sphereProbe.progress.done}/${sphereProbe.progress.total}`
                  : ""}{" "}
                — stop
              </button>
            ) : (
              <button
                type="button"
                onClick={measureSpacing}
                className="underline underline-offset-2 hover:text-ink"
              >
                measure
              </button>
            )}
          </span>
        )}
        {/* Past two seconds the user is told, and told what the view is showing
            meanwhile. Amber, because a stale scene is a warning and not a status. */}
        {sphereProbe.notice && (
          <span className="text-warning">{sphereProbe.notice}</span>
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
        {/* Hovering a tile is the treemap's cheap preview; the docked panel is the
            full answer for whatever was clicked. */}
        {view === "treemap" && hovered && hovered.children.length === 0 && (
          <OpenButtons project={project} path={hovered.path} />
        )}
      </div>
      </div>

      {/* Right detail panel — resizable, docked, same as the graph tab's. A click on
          anything with bytes opens it: a size map that cannot tell you what you just
          clicked is asking you to guess from a rectangle's area. */}
      {picked && (
        <>
          <ResizeHandle
            side="right"
            onResize={(d) => {
              setRightWidth((w) => {
                const nw = Math.max(200, Math.min(500, w + d));
                saveWidth("cbm-right-w", nw);
                return nw;
              });
            }}
          />
        <div
          className="border-l border-border shrink-0 h-full overflow-hidden flex flex-col bg-sidebar/90"
          style={{ width: rightWidth, maxHeight: "100%" }}
        >
          {/* Header laid out exactly as NodeDetailPanel's: same padding, same dot,
              same 13px title, same 10px kind pill, same 16px close, same 11px mono
              path. The two panels sit in the same slot on two tabs, so any drift
              between them reads as one of the two being wrong. */}
          <div className="px-4 pt-4 pb-3 border-b border-border/30">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: pickedColor }}
                  />
                  <h3
                    className="text-[13px] font-semibold text-foreground truncate"
                    title={picked.name}
                  >
                    {picked.name}
                  </h3>
                </div>
                <span
                  className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium"
                  style={{ backgroundColor: `${pickedColor}18`, color: pickedColor }}
                >
                  {picked.children.length > 0 ? "Folder" : fileKind(picked.path)}
                </span>
              </div>
              <button
                onClick={() => setPicked(null)}
                aria-label="Close the detail panel"
                className="text-ink-faint hover:text-ink-soft transition-colors text-[16px] leading-none p-1"
              >
                ×
              </button>
            </div>
            <p className="text-[11px] text-ink-dim font-mono mt-2 break-all leading-relaxed">
              {picked.path}
            </p>
          </div>
          <dl className="px-4 py-3 space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-soft">Size</dt>
              <dd className="text-foreground tabular-nums">{formatBytes(picked.bytes)}</dd>
            </div>
            {/* No "Kind" row: the header pill already carries it, the same way
                NodeDetailPanel's pill carries the node label. */}
            {picked.children.length > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Files</dt>
                <dd className="text-foreground tabular-nums">
                  {picked.fileCount.toLocaleString()}
                </dd>
              </div>
            )}
            {/* Share of the folder currently in view, which is the comparison the
                treemap makes visually and the projections cannot. */}
            <div className="flex justify-between gap-2">
              <dt className="text-ink-soft">Share of {node.name || project}</dt>
              <dd className="text-foreground tabular-nums">
                {node.bytes > 0
                  ? `${((100 * picked.bytes) / node.bytes).toFixed(picked.bytes / node.bytes < 0.001 ? 3 : 1)}%`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-soft">Depth</dt>
              <dd className="text-foreground tabular-nums">{picked.depth}</dd>
            </div>
          </dl>
          <div className="flex items-center gap-1 px-4 py-3 border-t border-border/30">
            <OpenButtons
              project={project}
              path={picked.path}
              isFolder={picked.children.length > 0}
            />
            {picked.children.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setFocus(picked.path)}
              >
                Drill in
              </Button>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
