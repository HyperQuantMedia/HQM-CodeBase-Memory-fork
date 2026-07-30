import { useState, useEffect, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProcessInfo } from "../lib/types";
import { useUiMessages } from "../lib/i18n";

/* ── Gauge component ────────────────────────────────────── */

function Gauge({ label, value, max, unit, color }: {
  label: string; value: number; max: number; unit: string; color: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex-1 rounded-xl border border-border/30 bg-surface-1 p-4">
      <p className="text-[10px] text-ink-dim uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-[20px] font-semibold tabular-nums ${color}`}>
        {value.toFixed(1)}<span className="text-[11px] text-ink-dim ml-1">{unit}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: pct > 80 ? "#e05252" : pct > 50 ? "#eab308" : "#1DA27E" }}
        />
      </div>
    </div>
  );
}

/* ── Process card ───────────────────────────────────────── */

function ProcessCard({ proc, selected, onSelect, onKill }: {
  proc: ProcessInfo; selected: boolean;
  onSelect: () => void; onKill: () => void;
}) {
  const t = useUiMessages();
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border/30 bg-surface-1 hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${proc.is_self ? "bg-primary animate-pulse" : "bg-emerald-500"}`} />
          <span className="text-[12px] font-semibold text-foreground/80">
            PID {proc.pid}
          </span>
          {proc.is_self && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">{t.control.thisProcess}</span>
          )}
        </div>
        {!proc.is_self && (
          <button
            onClick={(e) => { e.stopPropagation(); onKill(); }}
            className="px-2 py-1 rounded-lg text-[10px] text-ink-faint hover:text-destructive hover:bg-destructive/10 transition-all"
          >
            {t.control.kill}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-2">
        <div>
          <p className="text-[9px] text-ink-faint uppercase">CPU</p>
          <p className="text-[13px] font-semibold tabular-nums text-foreground/70">{proc.cpu.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[9px] text-ink-faint uppercase">RAM</p>
          <p className="text-[13px] font-semibold tabular-nums text-foreground/70">{proc.rss_mb.toFixed(0)} MB</p>
        </div>
        <div>
          <p className="text-[9px] text-ink-faint uppercase">{t.control.uptime}</p>
          <p className="text-[13px] font-semibold tabular-nums text-foreground/70">{proc.elapsed}</p>
        </div>
      </div>

      <p className="text-[10px] text-ink-faint font-mono truncate">{proc.command}</p>
    </button>
  );
}

/* ── Log viewer ─────────────────────────────────────────── */

/* Severity carried by a log line, from the logfmt `level=` key the server emits.
 * Absent — a bare line, or a continuation of a multi-line message — reads as
 * "other" rather than being guessed at or dropped. */
export function logLevel(line: string): string {
  const m = /\blevel=([A-Za-z]+)/.exec(line);
  return m ? m[1].toLowerCase() : "other";
}

/* Colour per level. Only error and warn had one before, which is right for reading
 * a wall of text and useless for picking a level out of it. */
const LEVEL_CLASS: Record<string, string> = {
  error: "text-destructive",
  fatal: "text-destructive",
  warn: "text-warning",
  warning: "text-warning",
  info: "text-foreground/70",
  debug: "text-ink-dim",
  trace: "text-ink-faint",
  other: "text-ink-dim",
};

/* Severity order for the chips, so they read worst-first rather than in whatever
 * order the buffer happened to mention them. Unknown levels sort last, alphabetical
 * among themselves — the server may add one this list has never heard of. */
const LEVEL_ORDER = ["fatal", "error", "warn", "warning", "info", "debug", "trace"];

function levelRank(level: string): number {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? LEVEL_ORDER.length : i;
}

function LogViewer() {
  const t = useUiMessages();
  const [lines, setLines] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  /* Which levels are switched off. Storing the exclusions rather than the
   * inclusions means a level that first appears mid-session (the first error of the
   * run) shows up immediately instead of being invisible until someone notices a
   * new chip and enables it. */
  const [muted, setMuted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/logs?lines=200");
        const data = await res.json();
        setLines(data.lines ?? []);
      } catch { /* ignore */ }
    }, 2000);
    /* Initial fetch */
    fetch("/api/logs?lines=200").then(r => r.json()).then(d => setLines(d.lines ?? [])).catch(() => {});
    return () => clearInterval(poll);
  }, []);

  /* Levels actually present, with counts — a chip for a level the buffer does not
   * contain is a control that does nothing. */
  const levelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of lines) {
      const level = logLevel(line);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => levelRank(a[0]) - levelRank(b[0]) || a[0].localeCompare(b[0]),
    );
  }, [lines]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (muted.has(logLevel(line))) return false;
      return needle === "" || line.toLowerCase().includes(needle);
    });
  }, [lines, search, muted]);

  const toggleLevel = useCallback((level: string) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const filtering = search.trim() !== "" || muted.size > 0;

  return (
    <div className="rounded-xl border border-border/30 bg-code overflow-hidden">
      <div className="px-4 py-2 border-b border-border/20 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-ink-soft">{t.control.processLogs}</span>
        <span className="text-[10px] text-ink-faint tabular-nums">
          {filtering
            ? `${shown.length.toLocaleString()} of ${lines.length.toLocaleString()} lines`
            : `${lines.length.toLocaleString()} lines`}
        </span>

        {/* Level chips: click to mute, click again to restore. */}
        <div className="flex flex-wrap items-center gap-1">
          {levelCounts.map(([level, count]) => {
            const on = !muted.has(level);
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                aria-pressed={on}
                title={`${on ? "Hide" : "Show"} ${level} lines`}
                className={`inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10px] font-medium border transition-all ${
                  on
                    ? `border-border/60 bg-foreground/[0.04] ${LEVEL_CLASS[level] ?? LEVEL_CLASS.other}`
                    : "border-transparent opacity-25 text-ink-dim"
                }`}
              >
                {level}
                <span className="text-ink-faint tabular-nums">{count.toLocaleString()}</span>
              </button>
            );
          })}
          {muted.size > 0 && (
            <button
              onClick={() => setMuted(new Set())}
              className="text-[10px] text-primary/70 hover:text-primary transition-colors"
            >
              all
            </button>
          )}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter lines…"
          aria-label="Filter log lines by substring"
          title="Case-insensitive substring match over the whole line"
          className="ml-auto w-44 bg-foreground/[0.04] border border-border/50 rounded-md px-2 py-1 text-[11px] text-foreground placeholder-foreground/25 outline-none focus:border-primary/40"
        />
      </div>
      <ScrollArea className="h-[400px]">
        <div className="p-3 font-mono text-[10px] leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-ink-faint text-center py-8">{t.control.noLogs}</p>
          ) : shown.length === 0 ? (
            <p className="text-ink-faint text-center py-8">
              No lines match. {lines.length.toLocaleString()} hidden by the filter.
            </p>
          ) : (
            shown.map((line, i) => (
              <div
                key={i}
                className={`py-[1px] ${LEVEL_CLASS[logLevel(line)] ?? LEVEL_CLASS.other}`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Main Control Tab ───────────────────────────────────── */

export function ControlTab() {
  const t = useUiMessages();
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [selfMetrics, setSelfMetrics] = useState({ rss_mb: 0, user_cpu: 0, sys_cpu: 0 });
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/processes");
      const data = await res.json();
      setProcesses(data.processes ?? []);
      setSelfMetrics({
        rss_mb: data.self_rss_mb ?? 0,
        user_cpu: data.self_user_cpu_s ?? 0,
        sys_cpu: data.self_sys_cpu_s ?? 0,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  const killProcess = useCallback(async (pid: number) => {
    if (!confirm(t.control.killConfirm(pid))) return;
    try {
      await fetch("/api/process-kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      setTimeout(fetchProcesses, 1000);
    } catch { /* ignore */ }
  }, [fetchProcesses, t.control]);

  /* Aggregates */
  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0);
  const totalRam = processes.reduce((s, p) => s + p.rss_mb, 0);

  return (
    <ScrollArea className="h-full">
      <div className="p-8 max-w-4xl mx-auto">
        <h2 className="text-[15px] font-semibold text-foreground/80 mb-6">{t.control.panel}</h2>

        {/* Aggregate gauges */}
        <div className="flex gap-4 mb-8">
          <Gauge label={t.control.totalCpu} value={totalCpu} max={100 * processes.length || 100} unit="%" color="text-foreground/80" />
          <Gauge label={t.control.totalRam} value={totalRam} max={4096} unit="MB" color="text-foreground/80" />
          <Gauge label={t.control.processes} value={processes.length} max={10} unit="" color="text-primary" />
          <Gauge label={t.control.selfRam} value={selfMetrics.rss_mb} max={2048} unit="MB" color="text-primary" />
        </div>

        {/* Process grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-medium text-ink-soft">
              {t.control.activeProcesses}
            </h3>
            <button
              onClick={fetchProcesses}
              className="text-[11px] text-primary/60 hover:text-primary transition-colors"
            >
              {t.common.refresh}
            </button>
          </div>

          {processes.length === 0 ? (
            <p className="text-ink-faint text-[12px] text-center py-8">{t.control.noProcesses}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {processes.map((p) => (
                <ProcessCard
                  key={p.pid}
                  proc={p}
                  selected={selectedPid === p.pid}
                  onSelect={() => setSelectedPid(selectedPid === p.pid ? null : p.pid)}
                  onKill={() => killProcess(p.pid)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Log viewer */}
        <LogViewer />
      </div>
    </ScrollArea>
  );
}
