/* Persisted panel geometry and fold state, shared by the graph and size tabs.
 *
 * These lived as private helpers in GraphTab. They moved here when the size map
 * grew the same two-panel shell, because the two tabs should not merely *look*
 * alike — they should read and write the same keys, so dragging the sidebar wider
 * on one tab and switching to the other does not jump the layout. Consistency that
 * depends on two copies staying in step is not consistency. */

/* Clamped on read, not only on drag: a hand-edited or stale stored value would
 * otherwise be able to leave a panel wider than the window. */
export const PANEL_MIN_W = 150;
export const PANEL_MAX_W = 600;

export function loadWidth(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, n));
    }
  } catch { /* ignore */ }
  return fallback;
}

export function saveWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* private mode / quota — the width just does not persist */
  }
}

/* C10: ONE node budget per project, shared by the graph and the size map — the
 * backlog's "should the size map share the graph's node budget?" closed yes.
 * The key is the graph tab's historical one, so nothing a user already set is
 * lost. The clamp is the caller's (each view names its own grid), and an absent
 * stored value falls back to the view's own default: sharing the SETTING is the
 * ruling; the two defaults predate it and differ (graph 5,000 · size 8,000). */
export function loadNodeBudget(
  project: string,
  fallback: number,
  clamp: (v: number) => number,
): number {
  try {
    const v = localStorage.getItem(`cbm-node-budget:${project}`);
    if (v) return clamp(parseInt(v, 10));
  } catch { /* ignore */ }
  return fallback;
}

export function saveNodeBudget(project: string, value: number) {
  try {
    localStorage.setItem(`cbm-node-budget:${project}`, String(value));
  } catch { /* private mode / quota — the budget just does not persist */ }
}

/* A3a: per-project filter persistence. What is stored is the DISABLED set —
 * the default is everything-on, and storing exclusions means a label or edge
 * type that appears for the first time is visible immediately instead of
 * silently filtered by a stale allowlist. Generalises the node-budget
 * precedent: templated per-project key, guarded round-trip, clamp-on-read
 * (here: strings only). Filters are per-project by the A3a ruling; theme,
 * panel widths, sort orders and projection stay global. */
export function loadDisabledSet(kind: string, project: string): Set<string> {
  try {
    const raw = localStorage.getItem(`cbm-disabled-${kind}:${project}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === "string"));
      }
    }
  } catch { /* ignore */ }
  return new Set();
}

export function saveDisabledSet(kind: string, project: string, disabled: Set<string>) {
  try {
    localStorage.setItem(`cbm-disabled-${kind}:${project}`, JSON.stringify([...disabled]));
  } catch { /* private mode / quota — the filters just do not persist */ }
}

export function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch { /* ignore */ }
  return fallback;
}

export function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* as above */
  }
}
