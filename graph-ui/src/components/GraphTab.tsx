import { useEffect, useState, useCallback, useMemo } from "react";
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
  loadDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from "../lib/density";
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
import { ResizeHandle } from "./ResizeHandle";
import { ErrorBoundary } from "./ErrorBoundary";
import { CollapsibleSection } from "./CollapsibleSection";
import { Breadcrumb } from "./Breadcrumb";
import { HelpModal } from "./HelpModal";
import type { GraphNode, GraphData, RepoInfo } from "../lib/types";
import { colorForLabel, colorForStatus, setLabelColorOverrides } from "../lib/colors";
import { downloadStaticPage } from "../lib/exportStatic";
import { resolvedTheme, themeVar } from "../lib/theme";
import { stageForTheme } from "../lib/sceneInk";

/* Persist panel widths */
function loadWidth(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v) return Math.max(150, Math.min(600, parseInt(v, 10)));
  } catch { /* ignore */ }
  return fallback;
}
function saveWidth(key: string, value: number) {
  try { localStorage.setItem(key, String(Math.round(value))); } catch { /* ignore */ }
}

/* Persist which sidebar panels are open */
function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch { /* ignore */ }
  return fallback;
}
function saveFlag(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* ignore */ }
}

/* Persist the node budget per project */
function budgetKey(project: string): string {
  return `cbm-node-budget:${project}`;
}
function loadNodeBudget(project: string): number {
  try {
    const v = localStorage.getItem(budgetKey(project));
    if (v) return clampNodeBudget(parseInt(v, 10));
  } catch { /* ignore */ }
  return GRAPH_RENDER_NODE_LIMIT;
}
function saveNodeBudget(project: string, value: number) {
  try { localStorage.setItem(budgetKey(project), String(value)); } catch { /* ignore */ }
}

interface GraphTabProps {
  project: string | null;
}

export function formatGraphLimitNotice(data: GraphData | null): string | null {
  if (!data || data.total_nodes <= data.nodes.length) return null;
  return `Showing ${data.nodes.length.toLocaleString("en-US")} of ${data.total_nodes.toLocaleString("en-US")} nodes (${data.edges.length.toLocaleString("en-US")} edges). Raise the node budget or use filters.`;
}

export function GraphTab({ project }: GraphTabProps) {
  const { data, loading, error, progress, fetchOverview } = useGraphData();
  const [highlightedIds, setHighlightedIds] = useState<Set<number> | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [display, setDisplay] = useState<DisplaySettings>(() =>
    loadDisplaySettings(),
  );
  const updateDisplay = useCallback((next: DisplaySettings) => {
    setDisplay(next);
    saveDisplaySettings(next);
  }, []);
  const [view, setView] = useState<ViewSettings>(() => loadViewSettings());
  const updateView = useCallback((next: ViewSettings) => {
    setView(next);
    saveViewSettings(next);
    setLabelColorOverrides(next.labelColors);
  }, []);
  /* Colour overrides live in module state so non-React callers see them too —
   * install the persisted set once at mount. */
  useEffect(() => {
    setLabelColorOverrides(view.labelColors);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
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

  /* Dead-code view: recolor by status + status-based filters */
  const [deadCodeView, setDeadCodeView] = useState(false);
  const [showOnlyDead, setShowOnlyDead] = useState(false);
  const [hideEntryPoints, setHideEntryPoints] = useState(false);
  const [hideTests, setHideTests] = useState(false);

  /* Initialize filters when data loads */
  useEffect(() => {
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
  }, [data]);

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

    const nodes = data.nodes.filter(keep).map(paint);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter(
      (e) =>
        enabledEdgeTypes.has(e.type) &&
        nodeIds.has(e.source) &&
        nodeIds.has(e.target),
    );

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
  ]);

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
    setCameraTarget(computeCameraTarget(viewData.nodes, all));
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
    view.pathLightColorMode === "strand"
      ? ""
      : view.pathLightColorMode === "theme"
        ? themeVar("--color-primary", "#ffce6e")
        : view.pathLightColor;

  const labelsInGraph = useMemo(
    () => (data ? [...new Set(data.nodes.map((n) => n.label))] : []),
    [data],
  );

  const handleExport = useCallback(() => {
    if (!viewData || !project) return;
    const labelColors: Record<string, string> = {};
    for (const label of new Set(viewData.nodes.map((n) => n.label))) {
      labelColors[label] = view.labelColors[label] ?? colorForLabel(label);
    }
    downloadStaticPage({
      project,
      nodes: viewData.nodes,
      edges: viewData.edges,
      theme: resolvedTheme(),
      labelColors,
      generatedAt: new Date().toISOString(),
    });
  }, [viewData, project, view.labelColors]);

  /* Re-read the persisted budget when the project changes… */
  useEffect(() => {
    if (project) {
      const value = loadNodeBudget(project);
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
      setCameraTarget(computeCameraTarget(filteredData.nodes, nodeIds));
    },
    [filteredData],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (!filteredData) return;
      setSelectedNode(node);

      /* Highlight the node and its direct connections */
      const connectedIds = new Set([node.id]);
      for (const edge of filteredData.edges) {
        if (edge.source === node.id) connectedIds.add(edge.target);
        if (edge.target === node.id) connectedIds.add(edge.source);
      }
      setHighlightedIds(connectedIds);
      setSelectedPath(node.file_path ?? null);
      setCameraTarget(computeCameraTarget(filteredData.nodes, connectedIds));
    },
    [filteredData],
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
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((type: string) => {
    setEnabledEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

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
  }, [data]);

  const disableAll = useCallback(() => {
    setEnabledLabels(new Set());
    setEnabledEdgeTypes(new Set());
  }, []);

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
    <div className="h-full flex">
      {/* Left sidebar — resizable */}
      <div
        className="border-r border-border/30 flex flex-col h-full bg-sidebar/90 backdrop-blur-md shrink-0"
        style={{ width: leftWidth }}
      >
        {/* Filters at the top, folders below — either can fold away to give the
            other the whole column. */}
        <CollapsibleSection
          title="Filters"
          open={filtersOpen}
          onToggle={() =>
            setFiltersOpen((v) => {
              saveFlag("cbm-filters-open", !v);
              return !v;
            })
          }
          className={`border-b border-border/40 ${filtersOpen ? "max-h-[55%] shrink-0" : "shrink-0"}`}
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
          />
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
          className={foldersOpen ? "flex-1" : "shrink-0"}
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
                highlightedIds={highlightedIds}
                cameraTarget={cameraTarget}
                showLabels={showLabels}
                display={display}
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
                edgeCurve={display.edgeCurve}
                background={canvasBg}
              />
            </ErrorBoundary>

            {crumbs.length > 0 && (
              <Breadcrumb crumbs={crumbs} root={project} onSelect={handleSelectPath} />
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
                display={display}
                onDisplayChange={updateDisplay}
                view={view}
                onViewChange={updateView}
                labels={labelsInGraph}
              />
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
          </div>
        </>
      )}
    </div>
  );
}
