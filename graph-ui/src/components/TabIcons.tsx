/* Hand-rolled tab glyph, in the same 16×16 stroked style as ViewModeIcons and the
 * theme toggle.
 *
 * The relationship-graph tab went through two stock icons and both were wrong for
 * the same reason. `Share2` is the platform share affordance on every phone in
 * existence, so it read as "send this somewhere". `Waypoints` draws three nodes on
 * a single routed path — a *route*, one thing after another, no branching. What the
 * tab shows is neither: a corpus where one node fans out to several and those fan
 * out again. So the glyph is a hub with two links that each split, which is the
 * cheapest drawing that cannot be mistaken for a linear path.
 *
 * Stock icons stay for the other three tabs — they are ordinary things (a list, a
 * treemap, a pulse) and lucide draws those fine. Only this one carries a claim
 * about structure that no stock glyph makes. */

interface IconProps {
  className?: string;
}

export function GraphTabIcon({ className }: IconProps) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Trunk out of the root, then a fork up and a fork down. */}
      <path d="M3.6 8h2.2" />
      <path d="M5.8 8 8.6 4.6" />
      <path d="M5.8 8 8.6 11.4" />
      {/* Each limb splits again, so the branching is visibly recursive. */}
      <path d="M10 4.2 12.4 2.6" />
      <path d="M10 4.9 12.4 6.4" />
      <path d="M10 11.8h2.4" />
      {/* Nodes: the root larger, the leaves small. */}
      <circle cx="2.6" cy="8" r="1.5" />
      <circle cx="9.3" cy="4.5" r="1" />
      <circle cx="9.3" cy="11.6" r="1" />
      <circle cx="13.2" cy="2.3" r="1" />
      <circle cx="13.2" cy="6.7" r="1" />
      <circle cx="13.2" cy="11.8" r="1" />
    </svg>
  );
}
