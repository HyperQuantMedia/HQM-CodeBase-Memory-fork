/* Sort order for the sidebar's grouped lists — node types, relationship types,
 * and the folder tree.
 *
 * Every one of those lists has exactly two useful orderings and they answer
 * different questions: alphabetical is for *finding* a name you already know,
 * by-count is for *seeing* which types dominate the corpus. Hard-coding
 * count-descending (which is what all three did) serves the second question and
 * makes the first a scan of thirty unordered chips.
 *
 * Each list owns its own order, deliberately: node types and relationship types
 * are read for different reasons in the same glance, and pinning them together
 * means one of the two is always in the wrong order. */

export type SortKey = "name" | "count";
export type SortDir = "asc" | "desc";

export interface SortOrder {
  key: SortKey;
  dir: SortDir;
}

/* Count-descending: the corpus profile is what a filter panel is first read for,
 * and it is the order these lists already had. */
export const DEFAULT_SORT: SortOrder = { key: "count", dir: "desc" };

/* Each key's natural first direction. Alphabetical opens at A–Z; counts open at
 * largest-first, because "what is there most of" is the question that made
 * someone click the count button. */
const FIRST_DIR: Record<SortKey, SortDir> = { name: "asc", count: "desc" };

/* Clicking the active key flips its direction; clicking the other key switches
 * to it at its own natural direction rather than inheriting the previous one —
 * carrying "descending" from counts over to names lands on Z–A, which nobody
 * asked for. */
export function nextSort(current: SortOrder, key: SortKey): SortOrder {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: FIRST_DIR[key] };
}

/* Sort a copy by the given order. Ties break on the other field so the result is
 * total: two types with the same count keep a stable alphabetical order instead
 * of shuffling with whatever order the Map happened to yield. */
export function sortByOrder<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  countOf: (item: T) => number,
  order: SortOrder,
): T[] {
  const sign = order.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (order.key === "name") {
      const byName = nameOf(a).localeCompare(nameOf(b));
      if (byName !== 0) return sign * byName;
      return countOf(b) - countOf(a);
    }
    const byCount = countOf(a) - countOf(b);
    if (byCount !== 0) return sign * byCount;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

/* localStorage round-trip. A stored value from an older build (or a hand-edited
 * one) is ignored rather than trusted — an unknown key would silently sort by
 * nothing. */
export function loadSort(key: string, fallback: SortOrder = DEFAULT_SORT): SortOrder {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SortOrder>;
    if (
      (parsed.key === "name" || parsed.key === "count") &&
      (parsed.dir === "asc" || parsed.dir === "desc")
    ) {
      return { key: parsed.key, dir: parsed.dir };
    }
  } catch {
    /* no storage, or unparseable */
  }
  return fallback;
}

export function saveSort(key: string, order: SortOrder) {
  try {
    window.localStorage.setItem(key, JSON.stringify(order));
  } catch {
    /* private mode / quota — the order just does not persist */
  }
}

/* Accessible name for a sort button. Says what a click *does*, not what the
 * current state is, because that is what a screen-reader user is choosing. */
export function sortActionLabel(
  listName: string,
  key: SortKey,
  current: SortOrder,
): string {
  const next = nextSort(current, key);
  const how =
    next.key === "name"
      ? next.dir === "asc"
        ? "A to Z"
        : "Z to A"
      : next.dir === "asc"
        ? "fewest first"
        : "most first";
  return `Sort ${listName} by ${next.key === "name" ? "name" : "count"}, ${how}`;
}
