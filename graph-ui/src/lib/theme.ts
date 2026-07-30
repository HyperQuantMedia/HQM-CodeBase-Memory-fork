/* Theme resolution.
 *
 * The page follows the OS until the user makes a choice — no stored preference
 * exists until the first click, and clearing it hands control back to the
 * system. The chosen theme lives on <html data-theme>, which globals.css keys
 * its palette overrides off. */

export type Theme = "light" | "dark";

const STORAGE_KEY = "cbm-theme";

export function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** The explicit user choice, or null while following the system. */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch { /* ignore */ }
  return null;
}

export function resolvedTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Write the theme to <html> and persist it. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

/** Restore a stored choice at boot; no-op while following the system. */
export function initTheme() {
  const stored = storedTheme();
  if (stored) document.documentElement.setAttribute("data-theme", stored);
}

/** Read a themed CSS custom property (e.g. "--color-canvas"). */
export function themeVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}
