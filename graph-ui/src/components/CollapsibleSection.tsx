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
export function CollapsibleSection({
  title,
  open,
  onToggle,
  actions,
  children,
  className = "",
}: CollapsibleSectionProps) {
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
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
      {open && children}
    </div>
  );
}
