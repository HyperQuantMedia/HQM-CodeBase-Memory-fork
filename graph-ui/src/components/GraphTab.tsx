import { useEffect, useState, useCallback, useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGraphData,
  clampNodeBudget,
  GRAPH_RENDER_NODE_LIMIT,
  GRAPH_NODE_BUDGET_STEP,
  GRAPH_NODE_BUDGET_MAX,
} from "../hooks/useGraphData";
import { GraphLoader } from "./GraphLoader";
import { SettingsMenu } from "./SettingsMenu";
import {
  APPEARANCE_DEFAULTS,
  loadAppearances,
  saveAppearances,
  type Appearance,
  type AppearanceSet,
} from "../lib/appearance";
import {
  loadViewSettings,
  saveViewSettings,
  type ViewSettings,
} from "../lib/viewSettings";
import {
  applyViewMode,
  computeCrumbs,
  computePathToRoot,
  computeReferenceForks,
  deriveHierarchy,
  VIEW_MODE_LABEL,
  VIEW_MODES,
} from "../lib/viewLayout";
import { VIEW_MODE_ICON } from "./ViewModeIcons";
import {
  GraphScene,
  computeCameraTarget,
  type CameraTarget,
} from "./GraphScene";
import { Sidebar } from "./Sidebar";
import { FilterPanel } from "./FilterPanel";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { MissedCallout } from "./MissedCallout";
import { ResizeHandle } from "./ResizeHandle";
import { ErrorBoundary } from "./ErrorBoundary";
import { CollapsedRailTab, CollapsibleSection } from "./CollapsibleSection";
import { Breadcrumb } from "./Breadcrumb";
import { HelpModal } from "./HelpModal";
import type { GraphNode, GraphData, RepoInfo } from "../lib/types";
import {
  colorForLabel,
  colorForStatus,
  setEdgeColorOverrides,
  setLabelColorOverrides,
} from "../lib/colors";
import { downloadStaticPage } from "../lib/exportStatic";
import { resolvedTheme, themeVar } from "../lib/theme";
import { stageForTheme } from "../lib/sceneInk";
import {
  loadDisabledSet,
  loadFlag,
  loadNodeBudget,
  loadWidth,
  saveDisabledSet,
  saveFlag,
  saveNodeBudget,
  saveWidth,
} from "../lib/panelState";

/* Panel widths, fold state and the per-project node budget live in
 * lib/panelState.ts, shared with the size tab so both tabs read and write the
 * same keys (C10: one budget per project across both views). */

interface GraphTabProps {
  project: string | null;
  /** Switch to the size map for the same project. */
  onOpenSizeMap?: () => void;
}

export function formatGraphLimitNotice(data: GraphData | null): string | null {
  if (!data || data.total_nodes <= data.nodes.length) return null;
  return `Showing ${data.nodes.length.toLocaleString("en-US")} of ${data.total_nodes.toLocaleString("en-US")} nodes (${data.edges.length.toLocaleString("en-US")} edges). Raise the node budget or use filters.`;
}

export function GraphTab({ project, onOpenSizeMap }: GraphTabProps) {
  const { data, loading, error, progress, fetchOverview } = useGraphData();
  const [highlightedIds, setHighlightedIds] = useState<Set<number> | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  /* Both themes' appearance settings are held at once, and the active one is
   * picked by stage below. Keeping both in state (rather than reloading on every
   * theme flip) means switching theme and switching back is lossless even before
   * anything is persisted. */
  const [appearances, setAppearances] = useState<AppearanceSet>(() =>
    loadAppearances(),
  );
  const [view, setView] = useState<ViewSettings>(() => loadViewSettings());
  const updateView = useCallback((next: ViewSettings) => {
    setView(next);
    saveViewSettings(next);
  }, []);

  const [leftWidth, setLeftWidth] = useState(() => loadWidth("cbm-left-w", 260));
  const [rightWidth, setRightWidth] = useState(() => loadWidth("cbm-right-w", 280));
  const [filtersOpen, setFiltersOpen] = useState(() => loadFlag("cbm-filters-open", true));
  const [foldersOpen, setFoldersOpen] = useState(() => loadFlag("cbm-folders-open", true));
  const [helpOpen, setHelpOpen] = useState(false);
  /* Re-read themed CSS vars whenever the theme flips (the 3D canvas clears with
   * a literal colour, so it cannot inherit one). */
  const [themeTick, setThemeTick] = useState(0);
  /* The 3D scene is not just differently-coloured between themes, it is a
     different rendering model — see lib/sceneInk.ts. */
  const stage = useMemo(() => stageForTheme(resolvedTheme()), [themeTick]);

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

  /* Label colour overrides live in module state so non-React callers (colors.ts's
   * colorForLabel, reached from render paths and plain functions alike) see them
   * too. They are per-theme now, so this has to re-run on a theme flip. */
  useEffect(() => {
    setLabelColorOverrides(appearance.labelColors);
  }, [appearance.labelColors]);
  /* Same shape for edges (Phase 4a): chips and any non-React caller read the
   * module store; the renderer gets the record as a prop so geometry re-derives. */
  useEffect(() => {
    setEdgeColorOverrides(appearance.edgeColors);
  }, [appearance.edgeColors]);
  const canvasBg = useMemo(
    () => themeVar("--color-canvas", stage === "light" ? "#f2f4fa" : "#06090f"),
    [themeTick, stage],
  );
  useEffect(() => {
    const onTheme = () => setThemeTick((t) => t + 1);
    window.addEventListener("cbm-theme-change", onTheme);
    return () => window.removeEventListener("cbm-theme-change", onTheme);
  }, []);

  /* Esc clears the selection — the escape hatch the help modal documents.
   * Skipped while typing so it does not fight the search box. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      setHighlightedIds(null);
      setSelectedPath(null);
      setSelectedNode(null);
      setCameraTarget(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const limitNotice = formatGraphLimitNotice(data);

  /* Node budget — keyed to its project so switching projects re-reads the
   * persisted value and triggers exactly one fetch. */
  const [budget, setBudget] = useState<{ project: string | null; value: number }>(
    { project: null, value: GRAPH_RENDER_NODE_LIMIT },
  );
  const [budgetDraft, setBudgetDraft] = useState(String(GRAPH_RENDER_NODE_LIMIT));

  const commitBudget = useCallback(() => {
    const parsed = clampNodeBudget(parseInt(budgetDraft, 10));
    setBudgetDraft(String(parsed));
    if (project && parsed !== budget.value) {
      saveNodeBudget(project, parsed);
      setBudget({ project, value: parsed });
    }
  }, [budgetDraft, project, budget.value]);

  /* Filter state — all enabled by default */
  const [enabledLabels, setEnabledLabels] = useState<Set<string>>(new Set());
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<string>>(new Set());

  /* Missed skeleton (#963): the file structure of files the indexer could
   * not fully cover, shown as a white satellite cluster beside the code
   * galaxy. Toggle only hides/shows it — the data rides along with every
   * code-graph layout. */
  const [showMissedSkeleton, setShowMissedSkeleton] = useState(true);

  /* Dead-code view: recolor by status + status-based filters */
  const [deadCodeView, setDeadCodeView] = useState(false);
  const [showOnlyDead, setShowOnlyDead] = useState(false);
  const [hideEntryPoints, setHideEntryPoints] = useState(false);
  const [hideTests, setHideTests] = useState(false);
  /* Turning a relationship off removes the links but leaves the nodes that only
   * ever had that kind of link floating with nothing attached — 2,803 External
   * nodes on the sample corpus, every one of them reachable solely by
   * EXTERNAL_LINK. That is the node over-population: the filter did what it said
   * and the graph did not get any smaller. */
  const [hideUnlinked, setHideUnlinked] = useState(false);

  /* Initialize filters when data loads — everything on, minus this project's
   * persisted exclusions (A3a). */
  useEffect(() => {
    if (!data) return;
    const labels = new Set(data.nodes.map((n) => n.label));
    const types = new Set(data.edges.map((e) => e.type));
    for (const lp of data.linked_projects ?? []) {
      for (const n of lp.nodes) labels.add(n.label);
      for (const e of lp.edges) types.add(e.type);
      for (const e of lp.cross_edges) types.add(e.type);
    }
    if (project) {
      for (const off of loadDisabledSet("labels", project)) labels.delete(off);
      for (const off of loadDisabledSet("edges", project)) types.delete(off);
    }
    setEnabledLabels(labels);
    setEnabledEdgeTypes(types);
  }, [data, project]);

  /* Persist the exclusions whenever a filter changes. Derived from the data
   * (all types minus enabled) so the stored set never accumulates types that
   * no longer exist in the corpus. */
  const persistFilters = useCallback(
    (labels: Set<string>, types: Set<string>) => {
      if (!data || !project) return;
      const allLabels = new Set(data.nodes.map((n) => n.label));
      const allTypes = new Set(data.edges.map((e) => e.type));
      for (const lp of data.linked_projects ?? []) {
        for (const n of lp.nodes) allLabels.add(n.label);
        for (const e of lp.edges) allTypes.add(e.type);
        for (const e of lp.cross_edges) allTypes.add(e.type);
      }
      saveDisabledSet("labels", project, new Set([...allLabels].filter((l) => !labels.has(l))));
      saveDisabledSet("edges", project, new Set([...allTypes].filter((t) => !types.has(t))));
    },
    [data, project],
  );

  /* Compute filtered data */
  const filteredData: GraphData | null = useMemo(() => {
    if (!data) return null;

    /* Status-based filters (dead-code view) */
    const statusOk = (n: GraphNode) => {
      if (showOnlyDead && n.status !== "dead") return false;
      if (hideEntryPoints && n.status === "entry") return false;
      if (hideTests && n.status === "test") return false;
      return true;
    };
    /* Recolor by status when the dead-code view is on */
    const paint = (n: GraphNode): GraphNode =>
      deadCodeView ? { ...n, color: colorForStatus(n.status) } : n;
    const keep = (n: GraphNode) => enabledLabels.has(n.label) && statusOk(n);

    let nodes = data.nodes.filter(keep).map(paint);
    let nodeIds = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter(
      (e) =>
        enabledEdgeTypes.has(e.type) &&
        nodeIds.has(e.source) &&
        nodeIds.has(e.target),
    );

    /* Drop nodes no surviving edge touches. Safe to do after the edge pass rather
     * than iterating to a fixed point: a kept edge only ever references kept
     * nodes, so removing the untouched ones cannot orphan an edge. */
    if (hideUnlinked) {
      const linked = new Set<number>();
      for (const e of edges) {
        linked.add(e.source);
        linked.add(e.target);
      }
      nodes = nodes.filter((n) => linked.has(n.id));
      nodeIds = new Set(nodes.map((n) => n.id));
    }

    const linked_projects = data.linked_projects?.map((lp) => {
      const lpNodes = lp.nodes.filter(keep).map(paint);
      const lpIds = new Set(lpNodes.map((n) => n.id));
      const lpEdges = lp.edges.filter(
        (e) =>
          enabledEdgeTypes.has(e.type) && lpIds.has(e.source) && lpIds.has(e.target),
      );
      const crossEdges = lp.cross_edges.filter(
        (e) =>
          enabledEdgeTypes.has(e.type) && nodeIds.has(e.source) && lpIds.has(e.target),
      );
      return { ...lp, nodes: lpNodes, edges: lpEdges, cross_edges: crossEdges };
    });

    return { nodes, edges, total_nodes: data.total_nodes, linked_projects };
  }, [
    data,
    enabledLabels,
    enabledEdgeTypes,
    deadCodeView,
    showOnlyDead,
    hideEntryPoints,
    hideTests,
    hideUnlinked,
  ]);

  /* How many nodes the unlinked filter would remove right now — shown on the
   * checkbox, so the trade-off is visible before it is taken. */
  const unlinkedCount = useMemo(() => {
    if (!filteredData) return 0;
    if (hideUnlinked) return 0;
    const linked = new Set<number>();
    for (const e of filteredData.edges) {
      linked.add(e.source);
      linked.add(e.target);
    }
    let count = 0;
    for (const n of filteredData.nodes) if (!linked.has(n.id)) count++;
    return count;
  }, [filteredData, hideUnlinked]);

  /* Hierarchy of the filtered graph — one derivation feeding the alternate
   * layouts, the breadcrumb, and the path light. */
  const hierarchy = useMemo(
    () => (filteredData ? deriveHierarchy(filteredData.nodes, filteredData.edges) : null),
    [filteredData],
  );

  /* The graph handed to the renderer: server positions by default, reprojected
   * client-side for the sphere/cone/tree views. */
  const viewData: GraphData | null = useMemo(() => {
    if (!filteredData) return null;
    if (view.mode === "default" || !hierarchy) return filteredData;
    return {
      ...filteredData,
      nodes: applyViewMode(
        filteredData.nodes,
        filteredData.edges,
        view.mode,
        view.layout,
        hierarchy,
      ),
    };
  }, [filteredData, hierarchy, view.mode, view.layout]);

  /* Reframe on a projection change.
   *
   * The alternate views are built from a target node spacing rather than fitted
   * into the server layout's box, so their extent is genuinely different — the
   * organic tree over a 47k-node corpus is an order of magnitude larger than the
   * force layout. Without this the camera keeps its old framing and the new
   * projection is a speck, or is behind the near plane; either reads as the view
   * being broken rather than merely misframed. */
  useEffect(() => {
    if (!viewData || viewData.nodes.length === 0) return;
    const all = new Set(viewData.nodes.map((n) => n.id));
    setCameraTarget(computeCameraTarget(viewData.nodes, all, view.fov));
    /* Deliberately keyed on the projection alone: reframing on every data change
     * would yank the camera back whenever a filter toggles. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [view.mode, view.layout]);

  /* Breadcrumb + path light both key off the single selected node. */
  const crumbs = useMemo(
    () => (selectedNode && hierarchy ? computeCrumbs(selectedNode.id, hierarchy) : []),
    [selectedNode, hierarchy],
  );
  const lightPath = useMemo(() => {
    if (!view.pathLight || !selectedNode || !hierarchy) return undefined;
    return computePathToRoot(selectedNode.id, hierarchy);
  }, [view.pathLight, selectedNode, hierarchy]);
  /* Where the light forks once it lands: the selection's own references. */
  const lightForks = useMemo(() => {
    if (!view.pathLight || !selectedNode || !filteredData) return undefined;
    return computeReferenceForks(selectedNode.id, filteredData.edges);
  }, [view.pathLight, selectedNode, filteredData]);

  /* "" means "follow the strands" — PathLight then takes each hop's colour from
     the graph instead of a fixed value. */
  const pathLightColor =
    appearance.pathLightColorMode === "strand"
      ? ""
      : appearance.pathLightColorMode === "theme"
        ? themeVar("--color-primary", "#ffce6e")
        : appearance.pathLightColor;

  const labelsInGraph = useMemo(
    () => (data ? [...new Set(data.nodes.map((n) => n.label))] : []),
    [data],
  );
  const edgeTypesInGraph = useMemo(
    () => (data ? [...new Set(data.edges.map((e) => e.type))] : []),
    [data],
  );

  const handleExport = useCallback(() => {
    if (!viewData || !project) return;
    const labelColors: Record<string, string> = {};
    for (const label of new Set(viewData.nodes.map((n) => n.label))) {
      labelColors[label] = appearance.labelColors[label] ?? colorForLabel(label);
    }
    downloadStaticPage({
      project,
      nodes: viewData.nodes,
      edges: viewData.edges,
      theme: resolvedTheme(),
      labelColors,
      generatedAt: new Date().toISOString(),
    });
  }, [viewData, project, appearance.labelColors]);

  /* Re-read the persisted budget when the project changes… */
  useEffect(() => {
    if (project) {
      const value = loadNodeBudget(project, GRAPH_RENDER_NODE_LIMIT, clampNodeBudget);
      setBudget({ project, value });
      setBudgetDraft(String(value));
    }
  }, [project]);

  /* …and fetch only once budget and project agree (one fetch per change). */
  useEffect(() => {
    if (project && budget.project === project) {
      fetchOverview(project, budget.value);
      setHighlightedIds(null);
      setSelectedPath(null);
    }
  }, [project, budget, fetchOverview]);

  /* Missed skeleton: offset into place and painted one flat colour — a ghost of
   * the files the graph could not fully cover, sitting beside the galaxy.
   *
   * The near-white stays a literal rather than becoming a theme variable: it is a
   * *node* colour, and node colours go through `inkNode` in NodeCloud whenever the
   * stage is light, which darkens and saturates while preserving hue. The colour is
   * the intent; the stage decides how it is realised. That only holds because
   * `stage` is now passed to this cluster — see GraphScene. */
  const missedSkeleton = useMemo(() => {
    const mg = data?.missed_graph;
    if (!mg || mg.nodes.length === 0) return null;
    const nodes = mg.nodes.map((n) => ({
      ...n,
      x: n.x + mg.offset.x,
      y: n.y + mg.offset.y,
      z: n.z + mg.offset.z,
      color: "#e9eef5",
    }));
    return { nodes, edges: mg.edges, ids: new Set(nodes.map((n) => n.id)) };
  }, [data]);

  /* Overview framing: both clusters (galaxy + skeleton) in one shot.
   *
   * Deliberately over the *unfiltered* node set, and with `view.fov` — which the
   * ported version omitted, so the framing silently assumed 50°. Unfiltered keeps
   * this stable across a filter toggle: framing the filtered set would recompute on
   * every chip click and yank a camera the user had just positioned, which is the
   * reframe-on-a-no-op mistake the size view already learned. */
  const overviewTarget = useMemo(() => {
    if (!data) return null;
    const all = missedSkeleton ? [...data.nodes, ...missedSkeleton.nodes] : data.nodes;
    return computeCameraTarget(all, new Set(all.map((n) => n.id)), view.fov);
  }, [data, missedSkeleton, view.fov]);

  /* With a skeleton beside the galaxy, auto-frame BOTH clusters on load so
   * the side-by-side composition is visible without manual zooming. */
  useEffect(() => {
    if (missedSkeleton && overviewTarget) {
      setCameraTarget(overviewTarget);
    }
  }, [missedSkeleton, overviewTarget]);

  /* Clicking empty space while the skeleton has focus flies back to the
   * overview (the galaxy may be entirely off-screen at that point, so there
   * is no code node to click). No-op during normal galaxy exploration. */
  const handleBackgroundClick = useCallback(() => {
    if (selectedNode && missedSkeleton?.ids.has(selectedNode.id) && overviewTarget) {
      setSelectedNode(null);
      setHighlightedIds(null);
      setSelectedPath(null);
      setCameraTarget(overviewTarget);
    }
  }, [selectedNode, missedSkeleton, overviewTarget]);

  /* Fetch git remote metadata for GitHub deep-links */
  useEffect(() => {
    if (!project) {
      setRepoInfo(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/repo-info?project=${encodeURIComponent(project)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && !d.error) setRepoInfo(d as RepoInfo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project]);

  /* Camera framing must read the coordinates that are actually on screen.
   *
   * Every fly-to used filteredData, i.e. the server's force layout — correct in
   * the Web view, where viewData is the same array, and wrong in every other one,
   * because the projections rewrite all three coordinates. Selecting anything
   * while a projection was active therefore sent the camera to where that node
   * would have been in a layout that was no longer being drawn. */
  const framedNodes = viewData?.nodes ?? filteredData?.nodes ?? [];

  const handleSelectPath = useCallback(
    (path: string, nodeIds: Set<number>) => {
      if (!filteredData || !path || nodeIds.size === 0) {
        setHighlightedIds(null);
        setSelectedPath(null);
        setCameraTarget(null);
        return;
      }
      setSelectedPath(path);
      setHighlightedIds(nodeIds);
      setCameraTarget(computeCameraTarget(framedNodes, nodeIds, view.fov));
    },
    [filteredData, framedNodes, view.fov],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (!filteredData) return;

      /* Clicking the missed skeleton re-centers the camera on that whole
       * cluster (it's small — the natural focus unit is the skeleton, not a
       * single node); clicking any code node flies back to the code galaxy
       * via the normal per-node focus below. */
      if (missedSkeleton?.ids.has(node.id)) {
        setSelectedNode(node);
        setHighlightedIds(null);
        setSelectedPath(node.file_path ?? null);
        setCameraTarget(
          computeCameraTarget(missedSkeleton.nodes, missedSkeleton.ids, view.fov),
        );
        return;
      }

      setSelectedNode(node);

      /* Highlight the node and its direct connections */
      const connectedIds = new Set([node.id]);
      for (const edge of filteredData.edges) {
        if (edge.source === node.id) connectedIds.add(edge.target);
        if (edge.target === node.id) connectedIds.add(edge.source);
      }
      setHighlightedIds(connectedIds);
      setSelectedPath(node.file_path ?? null);
      setCameraTarget(computeCameraTarget(framedNodes, connectedIds, view.fov));
    },
    [filteredData, framedNodes, view.fov, missedSkeleton],
  );

  const handleNavigateToNode = useCallback(
    (node: GraphNode) => {
      handleNodeClick(node);
    },
    [handleNodeClick],
  );

  const toggleLabel = useCallback((label: string) => {
    setEnabledLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      persistFilters(next, enabledEdgeTypes);
      return next;
    });
  }, [persistFilters, enabledEdgeTypes]);

  const toggleEdgeType = useCallback((type: string) => {
    setEnabledEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      persistFilters(enabledLabels, next);
      return next;
    });
  }, [persistFilters, enabledLabels]);

  const enableAll = useCallback(() => {
    if (!data) return;
    const labels = new Set(data.nodes.map((n) => n.label));
    const types = new Set(data.edges.map((e) => e.type));
    for (const lp of data.linked_projects ?? []) {
      for (const n of lp.nodes) labels.add(n.label);
      for (const e of lp.edges) types.add(e.type);
      for (const e of lp.cross_edges) types.add(e.type);
    }
    setEnabledLabels(labels);
    setEnabledEdgeTypes(types);
    persistFilters(labels, types);
  }, [data, persistFilters]);

  const disableAll = useCallback(() => {
    setEnabledLabels(new Set());
    setEnabledEdgeTypes(new Set());
    persistFilters(new Set(), new Set());
  }, [persistFilters]);

  const ViewIcon = VIEW_MODE_ICON[view.mode];

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-dim text-sm">
          Select a project from the Projects tab
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <GraphLoader nodeBudget={budget.value} progress={progress} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <p className="text-destructive text-sm mb-2">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchOverview(project)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /* No data, or the project genuinely has no nodes — there are no filters to
     interact with, so show a plain full-screen message. The "all filtered out"
     case is handled inside the layout below so the filter sidebar stays put. */
  if (!data || !filteredData || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-dim text-sm">No nodes in this project</p>
      </div>
    );
  }

  return (
    <div className="h-full flex relative">
      {/* C7 round 4 (owner): the rail is always there; Filters' tab sits at the
          top, Folders' tab at the MIDDLE — each tab lives roughly where its
          panel's content would. Open panels float over the map (below), so the
          centre view owns the full width either way. */}
      <div className="w-8 border-r border-border/30 bg-sidebar/90 flex flex-col items-center gap-1 py-2 shrink-0">
        {!filtersOpen && (
          <CollapsedRailTab
            title="Filters"
            onOpen={() => {
              saveFlag("cbm-filters-open", true);
              setFiltersOpen(true);
            }}
          />
        )}
        {!foldersOpen && (
          <div className="my-auto">
            <CollapsedRailTab
              title="Folders"
              onOpen={() => {
                saveFlag("cbm-folders-open", true);
                setFoldersOpen(true);
              }}
            />
          </div>
        )}
      </div>
      {/* Open sections float over the map as a content-height card — the same
          give-the-space-back behaviour the right detail panel has. The map runs
          full-bleed underneath. */}
      {(filtersOpen || foldersOpen) && (
      <div
        className="absolute left-8 top-0 z-20 max-h-full flex flex-col bg-sidebar/95 backdrop-blur-md border-r border-b border-border/40 rounded-br-lg overflow-hidden"
        style={{ width: leftWidth }}
      >
        {/* Filters at the top, folders below — either can fold away to give the
            other the whole column. */}
        {filtersOpen && (
        <CollapsibleSection
          title="Filters"
          open={filtersOpen}
          onToggle={() =>
            setFiltersOpen((v) => {
              saveFlag("cbm-filters-open", !v);
              return !v;
            })
          }
          /* Content-height inside the floating card; both sections shrink with
              internal scroll when the card hits the viewport's max height. */
          className="border-b border-border/40 flex-[0_1_auto] min-h-0"
        >
          <FilterPanel
            data={data}
            enabledLabels={enabledLabels}
            enabledEdgeTypes={enabledEdgeTypes}
            showLabels={showLabels}
            onToggleLabel={toggleLabel}
            onToggleEdgeType={toggleEdgeType}
            onToggleShowLabels={() => setShowLabels((v) => !v)}
            onEnableAll={enableAll}
            onDisableAll={disableAll}
            deadCodeView={deadCodeView}
            showOnlyDead={showOnlyDead}
            hideEntryPoints={hideEntryPoints}
            hideTests={hideTests}
            onToggleDeadCodeView={() => setDeadCodeView((v) => !v)}
            onToggleShowOnlyDead={() => setShowOnlyDead((v) => !v)}
            onToggleHideEntryPoints={() => setHideEntryPoints((v) => !v)}
            onToggleHideTests={() => setHideTests((v) => !v)}
            hideUnlinked={hideUnlinked}
            unlinkedCount={unlinkedCount}
            onToggleHideUnlinked={() => setHideUnlinked((v) => !v)}
            missedView={showMissedSkeleton}
            /* Files only. The skeleton also carries the directory nodes that hold
               it together, and counting those would overstate what was missed. */
            missedCount={
              data?.missed_graph?.nodes.filter((n) => n.label === "File").length ?? 0
            }
            onToggleMissedView={() => setShowMissedSkeleton((v) => !v)}
          />
        </CollapsibleSection>
        )}

        {/* C7 ruling chain: round 1 superseded the 2026-07-30 mt-auto ruling
            (collapsed strips gathered at the top); round 3 (owner, 2026-08-01)
            moved a collapsed section OFF the column onto the rail entirely.
            All three layouts were the owner's calls, in that order. */}
        {foldersOpen && (
        <CollapsibleSection
          title="Folders"
          open={foldersOpen}
          onToggle={() =>
            setFoldersOpen((v) => {
              saveFlag("cbm-folders-open", !v);
              return !v;
            })
          }
          className="flex-[0_1_auto] min-h-0"
          actions={
            <span className="text-[10px] text-ink-dim tabular-nums">
              {filteredData.nodes.length.toLocaleString()}
            </span>
          }
        >
          <Sidebar
            nodes={filteredData.nodes}
            onSelectPath={handleSelectPath}
            selectedPath={selectedPath}
            project={project}
          />
        </CollapsibleSection>
        )}
        {/* The drag edge rides the card itself now that the card floats. */}
        <div className="absolute right-0 inset-y-0 flex">
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
        </div>
      </div>
      )}

      {/* Graph area */}
      <div className="flex-1 relative overflow-hidden">
        {filteredData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-ink-dim text-sm mb-3">All nodes filtered out</p>
              <Button size="sm" onClick={enableAll}>
                Reset Filters
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ErrorBoundary>
              <GraphScene
                data={viewData ?? filteredData}
                missed={showMissedSkeleton ? missedSkeleton : null}
                highlightedIds={highlightedIds}
                cameraTarget={cameraTarget}
                showLabels={showLabels}
                display={appearance}
                onNodeClick={handleNodeClick}
                fov={view.fov}
                lightPath={lightPath}
                lightForks={lightForks}
                autoRotate={view.autoRotate}
                pathLightStyle={view.pathLightStyle}
                pathLightSpeed={view.pathLightSpeed}
                pathLightColor={pathLightColor}
                pathLightAccel={view.pathLightAccel}
                stage={stage}
                edgeCurve={appearance.edgeCurve}
                background={canvasBg}
                onBackgroundClick={handleBackgroundClick}
              />
            </ErrorBoundary>

            {crumbs.length > 0 && (
              <Breadcrumb
                crumbs={crumbs}
                root={project}
                /* B2: the crumb's full key, not its label — a label lookup jumped
                   to the deepest match when a path segment repeated, and it also
                   fed the sidebar a path it could never equal. */
                onSelect={(crumb) =>
                  crumb
                    ? handleSelectPath(crumb.full, new Set(crumb.subtreeIds))
                    : handleSelectPath("", new Set())
                }
              />
            )}
            {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

            {/* HUD */}
            <div className="absolute top-4 left-4 text-[11px] text-ink-dim pointer-events-none font-mono">
              <p>
                {filteredData.nodes.length.toLocaleString()} nodes /{" "}
                {filteredData.edges.length.toLocaleString()} edges
              </p>
              {data.nodes.length > filteredData.nodes.length && (
                <p className="text-ink-dim mt-0.5">
                  filtered from {data.nodes.length.toLocaleString()}
                </p>
              )}
              {limitNotice && (
                <p className="text-warning mt-0.5">{limitNotice}</p>
              )}
              {highlightedIds && highlightedIds.size > 0 && (
                <p className="text-info mt-0.5">
                  {highlightedIds.size} selected
                </p>
              )}
            </div>

            <div className="absolute top-4 right-4 flex gap-2 items-center">
              {highlightedIds && (
                <Button
                  size="sm"
                  onClick={() => {
                    setHighlightedIds(null);
                    setSelectedPath(null);
                    setSelectedNode(null);
                    setCameraTarget(null);
                  }}
                >
                  Clear selection
                </Button>
              )}
              <div className="flex items-center gap-1.5 h-8 px-2 rounded-md border border-border/50 bg-card/80 backdrop-blur-sm">
                <label
                  htmlFor="node-budget"
                  className="text-[10px] uppercase tracking-wider text-ink-soft"
                >
                  Nodes
                </label>
                <input
                  id="node-budget"
                  type="number"
                  min={GRAPH_NODE_BUDGET_STEP}
                  max={GRAPH_NODE_BUDGET_MAX}
                  step={GRAPH_NODE_BUDGET_STEP}
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  onBlur={commitBudget}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-24 bg-transparent text-right text-xs font-mono text-info outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Node budget: how many nodes to load"
                  title="How many nodes to load (5,000 steps, edges between loaded nodes follow automatically)"
                />
              </div>
              <SettingsMenu
                stage={stage}
                appearance={appearance}
                onAppearanceChange={updateAppearance}
                onAppearanceReset={resetAppearance}
                view={view}
                onViewChange={updateView}
                labels={labelsInGraph}
                edgeTypes={edgeTypesInGraph}
              />
              {onOpenSizeMap && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenSizeMap}
                  aria-label="Open the size map"
                  title="Same corpus, measured in bytes"
                >
                  {/* B14, round 3 (owner): glyph only — the Projects tab's buttons
                      carry icon-before-word and teach the glyph's meaning. */}
                  <LayoutDashboard size={15} strokeWidth={1.6} aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                title="Save this filtered view as a self-contained HTML file"
              >
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHelpOpen(true)}
                aria-label="Help"
                title="How the graph works"
              >
                ?
              </Button>
              {/* Projection cycle — the same control the static map put on its
                  zoom rail, so switching views does not mean opening Settings. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateView({
                    ...view,
                    mode:
                      VIEW_MODES[(VIEW_MODES.indexOf(view.mode) + 1) % VIEW_MODES.length],
                  })
                }
                aria-label={`View: ${VIEW_MODE_LABEL[view.mode]} — click to cycle`}
                title={`${VIEW_MODE_LABEL[view.mode]} — click to cycle projection`}
              >
                {ViewIcon && <ViewIcon />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateView({
                    ...view,
                    autoRotate: view.autoRotate === "on" ? "off" : "on",
                  })
                }
                aria-label={
                  view.autoRotate === "on" ? "Stop auto-rotate" : "Start auto-rotate"
                }
                title={
                  view.autoRotate === "on"
                    ? "Stop the camera orbit"
                    : view.autoRotate === "off"
                      ? "Start the camera orbit"
                      : "Start the camera orbit (currently idle-triggered)"
                }
              >
                {view.autoRotate === "on" ? "❚❚" : "▶"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHighlightedIds(null);
                  setSelectedPath(null);
                  setSelectedNode(null);
                  setCameraTarget(null);
                  fetchOverview(project, budget.value);
                }}
              >
                Refresh
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Right detail panel — resizable */}
      {selectedNode && filteredData && (
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
            className="border-l border-border shrink-0 h-full overflow-hidden"
            style={{ width: rightWidth, maxHeight: "100%" }}
          >
            {missedSkeleton?.ids.has(selectedNode.id) ? (
              /* Skeleton node: the standard panel (code snippet, callers) is
               * meaningless for a not-fully-indexed file — show the coverage
               * callout with its report-the-edge-case actions instead. */
              <MissedCallout
                node={selectedNode}
                project={project}
                onClose={() => {
                  setSelectedNode(null);
                  setHighlightedIds(null);
                  setSelectedPath(null);
                }}
              />
            ) : (
              <NodeDetailPanel
                node={selectedNode}
                allNodes={filteredData.nodes}
                allEdges={filteredData.edges}
                project={project}
                repoInfo={repoInfo}
                onClose={() => {
                  setSelectedNode(null);
                  setHighlightedIds(null);
                  setSelectedPath(null);
                }}
                onNavigate={handleNavigateToNode}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
