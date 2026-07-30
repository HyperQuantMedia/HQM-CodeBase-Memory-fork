/* The UI's type and icon scale, written down.
 *
 * Every step here was already in use somewhere in the app; nothing is new. It is
 * recorded because the sizes were drifting: each pass that added a control picked a
 * plausible-looking value near the existing ones, so a chip ended up at 10px in one
 * panel and 11px in another, a HUD line at 10px next to a HUD line at 11px, and one
 * glyph in a row of 15px icons was drawn at 14px. Individually invisible, together a
 * UI that looks slightly unsettled and cannot be corrected without knowing what the
 * intended value was.
 *
 * So: this is the intended value. New UI picks a step from this list. A step that
 * does not fit means the list is wrong and should be changed here, once, rather than
 * worked around locally.
 *
 * Not a Tailwind theme extension: the classes are arbitrary-value utilities
 * (`text-[11px]`) written inline throughout, and converting several hundred of them
 * to semantic names is a mechanical change with real risk and no visual result. The
 * constants exist so new code can reference the scale and so the values have one
 * documented home.
 */

export const TYPE = {
  /** Sub-labels inside a tile, checkbox ticks — anything below reading size. */
  micro: "text-[9px]",
  /** Section titles, chips, counts, footers, secondary metadata. */
  meta: "text-[10px]",
  /** Control rows, HUD lines, definition rows, search-result rows. */
  control: "text-[11px]",
  /** Tree rows, search inputs, primary titles inside a panel. */
  body: "text-[12px]",
  /** Brand, panel headings. */
  heading: "text-[13px]",
  /** Empty states and errors that own the whole pane. */
  notice: "text-sm",
} as const;

/* Icon sizes, in px, for lucide's `size` prop and the hand-drawn glyphs.
 *
 * `action` is the size of every icon that sits in a toolbar Button or a header tab —
 * they appear side by side, so a single stray value reads as a misaligned row. */
export const ICON = {
  /** Inline with a text row: a folder marker beside a name. */
  inline: 11,
  /** Compact toggles: the sort and scope chips. */
  toggle: 13,
  /** Toolbar buttons, header tabs, view-mode glyphs. */
  action: 15,
} as const;
