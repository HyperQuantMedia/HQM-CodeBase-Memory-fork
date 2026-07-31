import { useCallback, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { colorForLabel, STATUS_LEGEND } from "../lib/colors";
import type { GraphData } from "../lib/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { SortControl } from "./SortControl";
import { loadSort, saveSort, sortByOrder, type SortOrder } from "../lib/sortOrder";

interface FilterPanelProps {
  data: GraphData;
  enabledLabels: Set<string>;
  enabledEdgeTypes: Set<string>;
  showLabels: boolean;
  onToggleLabel: (label: string) => void;
  onToggleEdgeType: (type: string) => void;
  onToggleShowLabels: () => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  /* Dead-code view */
  deadCodeView: boolean;
  showOnlyDead: boolean;
  hideEntryPoints: boolean;
  hideTests: boolean;
  onToggleDeadCodeView: () => void;
  onToggleShowOnlyDead: () => void;
  onToggleHideEntryPoints: () => void;
  onToggleHideTests: () => void;
  /* Drop nodes that no enabled relationship touches. */
  hideUnlinked: boolean;
  /** How many nodes that would remove right now. */
  unlinkedCount: number;
  onToggleHideUnlinked: () => void;
  /* Missed skeleton: satellite cluster of files the indexer could not fully
   * cover. Its own toggle rather than a filter chip, because it adds a second
   * cluster to the scene instead of narrowing the one already there. */
  missedView: boolean;
  missedCount: number;
  onToggleMissedView: () => void;
}

/* Checkbox row matching the existing "Show labels" toggle style */
function CheckRow({
  checked,
  onToggle,
  label,
  count,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 text-[11px] font-medium transition-all ${
        checked ? "text-primary" : "text-ink-soft"
      }`}
    >
      <span
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
          checked ? "border-primary bg-primary/20" : "border-foreground/15"
        }`}
      >
        {checked && <span className="text-primary text-[9px]">✓</span>}
      </span>
      {label}
      {count !== undefined && (
        <span className="text-ink-dim tabular-nums">{count.toLocaleString()}</span>
      )}
    </button>
  );
}

export function FilterPanel({
  data,
  enabledLabels,
  enabledEdgeTypes,
  showLabels,
  onToggleLabel,
  onToggleEdgeType,
  onToggleShowLabels,
  onEnableAll,
  onDisableAll,
  deadCodeView,
  showOnlyDead,
  hideEntryPoints,
  hideTests,
  onToggleDeadCodeView,
  onToggleShowOnlyDead,
  onToggleHideEntryPoints,
  onToggleHideTests,
  hideUnlinked,
  unlinkedCount,
  onToggleHideUnlinked,
  missedView,
  missedCount,
  onToggleMissedView,
}: FilterPanelProps) {
  /* Dead code folds independently of the filter chips — it is a different job
   * (a code-health lens, not a type filter). Open by default: it was always
   * visible before this panel became collapsible, and the ask was to make it
   * foldable, not to hide it. */
  const [deadOpen, setDeadOpen] = useState(true);

  /* One order per list. Node types and relationship types are read for different
   * reasons in the same glance, so a shared control would always have one of them
   * in the wrong order. Both persist. */
  const [labelSort, setLabelSort] = useState<SortOrder>(() =>
    loadSort("cbm-sort-node-types"),
  );
  const [edgeSort, setEdgeSort] = useState<SortOrder>(() =>
    loadSort("cbm-sort-edge-types"),
  );

  const changeLabelSort = useCallback((next: SortOrder) => {
    saveSort("cbm-sort-node-types", next);
    setLabelSort(next);
  }, []);
  const changeEdgeSort = useCallback((next: SortOrder) => {
    saveSort("cbm-sort-edge-types", next);
    setEdgeSort(next);
  }, []);

  /* Counting and ordering are split so a sort click re-sorts a few dozen entries
   * instead of re-walking every node and edge in the corpus. */
  const { labelCounts, edgeTypeCounts, statusCounts } = useMemo(() => {
    const lc = new Map<string, number>();
    for (const n of data.nodes) lc.set(n.label, (lc.get(n.label) ?? 0) + 1);
    const ec = new Map<string, number>();
    for (const e of data.edges) ec.set(e.type, (ec.get(e.type) ?? 0) + 1);
    const sc = new Map<string, number>();
    for (const n of data.nodes)
      if (n.status) sc.set(n.status, (sc.get(n.status) ?? 0) + 1);
    return {
      labelCounts: [...lc.entries()],
      edgeTypeCounts: [...ec.entries()],
      statusCounts: sc,
    };
  }, [data]);

  const sortedLabels = useMemo(
    () => sortByOrder(labelCounts, (e) => e[0], (e) => e[1], labelSort),
    [labelCounts, labelSort],
  );
  const sortedEdgeTypes = useMemo(
    () => sortByOrder(edgeTypeCounts, (e) => e[0], (e) => e[1], edgeSort),
    [edgeTypeCounts, edgeSort],
  );

  const deadCount = statusCounts.get("dead") ?? 0;

  return (
    <div className="flex flex-col min-h-0">
      {/* Enable/disable all — the section title itself lives in the
          CollapsibleSection wrapper that GraphTab supplies. */}
      <div className="flex items-center justify-end gap-2 px-4 pb-1.5 shrink-0">
        <button onClick={onEnableAll} className="text-[10px] text-primary/70 hover:text-primary transition-colors">All</button>
        <span className="text-ink-faint">|</span>
        <button onClick={onDisableAll} className="text-[10px] text-primary/70 hover:text-primary transition-colors">None</button>
      </div>

      {/* Scrollable filter groups */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 pb-3 space-y-3">
          {/* Node types */}
          {labelCounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Node types</p>
                <SortControl
                  listName="node types"
                  order={labelSort}
                  onChange={changeLabelSort}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {sortedLabels.map(([label, count]) => {
                  const on = enabledLabels.has(label);
                  const c = colorForLabel(label);
                  return (
                    <button
                      key={label}
                      onClick={() => onToggleLabel(label)}
                      className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[10px] font-medium transition-all border ${
                        on ? "border-border/60 bg-foreground/[0.04]" : "border-transparent opacity-25"
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: on ? c : "#7b7b7b" }} />
                      <span style={{ color: on ? c : "#8a8a8a" }}>{label}</span>
                      <span className="text-ink-faint tabular-nums">{count.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Relationships */}
          {edgeTypeCounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Relationships</p>
                <SortControl
                  listName="relationships"
                  order={edgeSort}
                  onChange={changeEdgeSort}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {sortedEdgeTypes.map(([type, count]) => {
                  const on = enabledEdgeTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => onToggleEdgeType(type)}
                      className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[10px] font-medium transition-all border ${
                        on ? "border-border/50 bg-foreground/[0.03] text-ink-soft" : "border-transparent opacity-20 text-ink-dim"
                      }`}
                    >
                      {type.replace(/_/g, " ").toLowerCase()}
                      <span className="text-ink-faint tabular-nums">{count.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Missed skeleton: satellite cluster of files the indexer could not fully
          cover, shown beside the code galaxy. Click it to focus; click the code
          galaxy to come back. Ported from upstream (their issue #963), which
          answered the same "indexed ≠ present" question our size map hit — theirs
          says *which* files were missed, ours says *how much*.

          Ink roles rather than opacity modifiers: `text-foreground/30` compiles to
          a real alpha and can never be theme-aware, so the ported markup was
          unreadable on the light stage. Layout parity with the rest of the panel is
          Phase 3's sweep, not this merge's. */}
      <div className="px-4 pt-2 border-t border-border/30 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink-dim uppercase tracking-widest">
            Partly parsed
          </span>
          {missedCount > 0 && (
            <span className="text-[10px] text-ink-soft tabular-nums">
              {missedCount.toLocaleString()} files
            </span>
          )}
        </div>
        <CheckRow
          checked={missedView}
          onToggle={onToggleMissedView}
          label="Show partly-parsed files"
          count={missedView ? undefined : missedCount}
        />
        {/* "Not fully parsed", never "not fully indexed" — these files ARE indexed,
            and the size view's indexed byte total counts them. Borrowing that word
            here would have the two views contradicting each other about the same
            corpus. The three states are named on `MissedGraph` in lib/types.ts. */}
        <p className="text-[9px] leading-snug text-ink-dim">
          {missedCount > 0
            ? "Satellite cluster = files the parser could only read in part (best-effort). Click it to focus, click the galaxy to return."
            : "Nothing known to be partly parsed (best-effort — not a completeness guarantee)."}
        </p>
      </div>

      {/* Dead-code view */}
      <div className="border-t border-border/30 shrink-0">
        <CollapsibleSection
          title="Dead code"
          open={deadOpen}
          onToggle={() => setDeadOpen((v) => !v)}
          actions={
            <span className="text-[10px] text-destructive/80 tabular-nums">
              {deadCount.toLocaleString()} dead
            </span>
          }
        >
          <div className="px-4 pb-2 space-y-2">
            <CheckRow
              checked={deadCodeView}
              onToggle={onToggleDeadCodeView}
              label="Color by status"
            />
            <CheckRow
              checked={showOnlyDead}
              onToggle={onToggleShowOnlyDead}
              label="Show only dead code"
            />
            <CheckRow
              checked={hideEntryPoints}
              onToggle={onToggleHideEntryPoints}
              label="Hide entry points"
            />
            <CheckRow checked={hideTests} onToggle={onToggleHideTests} label="Hide tests" />

            {/* Legend (only meaningful while colored by status) */}
            {deadCodeView && (
              <div className="flex flex-wrap gap-x-2 gap-y-1 pt-1">
                {STATUS_LEGEND.map((s) => (
                  <span
                    key={s.status}
                    className="inline-flex items-center gap-1 text-[9px] text-ink-soft"
                  >
                    <span
                      className="w-[6px] h-[6px] rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* Display options — pinned footer */}
      <div className="px-4 py-2.5 border-t border-border/20 shrink-0 space-y-2">
        {/* Sits with the type filters rather than under Dead code: it is the
            other half of switching a relationship off, not a code-health lens. */}
        <CheckRow
          checked={hideUnlinked}
          onToggle={onToggleHideUnlinked}
          label="Hide unlinked nodes"
          count={hideUnlinked ? undefined : unlinkedCount}
        />
        <button
          onClick={onToggleShowLabels}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-all ${
            showLabels ? "text-primary" : "text-ink-dim"
          }`}
        >
          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
            showLabels ? "border-primary bg-primary/20" : "border-foreground/15"
          }`}>
            {showLabels && <span className="text-primary text-[9px]">✓</span>}
          </span>
          Show labels
        </button>
      </div>
    </div>
  );
}
