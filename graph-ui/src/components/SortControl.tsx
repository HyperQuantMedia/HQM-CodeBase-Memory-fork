import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUp01,
  ArrowUpAZ,
  ArrowUpNarrowWide,
} from "lucide-react";
import {
  nextSort,
  sortActionLabel,
  type SortKey,
  type SortOrder,
} from "../lib/sortOrder";

interface SortControlProps {
  /** Named in the tooltip and the accessible label, e.g. "node types". */
  listName: string;
  order: SortOrder;
  onChange: (next: SortOrder) => void;
  /** Which sort keys this list offers. Defaults to the filter-chip pair. */
  keys?: SortKey[];
  className?: string;
}

/* One button per sort key, each carrying its own direction in its glyph:
 * A↓Z / Z↓A for names, 0↓1 / 1↓0 for counts, wide↓narrow for sizes. The active
 * key is lit.
 *
 * One button per key rather than one cycling through all states: a single control
 * would make "sort by name" and "reverse" the same gesture, so getting from
 * count-descending to A–Z would take an unknown number of clicks. Here the key is
 * the button and the direction is the repeat click. */
export function SortControl({
  listName,
  order,
  onChange,
  keys: keyList = ["name", "count"],
  className = "",
}: SortControlProps) {
  const iconFor = (key: SortKey): typeof ArrowDownAZ => {
    const activeAsc = order.key === key && order.dir === "asc";
    const activeDesc = order.key === key && order.dir === "desc";
    if (key === "name") {
      /* The arrow shows the direction a click *produces*, matching the label. */
      return activeDesc ? ArrowUpAZ : ArrowDownAZ;
    }
    if (key === "size") {
      return activeAsc ? ArrowUpNarrowWide : ArrowDownWideNarrow;
    }
    return activeAsc ? ArrowUp01 : ArrowDown01;
  };
  const keys: { key: SortKey; Icon: typeof ArrowDownAZ }[] = keyList.map((key) => ({
    key,
    Icon: iconFor(key),
  }));

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {keys.map(({ key, Icon }) => {
        const active = order.key === key;
        const label = sortActionLabel(listName, key, order);
        return (
          <button
            key={key}
            onClick={() => onChange(nextSort(order, key))}
            aria-label={label}
            aria-pressed={active}
            title={label}
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
  );
}
