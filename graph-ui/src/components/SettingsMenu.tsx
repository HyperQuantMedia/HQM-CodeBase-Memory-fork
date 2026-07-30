import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_LIMITS,
  type DisplaySettings,
} from "../lib/density";
import {
  DEFAULT_VIEW_SETTINGS,
  PATH_LIGHT_PRESETS,
  VIEW_LIMITS,
  type PathLightColorMode,
  type PathLightStyle,
  type ViewSettings,
} from "../lib/viewSettings";
import {
  LEAF_SHAPES,
  LEAF_SHAPE_LABEL,
  VIEW_MODES,
  VIEW_MODE_LABEL,
  type LeafShape,
  type ViewMode,
} from "../lib/viewLayout";
import { defaultColorForLabel } from "../lib/colors";

type TabId = "view" | "display" | "colors" | "animation";

const TABS: { id: TabId; label: string }[] = [
  { id: "view", label: "View" },
  { id: "display", label: "Display" },
  { id: "colors", label: "Colors" },
  { id: "animation", label: "Animation" },
];

interface SettingsMenuProps {
  display: DisplaySettings;
  onDisplayChange: (next: DisplaySettings) => void;
  view: ViewSettings;
  onViewChange: (next: ViewSettings) => void;
  /** Labels present in the loaded graph — the Colors tab lists exactly these. */
  labels: string[];
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step = 0.05,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-foreground/70">{label}</span>
        <span className="text-[10px] font-mono text-primary/80 tabular-nums">
          {format ? format(value) : `${value.toFixed(2)}×`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary cursor-pointer"
        aria-label={`${label} (${hint})`}
      />
      <p className="text-[9px] text-ink-dim mt-0.5">{hint}</p>
    </label>
  );
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-foreground/70 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="flex-1 min-w-0 bg-input border border-border/60 rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
        checked ? "text-primary" : "text-ink-soft"
      }`}
    >
      <span
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
          checked ? "border-primary bg-primary/20" : "border-foreground/20"
        }`}
      >
        {checked && <span className="text-primary text-[9px]">✓</span>}
      </span>
      {label}
    </button>
  );
}

/* Settings popover: view projection, density knobs, label colours, and the
 * path-light animation. Grown from the old display-only menu — same trigger and
 * dismissal behavior, four tabs instead of one list. */
export function SettingsMenu({
  display,
  onDisplayChange,
  view,
  onViewChange,
  labels,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("view");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setDisplay = (patch: Partial<DisplaySettings>) =>
    onDisplayChange({ ...display, ...patch });
  const setView = (patch: Partial<ViewSettings>) => onViewChange({ ...view, ...patch });
  const setLayout = (patch: Partial<ViewSettings["layout"]>) =>
    onViewChange({ ...view, layout: { ...view.layout, ...patch } });

  const displayDefault =
    display.edgeBrightness === DEFAULT_DISPLAY_SETTINGS.edgeBrightness &&
    display.nodeGlow === DEFAULT_DISPLAY_SETTINGS.nodeGlow &&
    display.bloom === DEFAULT_DISPLAY_SETTINGS.bloom &&
    display.edgeCurve === DEFAULT_DISPLAY_SETTINGS.edgeCurve;
  const viewDefault =
    view.mode === DEFAULT_VIEW_SETTINGS.mode &&
    view.fov === DEFAULT_VIEW_SETTINGS.fov &&
    view.pathLightColorMode === DEFAULT_VIEW_SETTINGS.pathLightColorMode &&
    view.pathLightAccel === DEFAULT_VIEW_SETTINGS.pathLightAccel &&
    Object.keys(view.labelColors).length === 0;
  const isDefault = displayDefault && viewDefault;

  const sortedLabels = useMemo(() => [...labels].sort((a, b) => a.localeCompare(b)), [labels]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="View, display, colors, animation"
      >
        Settings{!isDefault && <span className="ml-1 text-primary">•</span>}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute top-10 right-0 w-72 rounded-lg border border-border/60 bg-popover/98 backdrop-blur-md shadow-xl z-20 text-popover-foreground"
        >
          <div className="flex items-center gap-0.5 p-1.5 border-b border-border/40" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-1.5 py-1 rounded-md text-[10.5px] font-medium transition-colors ${
                  tab === t.id
                    ? "bg-primary/15 text-primary"
                    : "text-ink-soft hover:text-foreground/75 hover:bg-foreground/[0.04]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3.5 max-h-[70vh] overflow-auto">
            {tab === "view" && (
              <>
                <SelectRow<ViewMode>
                  label="Projection"
                  value={view.mode}
                  options={VIEW_MODES.map((m) => ({ value: m, label: VIEW_MODE_LABEL[m] }))}
                  onChange={(mode) => setView({ mode })}
                />
                {view.mode !== "default" && (
                  <SliderRow
                    label="Spacing"
                    hint="1.00× matches the node spacing of the server layout"
                    value={view.layout.spread}
                    min={VIEW_LIMITS.spread.min}
                    max={VIEW_LIMITS.spread.max}
                    onChange={(spread) => setLayout({ spread })}
                  />
                )}
                {view.mode === "cone" && (
                  <SliderRow
                    label="Cone steepness"
                    hint="Drop per level, as a fraction of that level's own width"
                    value={view.layout.coneSteep}
                    min={VIEW_LIMITS.coneSteep.min}
                    max={VIEW_LIMITS.coneSteep.max}
                    onChange={(coneSteep) => setLayout({ coneSteep })}
                  />
                )}
                {view.mode === "tree" && (
                  <>
                    <SliderRow
                      label="Branch spread"
                      hint="How wide a limb fans its children"
                      value={view.layout.branchSpread}
                      min={VIEW_LIMITS.branchSpread.min}
                      max={VIEW_LIMITS.branchSpread.max}
                      onChange={(branchSpread) => setLayout({ branchSpread })}
                    />
                    <SelectRow<LeafShape>
                      label="Leaf clusters"
                      value={view.layout.leafShape}
                      options={LEAF_SHAPES.map((v) => ({
                        value: v,
                        label: LEAF_SHAPE_LABEL[v],
                      }))}
                      onChange={(leafShape) => setLayout({ leafShape })}
                    />
                  </>
                )}
                <SliderRow
                  label="Perspective"
                  hint="Camera field of view; lower flattens, higher exaggerates depth"
                  value={view.fov}
                  min={VIEW_LIMITS.fov.min}
                  max={VIEW_LIMITS.fov.max}
                  step={1}
                  format={(v) => `${v.toFixed(0)}°`}
                  onChange={(fov) => setView({ fov })}
                />
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  Alternate projections are derived from the graph's own
                  hierarchy in the browser; Web is the server's force layout.
                  Each container becomes its own cluster, and its children
                  cluster inside that — so a folder reads as a sphere of files,
                  not a point on one big shell.
                </p>
              </>
            )}

            {tab === "display" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-soft uppercase tracking-widest">
                    Contrast
                  </span>
                  <button
                    onClick={() => onDisplayChange(DEFAULT_DISPLAY_SETTINGS)}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={displayDefault}
                  >
                    Reset
                  </button>
                </div>
                <SliderRow
                  label="Edge brightness"
                  hint="Dim the web of links on dense graphs"
                  value={display.edgeBrightness}
                  min={DISPLAY_LIMITS.edgeBrightness.min}
                  max={DISPLAY_LIMITS.edgeBrightness.max}
                  onChange={(edgeBrightness) => setDisplay({ edgeBrightness })}
                />
                <SliderRow
                  label="Node glow"
                  hint="Halo boost around each node"
                  value={display.nodeGlow}
                  min={DISPLAY_LIMITS.nodeGlow.min}
                  max={DISPLAY_LIMITS.nodeGlow.max}
                  onChange={(nodeGlow) => setDisplay({ nodeGlow })}
                />
                <SliderRow
                  label="Bloom"
                  hint="Overall glow bloom strength (dark theme only)"
                  value={display.bloom}
                  min={DISPLAY_LIMITS.bloom.min}
                  max={DISPLAY_LIMITS.bloom.max}
                  onChange={(bloom) => setDisplay({ bloom })}
                />
                <SliderRow
                  label="Link curvature"
                  hint="Bow each link outward; 0 draws straight chords"
                  value={display.edgeCurve}
                  min={DISPLAY_LIMITS.edgeCurve.min}
                  max={DISPLAY_LIMITS.edgeCurve.max}
                  onChange={(edgeCurve) => setDisplay({ edgeCurve })}
                />
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  1.00× follows the automatic density compensation. Lower the
                  edge/glow/bloom values when a large graph washes out to white.
                </p>
              </>
            )}

            {tab === "colors" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-soft uppercase tracking-widest">
                    Node labels
                  </span>
                  <button
                    onClick={() => setView({ labelColors: {} })}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={Object.keys(view.labelColors).length === 0}
                  >
                    Reset
                  </button>
                </div>
                {sortedLabels.length === 0 && (
                  <p className="text-[11px] text-ink-dim">No labels loaded.</p>
                )}
                <div className="space-y-1.5">
                  {sortedLabels.map((label) => {
                    const overridden = view.labelColors[label] !== undefined;
                    const value = view.labelColors[label] ?? defaultColorForLabel(label);
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeForPicker(value)}
                          onChange={(e) =>
                            setView({
                              labelColors: { ...view.labelColors, [label]: e.target.value },
                            })
                          }
                          className="w-6 h-6 rounded border border-border/60 bg-transparent cursor-pointer shrink-0"
                          aria-label={`${label} color`}
                        />
                        <span className="text-[11px] text-foreground/65 truncate flex-1">
                          {label}
                        </span>
                        {overridden && (
                          <button
                            onClick={() => {
                              const next = { ...view.labelColors };
                              delete next[label];
                              setView({ labelColors: next });
                            }}
                            className="text-[9px] text-ink-dim hover:text-foreground/70 transition-colors shrink-0"
                            title="Back to the palette default"
                          >
                            auto
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  Defaults are the built-in palette; unknown labels get a stable
                  generated hue. Custom colors skip the contrast checks.
                </p>
              </>
            )}

            {tab === "animation" && (
              <>
                <CheckRow
                  label="Path light on selection"
                  checked={view.pathLight}
                  onToggle={() => setView({ pathLight: !view.pathLight })}
                />
                <SelectRow<PathLightStyle>
                  label="Style"
                  value={view.pathLightStyle}
                  options={[
                    { value: "comet", label: "comet" },
                    { value: "dots", label: "dots" },
                  ]}
                  onChange={(pathLightStyle) => setView({ pathLightStyle })}
                />
                <SliderRow
                  label="Speed"
                  hint="How fast the light travels the chain"
                  value={view.pathLightSpeed}
                  min={VIEW_LIMITS.pathLightSpeed.min}
                  max={VIEW_LIMITS.pathLightSpeed.max}
                  step={0.1}
                  onChange={(pathLightSpeed) => setView({ pathLightSpeed })}
                />
                <CheckRow
                  label="Accelerate per level"
                  checked={view.pathLightAccel}
                  onToggle={() => setView({ pathLightAccel: !view.pathLightAccel })}
                />
                <SelectRow<PathLightColorMode>
                  label="Light color"
                  value={view.pathLightColorMode}
                  options={[
                    { value: "strand", label: "follow the strand" },
                    { value: "theme", label: "theme accent" },
                    { value: "custom", label: "fixed color" },
                  ]}
                  onChange={(pathLightColorMode) => setView({ pathLightColorMode })}
                />
                {view.pathLightColorMode === "custom" && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {PATH_LIGHT_PRESETS.map((preset) => {
                        const active =
                          view.pathLightColor.toLowerCase() === preset.color.toLowerCase();
                        return (
                          <button
                            key={preset.color}
                            onClick={() => setView({ pathLightColor: preset.color })}
                            title={preset.name}
                            aria-label={preset.name}
                            aria-pressed={active}
                            className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                              active
                                ? "border-primary scale-110"
                                : "border-border/60"
                            }`}
                            style={{ backgroundColor: preset.color }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-foreground/70 flex-1">
                        Custom
                      </span>
                      <input
                        type="color"
                        value={normalizeForPicker(view.pathLightColor)}
                        onChange={(e) => setView({ pathLightColor: e.target.value })}
                        className="w-6 h-6 rounded border border-border/60 bg-transparent cursor-pointer"
                        aria-label="Path light color"
                      />
                    </div>
                  </>
                )}
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  Selecting a node sends a light down its containment chain from
                  the outermost ancestor, then forks it along that node's own
                  references. Following the strand tints the light with whatever
                  it is currently crossing, so the hops stay distinguishable.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* <input type="color"> only accepts #rrggbb — expand shorthand and fall back
 * for generated hsl() palette entries. */
function normalizeForPicker(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return "#888888";
}
