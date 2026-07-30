import { useCallback, useEffect, useState } from "react";
import { applyTheme, resolvedTheme, storedTheme, type Theme } from "../lib/theme";

/* Broadcast so non-CSS consumers (the WebGL canvas, which clears with a literal
 * colour) can re-read their themed variables. */
function announce(theme: Theme) {
  window.dispatchEvent(new CustomEvent("cbm-theme-change", { detail: theme }));
}

/* Sun/moon theme switch. Shows the icon of the mode a click switches TO, and
 * keeps following the OS until the first click — so a fresh install matches the
 * rest of the user's desktop without asking. */
export function ThemeToggle({ onChange }: { onChange?: (t: Theme) => void }) {
  const [theme, setTheme] = useState<Theme>(() => resolvedTheme());
  const [overridden, setOverridden] = useState<boolean>(() => storedTheme() !== null);

  /* While no explicit choice exists, track the OS. */
  useEffect(() => {
    if (overridden || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = () => {
      const next = resolvedTheme();
      setTheme(next);
      announce(next);
      onChange?.(next);
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, [overridden, onChange]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    setOverridden(true);
    announce(next);
    onChange?.(next);
  }, [theme, onChange]);

  const dark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title="Theme"
      aria-label={
        (dark ? "Switch to light theme" : "Switch to dark theme") +
        (overridden ? "" : " (currently following the system)")
      }
      className="flex items-center justify-center w-7 h-7 rounded-md text-ink-soft hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
    >
      {dark ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        </svg>
      )}
    </button>
  );
}
