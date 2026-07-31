import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Activity, Boxes, LayoutDashboard } from "lucide-react";
import { GraphTabIcon } from "./components/TabIcons";
import { GraphTab } from "./components/GraphTab";
import { StatsTab } from "./components/StatsTab";
import { ControlTab } from "./components/ControlTab";
import { SizeTab } from "./components/SizeTab";
import type { TabId } from "./lib/types";
import { useUiMessages } from "./lib/i18n";
import { ThemeToggle } from "./components/ThemeToggle";
import { BREADCRUMB_SLOT_ID } from "./components/Breadcrumb";
import { initTheme } from "./lib/theme";

const TAB_IDS: TabId[] = ["stats", "graph", "sizes", "control"];

/* Tabs that render one project's corpus, so they are unreachable until one is
 * picked. Diagnostics is server-wide and Projects is the picker itself. */
const PROJECT_TABS: TabId[] = ["graph", "sizes"];

interface RouteState {
  tab: TabId;
  project: string | null;
}

/* Read the active tab + selected project from the URL query string so the
 * current view survives refreshes and can be bookmarked or shared. */
function readRoute(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab");
  const tab = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : "stats";
  const project = params.get("project");
  return { tab, project: project ? project : null };
}

/* Build the canonical URL for a route, preserving the path and hash. */
function routeUrl(tab: TabId, project: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (project) params.set("project", project);
  return `${window.location.pathname}?${params.toString()}${window.location.hash}`;
}

export function App() {
  const t = useUiMessages();
  const [route, setRoute] = useState<RouteState>(readRoute);
  const { tab: activeTab, project: selectedProject } = route;

  /* Normalize the URL on first load so it always carries the current route. */
  useEffect(() => {
    const initial = readRoute();
    window.history.replaceState(null, "", routeUrl(initial.tab, initial.project));
  }, []);

  /* Restore a stored theme choice; absent one, the page follows the OS. */
  useEffect(() => {
    initTheme();
  }, []);

  /* Sync state when the user navigates with the browser back/forward buttons. */
  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /* Change the route and push a history entry (skips no-op navigations). */
  const navigate = useCallback((tab: TabId, project: string | null) => {
    const url = routeUrl(tab, project);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url === current) return;
    window.history.pushState(null, "", url);
    setRoute({ tab, project });
  }, []);

  /* Icons, not words. The four labels ran to "Relationship Graph" and "SizeMap
     Graph" — two long phrases sharing a word, which reads as text to parse
     rather than a place to recognise, and ate the header width the breadcrumb
     needs. Same call already made for the projection toolbar (ViewModeIcons).
     Each glyph says what the tab shows: stacked boxes for the project list, a
     forking hub for relationships, unequal rectangles for the treemap, a pulse
     line for server diagnostics. The label survives as the tooltip and the
     accessible name, so nothing is lost to a screen reader or a hover.

     The graph glyph is hand-drawn (components/TabIcons.tsx) because two stock
     icons failed on it in turn: Share2 is the platform share affordance, and
     Waypoints draws a single routed path with no branching in it at all. A
     relationship graph forks; see that file for the drawing. */
  const tabs: {
    id: TabId;
    label: string;
    Icon: (props: { className?: string }) => ReactElement;
  }[] = [
    /* Pick a project, then look at it two ways, then inspect the server. The two
       graphs sit together because they are the same corpus on different axes. */
    {
      id: "stats",
      label: t.tabs.projects,
      Icon: () => <Boxes size={15} strokeWidth={1.6} aria-hidden="true" />,
    },
    { id: "graph", label: t.tabs.graph, Icon: GraphTabIcon },
    {
      id: "sizes",
      label: t.tabs.sizes,
      Icon: () => <LayoutDashboard size={15} strokeWidth={1.6} aria-hidden="true" />,
    },
    {
      id: "control",
      label: t.tabs.control,
      Icon: () => <Activity size={15} strokeWidth={1.6} aria-hidden="true" />,
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      {/* Three zones: brand + tabs, the selection breadcrumb, then project +
          theme. min-h rather than a fixed height so a deep path can wrap onto a
          second line without squeezing the clusters either side of it. */}
      <header className="flex items-start justify-between gap-4 px-5 min-h-12 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-6 h-12 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-[7px] h-[7px] rounded-full bg-primary" />
            <span className="text-[13px] font-semibold text-foreground/90 tracking-tight">
              Cartograph
            </span>
          </div>

          {/* Tabs inline in header */}
          <nav className="flex items-center gap-0.5">
            {tabs.map((tab) => {
              /* Both project views need a project. The size map was left out of
                 this check and stayed live with nothing selected, so clicking it
                 landed on its own "select a project" placeholder instead of
                 telling you up front — the greyed tab is the answer, the empty
                 pane is a detour. */
              const disabled = PROJECT_TABS.includes(tab.id) && !selectedProject;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.id, tab.id === "stats" ? null : selectedProject)}
                  disabled={disabled}
                  aria-label={tab.label}
                  title={disabled ? `${tab.label} — select a project first` : tab.label}
                  className={`flex items-center justify-center w-8 h-7 rounded-md transition-all ${
                    disabled
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : activeTab === tab.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                  }`}
                >
                  <tab.Icon />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Centre zone: GraphTab portals its selection breadcrumb in here.
            Flanked by rules so a wrapped path stays visually distinct from the
            clusters either side. */}
        <div className="flex-1 min-w-0 flex items-start justify-center gap-4 py-1.5">
          <span className="w-px self-stretch bg-border/70 shrink-0" aria-hidden="true" />
          <div
            id={BREADCRUMB_SLOT_ID}
            className="min-w-0 flex-1 flex items-start justify-center"
          />
          <span className="w-px self-stretch bg-border/70 shrink-0" aria-hidden="true" />
        </div>

        {/* Right cluster: the selected-project badge is conditional, the theme
            switch is always present. */}
        <div className="flex items-center gap-2 h-12 shrink-0">
          {selectedProject && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-foreground/[0.04] border border-border/30">
              <span className="text-[10px] text-ink-dim uppercase tracking-wider">
                {t.graph.selectedLabel}
              </span>
              <span className="text-[11px] text-primary font-mono truncate max-w-[300px]">
                {selectedProject}
              </span>
              <button
                onClick={() => navigate("stats", null)}
                className="text-ink-faint hover:text-ink-soft text-[12px] ml-1 transition-colors"
              >
                ×
              </button>
            </div>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0">
        {activeTab === "graph" ? (
          <GraphTab
            project={selectedProject}
            onOpenSizeMap={() => navigate("sizes", selectedProject)}
          />
        ) : activeTab === "sizes" ? (
          <SizeTab
            project={selectedProject}
            onOpenGraph={() => navigate("graph", selectedProject)}
          />
        ) : activeTab === "control" ? (
          <ControlTab />
        ) : (
          <StatsTab
            onSelectProject={(p) => navigate("graph", p)}
            onSelectSizeMap={(p) => navigate("sizes", p)}
          />
        )}
      </main>
    </div>
  );
}
