import { useCallback, useMemo, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, type SizeNode } from "../lib/sizeMap";
import { fileKind, KIND_COLORS } from "../lib/fileKind";
import { OpenButtons } from "./OpenButtons";
import { SortControl } from "./SortControl";
import { loadSort, saveSort, sortByOrder, type SortOrder } from "../lib/sortOrder";

/* The size map's folder browser — the left panel's second section, and the exact
 * counterpart of the graph tab's Folders tree.
 *
 * Same shape, same controls, same gestures; only the measure differs. Where the
 * graph tree counts nodes beneath a folder, this one weighs bytes, and the row's
 * trailing figure is a size rather than a count. Keeping the two apart as separate
 * components rather than generalising one: the graph tree walks GraphNode lists and
 * derives its directories, while the size tree is *given* a directory tree by the
 * API, and folding those two traversals together would leave a component that does
 * neither cleanly.
 *
 * Search, sort and the folders/files scope chips behave identically to the graph
 * side — see Sidebar.tsx for why the scope chips exist. */

interface SizeTreeProps {
  /** Subtree currently in view — the same node the map is drawing. */
  root: SizeNode | null;
  /** Focused path, so the row for it reads as selected. */
  focus: string;
  /** The picked node, if any, so its row reads as selected too. */
  pickedPath: string | null;
  /** Folders drill the map; files open the detail panel. */
  onFocus: (path: string) => void;
  onPick: (node: SizeNode) => void;
  project: string | null;
}

type ScopeKind = "folders" | "files";

/* Every descendant of `root`, flattened, for the search to run over. Capped
 * because a 26k-file corpus has no readable flat list and the cap is reported. */
const SEARCH_LIMIT = 60;

function collectAll(node: SizeNode, into: SizeNode[] = []): SizeNode[] {
  for (const child of node.children) {
    into.push(child);
    collectAll(child, into);
  }
  return into;
}

function TreeRow({
  node,
  depth,
  focus,
  pickedPath,
  onFocus,
  onPick,
  project,
  order,
}: {
  node: SizeNode;
  depth: number;
  focus: string;
  pickedPath: string | null;
  onFocus: (path: string) => void;
  onPick: (node: SizeNode) => void;
  project: string | null;
  order: SortOrder;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = node.children.length > 0;
  const selected = isFolder ? focus === node.path : pickedPath === node.path;
  const children = useMemo(
    () => sortByOrder(node.children, (c) => c.name, (c) => c.bytes, order),
    [node.children, order],
  );

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 transition-colors ${
          selected ? "bg-primary/10" : "hover:bg-foreground/[0.03]"
        }`}
      >
        <button
          onClick={() => {
            if (isFolder) {
              setExpanded((v) => !v);
              onFocus(node.path);
            } else {
              onPick(node);
            }
          }}
          className={`flex items-center gap-1.5 flex-1 min-w-0 text-left py-[5px] text-[12px] ${
            selected ? "text-primary" : "text-foreground/60 hover:text-foreground/80"
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <span className="text-ink-faint w-3 text-center text-[10px] shrink-0">
            {isFolder ? (expanded ? "▾" : "▸") : ""}
          </span>
          {isFolder ? (
            <span className="truncate font-medium">{node.name}</span>
          ) : (
            <>
              <span
                className="w-[5px] h-[5px] rounded-full shrink-0"
                style={{ backgroundColor: KIND_COLORS[fileKind(node.path)] }}
              />
              <span className="truncate font-mono">{node.name}</span>
            </>
          )}
          <span className="text-ink-faint ml-auto text-[10px] tabular-nums shrink-0">
            {formatBytes(node.bytes)}
          </span>
        </button>
        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <OpenButtons project={project} path={node.path} isFolder={isFolder} compact />
        </span>
      </div>
      {expanded &&
        children.map((c) => (
          <TreeRow
            key={c.path}
            node={c}
            depth={depth + 1}
            focus={focus}
            pickedPath={pickedPath}
            onFocus={onFocus}
            onPick={onPick}
            project={project}
            order={order}
          />
        ))}
    </div>
  );
}

export function SizeTree({
  root,
  focus,
  pickedPath,
  onFocus,
  onPick,
  project,
}: SizeTreeProps) {
  const [search, setSearch] = useState("");
  /* Bytes-descending by default — the shared DEFAULT_SORT. "What is big in here" is
   * the question this panel is opened for, and it mirrors the graph tree opening on
   * count-descending; `count` is the magnitude field either way. */
  const [order, setOrder] = useState<SortOrder>(() => loadSort("cbm-sort-size-tree"));
  const [scope, setScope] = useState<ScopeKind | null>(null);

  const changeOrder = useCallback((next: SortOrder) => {
    saveSort("cbm-sort-size-tree", next);
    setOrder(next);
  }, []);
  const toggleScope = useCallback((kind: ScopeKind) => {
    setScope((prev) => (prev === kind ? null : kind));
  }, []);

  const topLevel = useMemo(
    () =>
      root ? sortByOrder(root.children, (c) => c.name, (c) => c.bytes, order) : [],
    [root, order],
  );

  const hits = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!root || needle === "") return null;
    const matched = collectAll(root).filter((n) => {
      if (scope === "folders" && n.children.length === 0) return false;
      if (scope === "files" && n.children.length > 0) return false;
      return (
        n.name.toLowerCase().includes(needle) || n.path.toLowerCase().includes(needle)
      );
    });
    /* Heaviest first — a substring search over a size map is still a size question. */
    const ranked = sortByOrder(matched, (n) => n.name, (n) => n.bytes, {
      key: "count",
      dir: "desc",
    });
    return { rows: ranked.slice(0, SEARCH_LIMIT), total: ranked.length };
  }, [root, search, scope]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1.5 px-3 pb-2.5 border-b border-border/30 shrink-0">
        <input
          type="text"
          placeholder="Search this subtree…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 bg-foreground/[0.04] border border-border/50 rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder-foreground/25 outline-none focus:border-primary/40 focus:bg-foreground/[0.06] transition-all"
          title="Case-insensitive substring match over name and path"
        />
        <SortControl
          listName="this subtree"
          order={order}
          onChange={changeOrder}
          className="shrink-0"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          {(
            [
              { kind: "folders" as ScopeKind, Icon: Folder, label: "Search folders only" },
              { kind: "files" as ScopeKind, Icon: FileText, label: "Search files only" },
            ]
          ).map(({ kind, Icon, label }) => {
            const active = scope === kind;
            return (
              <button
                key={kind}
                onClick={() => toggleScope(kind)}
                aria-label={active ? `${label} (on — click to search both)` : label}
                aria-pressed={active}
                title={active ? `${label} — click to search both` : label}
                className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-ink-faint hover:text-ink-soft hover:bg-foreground/[0.05]"
                }`}
              >
                <Icon size={13} strokeWidth={1.7} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {hits ? (
            hits.rows.length === 0 ? (
              <p className="text-ink-faint text-[12px] px-4 py-6 text-center">
                No matches
              </p>
            ) : (
              <>
                {hits.rows.map((n) => (
                  <div
                    key={n.path}
                    className="group flex items-center gap-1 pr-2 hover:bg-foreground/[0.03] transition-colors"
                  >
                    <button
                      onClick={() =>
                        n.children.length > 0 ? onFocus(n.path) : onPick(n)
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left px-4 py-1.5 text-[11px]"
                    >
                      {n.children.length > 0 ? (
                        <Folder
                          size={11}
                          strokeWidth={1.7}
                          className="text-ink-faint shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className="w-[5px] h-[5px] rounded-full shrink-0"
                          style={{ backgroundColor: KIND_COLORS[fileKind(n.path)] }}
                        />
                      )}
                      <span className="text-foreground/60 truncate">{n.name}</span>
                      <span className="text-ink-faint ml-auto text-[10px] tabular-nums shrink-0">
                        {formatBytes(n.bytes)}
                      </span>
                    </button>
                    <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <OpenButtons
                        project={project}
                        path={n.path}
                        isFolder={n.children.length > 0}
                        compact
                      />
                    </span>
                  </div>
                ))}
                {/* No silent truncation: a capped list that says nothing reads as the
                    whole answer. */}
                {hits.total > hits.rows.length && (
                  <p className="text-ink-faint text-[10px] px-4 py-2 text-center">
                    showing {hits.rows.length} of {hits.total.toLocaleString()} matches
                  </p>
                )}
              </>
            )
          ) : (
            topLevel.map((c) => (
              <TreeRow
                key={c.path}
                node={c}
                depth={0}
                focus={focus}
                pickedPath={pickedPath}
                onFocus={onFocus}
                onPick={onPick}
                project={project}
                order={order}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
