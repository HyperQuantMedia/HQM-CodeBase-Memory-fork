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
