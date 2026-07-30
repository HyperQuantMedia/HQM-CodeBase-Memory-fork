import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Crumb } from "../lib/viewLayout";

interface BreadcrumbProps {
  crumbs: Crumb[];
  /** Project name, shown as the leading (root) segment. */
  root: string;
  onSelect: (path: string, nodeIds: Set<number>) => void;
}

/** The header renders this element; the breadcrumb portals into it. */
export const BREADCRUMB_SLOT_ID = "cbm-breadcrumb-slot";

/* Ancestor chain of the current selection, each level clickable.
 *
 * It lives in the app header rather than floating over the canvas: as an
 * absolute overlay it sat on top of the toolbar and covered the Clear-selection
 * button. In the header it shares a row with the brand and the theme switch,
 * separated by rules, and a deep path wraps onto another line instead of
 * pushing the toolbar around.
 *
 * Rendered through a portal into the header's slot so the selection state can
 * stay in GraphTab where it belongs. With no slot present (unit tests) it falls
 * back to rendering in place, so behaviour stays testable without the shell. */
export function Breadcrumb({ crumbs, root, onSelect }: BreadcrumbProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById(BREADCRUMB_SLOT_ID));
  }, []);

  if (crumbs.length === 0) return null;

  const trail = (
    <nav
      aria-label="Selection path"
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[11px] leading-snug py-1"
    >
      <button
        onClick={() => onSelect("", new Set())}
        className="text-foreground/45 hover:text-primary transition-colors max-w-[180px] truncate"
        title={`${root} — clear the selection`}
      >
        {root}
      </button>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-x-1">
            <span className="text-foreground/25 select-none" aria-hidden="true">
              /
            </span>
            <button
              onClick={() => onSelect(crumb.label, new Set(crumb.subtreeIds))}
              className={`max-w-[220px] truncate transition-colors ${
                last
                  ? "text-foreground font-medium"
                  : "text-foreground/55 hover:text-primary"
              }`}
              title={`${crumb.label} — ${crumb.subtreeIds.length.toLocaleString()} node(s)`}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );

  return slot ? createPortal(trail, slot) : trail;
}
