import { useCallback, useMemo, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GraphNode } from "../lib/types";
import { useUiMessages } from "../lib/i18n";
import { matchesQuery, parseQuery, QUERY_HINTS } from "../lib/searchQuery";
import { OpenButtons } from "./OpenButtons";
import { SortControl } from "./SortControl";
import { loadSort, saveSort, sortByOrder, type SortOrder } from "../lib/sortOrder";

interface SidebarProps {
  nodes: GraphNode[];
  onSelectPath: (path: string, nodeIds: Set<number>) => void;
  selectedPath: string | null;
  /** Needed by the open-on-disk buttons; null hides them. */
  project: string | null;
}

interface DirNode {
  name: string;
  fullPath: string;
  children: Map<string, DirNode>;
  nodeIds: Set<number>;
  directNodes: GraphNode[];
}

function buildFileTree(nodes: GraphNode[]): DirNode {
  const root: DirNode = { name: "/", fullPath: "", children: new Map(), nodeIds: new Set(), directNodes: [] };
  for (const node of nodes) {
    if (!node.file_path) continue;
    const parts = node.file_path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      let child = cur.children.get(parts[i]);
      if (!child) {
        const prefix = parts.slice(0, i + 1).join("/");
        child = { name: parts[i], fullPath: prefix, children: new Map(), nodeIds: new Set(), directNodes: [] };
        cur.children.set(parts[i], child);
      }
      cur = child;
    }
    cur.directNodes.push(node);
  }
  function collect(d: DirNode): Set<number> {
    const ids = new Set<number>();
    for (const n of d.directNodes) ids.add(n.id);
    for (const c of d.children.values()) for (const id of collect(c)) ids.add(id);
    d.nodeIds = ids;
    return ids;
  }
  collect(root);
  return root;
}

/* What a substring search is allowed to return.
 *
 * The search matched graph nodes only, which meant a folder could never be a
 * result — and "where is the parser directory" is at least as common a question as
 * "where is parse()". Folders are now searchable, and the two chips narrow to one
 * kind or the other. Neither chip pressed means both, which is the old behaviour and
 * the right default. */
type ScopeKind = "folders" | "files";

/* Every folder in the tree, flattened, for the search to run over. */
function collectDirs(dir: DirNode, into: DirNode[] = []): DirNode[] {
  for (const child of dir.children.values()) {
    into.push(child);
    collectDirs(child, into);
  }
  return into;
}

function flattenSingleChild(dir: DirNode): DirNode {
  const children = new Map<string, DirNode>();
  for (const [key, child] of dir.children) {
    let flat = flattenSingleChild(child);
    while (flat.children.size === 1 && flat.directNodes.length === 0) {
      const [sk, sc] = [...flat.children.entries()][0];
      flat = { ...sc, name: `${flat.name}/${sk}`, children: flattenSingleChild(sc).children };
    }
    children.set(key, flat);
  }
  return { ...dir, children };
}

function TreeItem({ dir, depth, onSelect, selectedPath, project, order }: {
  dir: DirNode; depth: number;
  onSelect: (path: string, ids: Set<number>) => void;
  selectedPath: string | null;
  project: string | null;
  order: SortOrder;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = selectedPath === dir.fullPath;
  /* Folders carry a count (the nodes beneath them), so both orders mean something.
   * Files inside a folder have no count of their own — every one would tie — so
   * under a count sort they keep the alphabetical order the tie-break gives them,
   * which is the only ordering a flat list of files has. */
  const sorted = useMemo(
    () => sortByOrder([...dir.children.values()], (d) => d.name, (d) => d.nodeIds.size, order),
    [dir.children, order],
  );
  const sortedNodes = useMemo(
    () => sortByOrder([...dir.directNodes], (n) => n.name, () => 0, order),
    [dir.directNodes, order],
  );

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 transition-colors ${
          isSelected ? "bg-primary/10" : "hover:bg-foreground/[0.03]"
        }`}
      >
        <button
          onClick={() => { setExpanded(!expanded); onSelect(dir.fullPath, dir.nodeIds); }}
          className={`flex items-center gap-1.5 flex-1 min-w-0 text-left py-[5px] text-[12px] ${
            isSelected ? "text-primary" : "text-foreground/60 hover:text-foreground/80"
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <span className="text-ink-faint w-3 text-center text-[10px] shrink-0">
            {(dir.children.size > 0 || dir.directNodes.length > 0) ? (expanded ? "▾" : "▸") : ""}
          </span>
          <span className="truncate font-medium">{dir.name}</span>
          <span className="text-ink-faint ml-auto text-[10px] tabular-nums shrink-0">{dir.nodeIds.size}</span>
        </button>
        {/* Folder rows open the directory itself. */}
        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <OpenButtons project={project} path={dir.fullPath} isFolder compact />
        </span>
      </div>
      {expanded && (
        <>
          {sorted.map((c) => (
            <TreeItem key={c.fullPath} dir={c} depth={depth+1} onSelect={onSelect} selectedPath={selectedPath} project={project} order={order} />
          ))}
          {sortedNodes.map((gn) => (
            <div key={gn.id} className="group flex items-center gap-1 pr-2 hover:bg-foreground/[0.02] transition-colors">
              <button
                onClick={() => onSelect(dir.fullPath + "/" + gn.name, new Set([gn.id]))}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left py-[3px] text-[11px] text-ink-soft hover:text-foreground/60"
                style={{ paddingLeft: `${(depth+1) * 16 + 12}px` }}
              >
                <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: gn.color }} />
                <span className="truncate font-mono">{gn.name}</span>
                <span className="text-ink-faint ml-auto text-[10px] shrink-0">{gn.label}</span>
              </button>
              <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <OpenButtons project={project} path={gn.file_path} compact />
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function Sidebar({ nodes, onSelectPath, selectedPath, project }: SidebarProps) {
  const t = useUiMessages();
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<SortOrder>(() => loadSort("cbm-sort-folders"));
  const [scope, setScope] = useState<ScopeKind | null>(null);
  const changeOrder = useCallback((next: SortOrder) => {
    saveSort("cbm-sort-folders", next);
    setOrder(next);
  }, []);
  /* Pressing the active chip releases it — the two are exclusive, and there has to
   * be a way back to "both" without hunting for a third button. */
  const toggleScope = useCallback((kind: ScopeKind) => {
    setScope((prev) => (prev === kind ? null : kind));
  }, []);
  const tree = useMemo(() => flattenSingleChild(buildFileTree(nodes)), [nodes]);

  /* Field-aware search: plain text still matches name/path, and kind: / label: /
   * status: terms narrow by what the node is. */
  const filtered = useMemo(() => {
    const q = parseQuery(search);
    if (q.empty || scope === "folders") return null;
    return nodes.filter((n) => matchesQuery(n, q)).slice(0, 50);
  }, [nodes, search, scope]);

  /* Folder hits for the same query. Plain substring over name and path rather than
   * the field-aware parser: a folder has no kind, label or status to match on, so
   * the field terms have nothing to say about it. */
  const folderHits = useMemo(() => {
    if (scope === "files") return null;
    const needle = search.trim().toLowerCase();
    if (needle === "") return null;
    return collectDirs(tree)
      .filter(
        (d) =>
          d.name.toLowerCase().includes(needle) ||
          d.fullPath.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.nodeIds.size - a.nodeIds.size)
      .slice(0, 50);
  }, [tree, search, scope]);

  const searching = search.trim() !== "";

  const topLevel = useMemo(
    () => sortByOrder([...tree.children.values()], (d) => d.name, (d) => d.nodeIds.size, order),
    [tree.children, order],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1.5 px-3 pb-2.5 border-b border-border/30 shrink-0">
        <input
          type="text"
          placeholder={t.graph.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 bg-foreground/[0.04] border border-border/50 rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder-foreground/25 outline-none focus:border-primary/40 focus:bg-foreground/[0.06] transition-all"
          title={`Plain text matches names and paths. Field terms: ${QUERY_HINTS.join(", ")}`}
        />
        {/* Beside the search box rather than in the section header: the header's
            action slot belongs to GraphTab, and the order is a property of the
            list below, not of the panel. */}
        <SortControl listName="folders" order={order} onChange={changeOrder} className="shrink-0" />
        {/* Narrow the substring search to one kind. Next to the sort buttons because
            both shape the same list, and neither is a filter on the graph itself. */}
        <div className="flex items-center gap-0.5 shrink-0">
          {([
            { kind: "folders" as ScopeKind, Icon: Folder, label: "Search folders only" },
            { kind: "files" as ScopeKind, Icon: FileText, label: "Search files only" },
          ]).map(({ kind, Icon, label }) => {
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
          {searching ? (
            (folderHits?.length ?? 0) === 0 && (filtered?.length ?? 0) === 0 ? (
              <p className="text-ink-faint text-[12px] px-4 py-6 text-center">
                {t.common.noMatches}
              </p>
            ) : (
              <>
              {/* Folder hits first: they are the coarser answer, and clicking one
                  selects its whole subtree in the graph. */}
              {folderHits?.map((d) => (
                <div
                  key={`dir:${d.fullPath}`}
                  className="group flex items-center gap-1 pr-2 hover:bg-foreground/[0.03] transition-colors"
                >
                  <button
                    onClick={() => onSelectPath(d.fullPath, d.nodeIds)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left px-4 py-1.5 text-[11px]"
                  >
                    <Folder size={11} strokeWidth={1.7} className="text-ink-faint shrink-0" aria-hidden="true" />
                    <span className="text-foreground/60 truncate font-medium">{d.name}</span>
                    <span className="text-ink-faint text-[10px] tabular-nums shrink-0">
                      {d.nodeIds.size}
                    </span>
                    <span className="text-ink-faint ml-auto text-[10px] font-mono truncate max-w-[100px]">
                      {d.fullPath}
                    </span>
                  </button>
                  <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <OpenButtons project={project} path={d.fullPath} isFolder compact />
                  </span>
                </div>
              ))}
              {filtered?.map((n) => (
                <div key={n.id} className="group flex items-center gap-1 pr-2 hover:bg-foreground/[0.03] transition-colors">
                  <button
                    onClick={() => onSelectPath(n.file_path ?? "", new Set([n.id]))}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left px-4 py-1.5 text-[11px]"
                  >
                    <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: n.color }} />
                    <span className="text-foreground/60 truncate">{n.name}</span>
                    <span className="text-ink-faint ml-auto text-[10px] font-mono truncate max-w-[100px]">{n.file_path}</span>
                  </button>
                  <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <OpenButtons project={project} path={n.file_path} compact />
                  </span>
                </div>
              ))}
              </>
            )
          ) : (
            topLevel.map((c) => (
              <TreeItem key={c.fullPath} dir={c} depth={0} onSelect={onSelectPath} selectedPath={selectedPath} project={project} order={order} />
            ))
          )}
        </div>
      </ScrollArea>

      {selectedPath && (
        <div className="px-3 py-2 border-t border-border/30">
          <button
            onClick={() => onSelectPath("", new Set())}
            className="w-full px-3 py-1.5 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.07] text-[11px] text-ink-soft font-medium transition-all"
          >
            {t.graph.clearSelection}
          </button>
        </div>
      )}
    </div>
  );
}
