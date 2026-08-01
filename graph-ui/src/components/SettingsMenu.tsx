import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  APPEARANCE_LIMITS,
  PATH_LIGHT_PRESETS,
  isAppearanceDefault,
  type Appearance,
  type PathLightColorMode,
} from "../lib/appearance";
import type { Stage } from "../lib/sceneInk";
import {
  DEFAULT_VIEW_SETTINGS,
  VIEW_LIMITS,
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
import { defaultColorForEdge, defaultColorForLabel } from "../lib/colors";

type TabId = "view" | "display" | "colors" | "animation";

const TABS: { id: TabId; label: string }[] = [
  { id: "view", label: "View" },
  { id: "display", label: "Display" },
  { id: "colors", label: "Colors" },
  { id: "animation", label: "Animation" },
];

interface SettingsMenuProps {
  /** Which theme's appearance is being edited. */
  stage: Stage;
  appearance: Appearance;
  onAppearanceChange: (next: Appearance) => void;
  /** Restore this theme's own defaults, leaving the other theme alone. */
  onAppearanceReset: () => void;
  view: ViewSettings;
  onViewChange: (next: ViewSettings) => void;
  /** Labels present in the loaded graph — the Colors tab lists exactly these. */
  labels: string[];
  /** Edge types present in the loaded graph (Phase 4a) — the Colors tab grows a
   * Relationships section when any are passed. */
  edgeTypes?: string[];
}

const STAGE_LABEL: Record<Stage, string> = { dark: "Dark", light: "Light" };

/* Appearance is per theme; view and animation timing are not. Saying so where the
 * controls are is cheaper than leaving the user to discover that Display looks
 * different after they flip the theme. */
function ThemeScope({ stage }: { stage: Stage }) {
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-dim font-medium"
      title="These settings are stored separately for each theme"
    >
      {STAGE_LABEL[stage]} theme
    </span>
  );
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
  stage,
  appearance,
  onAppearanceChange,
  onAppearanceReset,
  view,
  onViewChange,
  labels,
  edgeTypes = [],
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

  const setDisplay = (patch: Partial<Appearance>) =>
    onAppearanceChange({ ...appearance, ...patch });
  const setView = (patch: Partial<ViewSettings>) => onViewChange({ ...view, ...patch });
  const setLayout = (patch: Partial<ViewSettings["layout"]>) =>
    onViewChange({ ...view, layout: { ...view.layout, ...patch } });

  const appearanceDefault = isAppearanceDefault(stage, appearance);
  const viewDefault =
    view.mode === DEFAULT_VIEW_SETTINGS.mode &&
    view.fov === DEFAULT_VIEW_SETTINGS.fov &&
    view.pathLightAccel === DEFAULT_VIEW_SETTINGS.pathLightAccel;
  const isDefault = appearanceDefault && viewDefault;

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
                <div className="flex items-center justify-between gap-2">
                  <ThemeScope stage={stage} />
                  <button
                    onClick={onAppearanceReset}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={appearanceDefault}
                    title={`Restore the ${STAGE_LABEL[stage].toLowerCase()} theme's defaults`}
                  >
                    Reset to defaults
                  </button>
                </div>
                <SliderRow
                  label={stage === "light" ? "Link ink" : "Link brightness"}
                  hint={
                    stage === "light"
                      ? "How strongly each link marks the page"
                      : "Dim the web of links on dense graphs"
                  }
                  value={appearance.edgeBrightness}
                  min={APPEARANCE_LIMITS.edgeBrightness.min}
                  max={APPEARANCE_LIMITS.edgeBrightness.max}
                  onChange={(edgeBrightness) => setDisplay({ edgeBrightness })}
                />
                <SliderRow
                  label="Node size"
                  hint="Radius of every node marker"
                  value={appearance.nodeScale}
                  min={APPEARANCE_LIMITS.nodeScale.min}
                  max={APPEARANCE_LIMITS.nodeScale.max}
                  onChange={(nodeScale) => setDisplay({ nodeScale })}
                />
                {stage === "dark" && (
                  <>
                    <SliderRow
                      label="Node glow"
                      hint="Halo boost around each node"
                      value={appearance.nodeGlow}
                      min={APPEARANCE_LIMITS.nodeGlow.min}
                      max={APPEARANCE_LIMITS.nodeGlow.max}
                      onChange={(nodeGlow) => setDisplay({ nodeGlow })}
                    />
                    <SliderRow
                      label="Bloom"
                      hint="Overall glow bloom strength"
                      value={appearance.bloom}
                      min={APPEARANCE_LIMITS.bloom.min}
                      max={APPEARANCE_LIMITS.bloom.max}
                      onChange={(bloom) => setDisplay({ bloom })}
                    />
                  </>
                )}
                <SliderRow
                  label="Link curvature"
                  hint="Bow each link outward; 0 draws straight chords"
                  value={appearance.edgeCurve}
                  min={APPEARANCE_LIMITS.edgeCurve.min}
                  max={APPEARANCE_LIMITS.edgeCurve.max}
                  onChange={(edgeCurve) => setDisplay({ edgeCurve })}
                />
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  {stage === "light"
                    ? "Stored for the light theme only. Links are drawn as ink that darkens where it overlaps, so a dense graph still reads as dense — there is no bloom on paper, hence no glow controls."
                    : "Stored for the dark theme only. 1.00× follows the automatic density compensation; lower the edge/glow/bloom values when a large graph washes out to white."}
                </p>
              </>
            )}

            {tab === "colors" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <ThemeScope stage={stage} />
                  <button
                    onClick={() => setDisplay({ labelColors: {}, edgeColors: {} })}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={
                      Object.keys(appearance.labelColors).length === 0 &&
                      Object.keys(appearance.edgeColors).length === 0
                    }
                  >
                    Reset colors
                  </button>
                </div>
                {sortedLabels.length === 0 && (
                  <p className="text-[11px] text-ink-dim">No labels loaded.</p>
                )}
                <div className="space-y-1.5">
                  {sortedLabels.map((label) => {
                    const overridden = appearance.labelColors[label] !== undefined;
                    const value =
                      appearance.labelColors[label] ?? defaultColorForLabel(label);
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeForPicker(value)}
                          onChange={(e) =>
                            setDisplay({
                              labelColors: {
                                ...appearance.labelColors,
                                [label]: e.target.value,
                              },
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
                              const next = { ...appearance.labelColors };
                              delete next[label];
                              setDisplay({ labelColors: next });
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
                {edgeTypes.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-ink-soft uppercase tracking-wider pt-2 border-t border-border/30">
                      Relationships
                    </p>
                    <div className="space-y-1.5">
                      {[...edgeTypes].sort((a, b) => a.localeCompare(b)).map((type) => {
                        const overridden = appearance.edgeColors[type] !== undefined;
                        const value =
                          appearance.edgeColors[type] ?? defaultColorForEdge(type);
                        return (
                          <div key={type} className="flex items-center gap-2">
                            <input
                              type="color"
                              value={normalizeForPicker(value)}
                              onChange={(e) =>
                                setDisplay({
                                  edgeColors: {
                                    ...appearance.edgeColors,
                                    [type]: e.target.value,
                                  },
                                })
                              }
                              className="w-6 h-6 rounded border border-border/60 bg-transparent cursor-pointer shrink-0"
                              aria-label={`${type} color`}
                            />
                            <span className="text-[11px] text-foreground/65 truncate flex-1">
                              {type.replace(/_/g, " ").toLowerCase()}
                            </span>
                            {overridden && (
                              <button
                                onClick={() => {
                                  const next = { ...appearance.edgeColors };
                                  delete next[type];
                                  setDisplay({ edgeColors: next });
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
                  </>
                )}
                <p className="text-[9px] text-ink-dim pt-1 border-t border-border/30">
                  Stored per theme — a colour that works on the void does not
                  necessarily work on paper. Defaults are the built-in palette;
                  unknown labels and relationship types get a stable generated
                  hue. Custom colors skip the contrast checks.
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
                  value={appearance.pathLightColorMode}
                  options={[
                    { value: "strand", label: "follow the strand" },
                    { value: "theme", label: "theme accent" },
                    { value: "custom", label: "fixed color" },
                  ]}
                  onChange={(pathLightColorMode) => setDisplay({ pathLightColorMode })}
                />
                {appearance.pathLightColorMode === "custom" && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {PATH_LIGHT_PRESETS.map((preset) => {
                        const active =
                          appearance.pathLightColor.toLowerCase() ===
                          preset.color.toLowerCase();
                        return (
                          <button
                            key={preset.color}
                            onClick={() => setDisplay({ pathLightColor: preset.color })}
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
                        value={normalizeForPicker(appearance.pathLightColor)}
                        onChange={(e) => setDisplay({ pathLightColor: e.target.value })}
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
                  it is currently crossing, so the hops stay distinguishable. The
                  colour is stored per theme; the speed and style are shared.
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
