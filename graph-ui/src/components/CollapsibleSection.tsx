import type { ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Rendered in the header row, right of the title (counts, All/None links). */
  actions?: ReactNode;
  children: ReactNode;
  /** Extra classes for the wrapper — callers own their flex sizing. */
  className?: string;
}

/* A titled panel that folds down to just its header strip. Sidebar panels use
 * it so either one can be dismissed to give the other the full column: collapse
 * Filters and the folder tree grows into the space, and vice versa.
 *
 * Collapsed state unmounts the body rather than hiding it, so a collapsed panel
 * costs nothing to keep around and its scroll position resets cleanly. */

/* C7, round 3 (owner, 2026-08-01): a collapsed section leaves the column
 * entirely and docks as a vertical tab on a slim rail at the left edge — each
 * section individually. A full-width column of empty space under two collapsed
 * strips read as wasted room; the rail gives the map that width back. */
export function CollapsedRailTab({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      aria-expanded={false}
      data-rail-tab={title}
      title={`Open ${title}`}
      className="flex items-center gap-1 px-1 py-2.5 rounded text-[10px] font-medium uppercase tracking-widest text-ink-soft hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
      style={{ writingMode: "vertical-rl" }}
    >
      <span className="text-[9px] text-ink-dim rotate-90" aria-hidden="true">
        ▾
      </span>
      {title}
    </button>
  );
}
export function CollapsibleSection({
  title,
  open,
  onToggle,
  actions,
  children,
  className = "",
}: CollapsibleSectionProps) {
  return (
    /* data-collapsible is a stable hook for tests: the layout class that
       decides where a collapsed section sits lives on this wrapper, several
       levels above the header button. */
    <div data-collapsible={open ? "open" : "closed"} className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft hover:text-foreground/80 uppercase tracking-widest transition-colors min-w-0"
        >
          <span
            className={`text-[9px] text-ink-dim transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden="true"
          >
            ▾
          </span>
          <span className="truncate">{title}</span>
        </button>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {/* The body is a flex child that must GROW, not merely exist.
           Rendering `children` bare left it sized to its own content, so a section
           told to take the whole column (`flex-1`, once its neighbour folded away)
           did take it — and then left the height unused below the content. The
           space was allocated and then wasted, which looks exactly like the space
           never having been given. min-h-0 keeps the inner ScrollArea able to
           shrink instead of pushing the section past the column. */}
      {open && <div className="flex-1 min-h-0 flex flex-col">{children}</div>}
    </div>
  );
}
