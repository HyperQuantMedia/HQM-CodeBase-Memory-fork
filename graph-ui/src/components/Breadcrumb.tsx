import type { Crumb } from "../lib/viewLayout";

interface BreadcrumbProps {
  crumbs: Crumb[];
  /** Project name, shown as the leading (root) segment. */
  root: string;
  onSelect: (path: string, nodeIds: Set<number>) => void;
}

/* Ancestor chain of the current selection, above the graph. Cartograph
 * otherwise buries a node's location in the detail panel's path text; this makes
 * the chain itself navigable — click any level to select that whole subtree. */
export function Breadcrumb({ crumbs, root, onSelect }: BreadcrumbProps) {
  if (crumbs.length === 0) return null;

  /* Deep chains would push the graph off screen — keep the head and the last
   * few levels, elide the middle. */
  const MAX = 6;
  const shown =
    crumbs.length <= MAX
      ? crumbs.map((c) => ({ crumb: c, elided: false }))
      : [
          { crumb: crumbs[0], elided: false },
          { crumb: crumbs[0], elided: true },
          ...crumbs.slice(crumbs.length - (MAX - 2)).map((c) => ({ crumb: c, elided: false })),
        ];

  return (
    <nav
      aria-label="Selection path"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[70%] flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/50 bg-card/85 backdrop-blur-md text-[11px] overflow-hidden"
    >
      <span className="text-foreground/40 shrink-0 truncate max-w-[140px]" title={root}>
        {root}
      </span>
      {shown.map(({ crumb, elided }, i) => {
        const last = i === shown.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1 min-w-0">
            <span className="text-foreground/20 shrink-0" aria-hidden="true">
              ›
            </span>
            {elided ? (
              <span className="text-foreground/30 shrink-0">…</span>
            ) : (
              <button
                onClick={() =>
                  onSelect(crumb.label, new Set(crumb.subtreeIds))
                }
                className={`truncate transition-colors ${
                  last
                    ? "text-foreground font-medium"
                    : "text-foreground/50 hover:text-primary"
                }`}
                title={`${crumb.label} — ${crumb.subtreeIds.length.toLocaleString()} node(s)`}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
