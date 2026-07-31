/* Graph data types matching the C layout3d.c JSON output */

export interface GraphNode {
  id: number;
  x: number;
  y: number;
  z: number;
  label: string;
  name: string;
  file_path?: string;
  qualified_name?: string;
  start_line?: number;
  end_line?: number;
  size: number;
  color: string;
  /* Dead-code classification from the backend layout (layout3d.c). */
  status?: NodeStatus;
  in_calls?: number;
}

export type NodeStatus =
  | "dead"
  | "single"
  | "entry"
  | "test"
  | "exported"
  | "normal"
  | "structural";

/* Git remote metadata for building GitHub deep-links (/api/repo-info). */
export interface RepoInfo {
  root_path: string;
  branch: string;
  remote_url: string;
  web_base: string; /* e.g. github.com/<org>/<repo> */
  blob_base: string; /* e.g. github.com/<org>/<repo>/blob/<branch> */
}

export interface GraphEdge {
  source: number;
  target: number;
  type: string;
}

export interface LinkedProject {
  project: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  offset: { x: number; y: number; z: number };
  cross_edges: GraphEdge[];
}

/* Missed-graph skeleton: the file structure of files the parser could not fully
 * cover, laid out as a satellite cluster beside the code galaxy (server-computed
 * offset, same shape as LinkedProject's). Ported from upstream's #963.
 *
 * ── Three states, and the words that keep them apart ──
 *
 * "The index did not see this" is three different facts, and two surfaces here report
 * two of them. Conflating any pair is how a view ends up contradicting its neighbour
 * about the same corpus:
 *
 * 1. **Not walked** — excluded by an ignore rule, or outside the root. On no surface;
 *    the walk never produced it. `index_repository`'s `excluded` counts it.
 * 2. **Not present in the index** — walked, but not stored. This is what the size
 *    view's `source=disk` vs `source=indexed` difference measures, and it answers
 *    *how much*: the 25 GB tree whose indexed byte total was 496 MB was this state,
 *    98% of it. Say **"not indexed"**.
 * 3. **Indexed, but not fully parsed** — stored, and the parser recovered only part
 *    of it. That is what this skeleton holds, and it answers *which files*. Say
 *    **"not fully parsed"**, never "not fully indexed": these files ARE indexed, and
 *    borrowing state 2's words is exactly the contradiction — the size view would be
 *    reporting bytes as indexed while the graph called the same files unindexed.
 *
 * A file in state 3 is in the size view's indexed total, correctly. A file in state 2
 * is absent from this skeleton, also correctly — there is no parse coverage to be
 * partial about. Both statements can be true at once, which is the point. */
export interface MissedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  offset: { x: number; y: number; z: number };
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes: number;
  linked_projects?: LinkedProject[];
  missed_graph?: MissedGraph;
}

export interface Project {
  name: string;
  root_path: string;
  indexed_at: string;
}

export interface SchemaInfo {
  node_labels: { label: string; count: number }[];
  edge_types: { type: string; count: number }[];
  total_nodes: number;
  total_edges: number;
}

export type TabId = "graph" | "stats" | "sizes" | "control";

export interface ProcessInfo {
  pid: number;
  cpu: number;
  rss_mb: number;
  elapsed: string;
  command: string;
  is_self: boolean;
}
