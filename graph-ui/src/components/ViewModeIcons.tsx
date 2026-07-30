/* Glyphs for the four projections, in the same 16×16 stroked style as the
 * theme toggle's sun/moon — the toolbar had a text label ("Web" / "Sphere" /
 * "Cone" / "Tree") which read as a word to parse rather than a state to
 * recognise, and sat oddly next to the icon-only controls beside it.
 *
 * Each glyph shows what the projection *does* to the graph, not a generic shape:
 * the web is a hub with radiating links, the sphere is a globe with its latitude
 * bands, the cone is a stack of narrowing rings, the tree is a trunk with two
 * limbs and a crown. */

import type { ReactElement } from "react";
import type { ViewMode } from "../lib/viewLayout";

interface IconProps {
  className?: string;
}

const SVG = {
  width: 15,
  height: 15,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/* Force / server layout: a central hub with links out to its neighbours. */
function WebIcon({ className }: IconProps) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 8 3 3M8 8l5-4M8 8l-4.5 5M8 8l5 4.5M8 8h5.5" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="3" cy="3" r="1.1" />
      <circle cx="13" cy="4" r="1.1" />
      <circle cx="3.5" cy="13" r="1.1" />
      <circle cx="13" cy="12.5" r="1.1" />
    </svg>
  );
}

/* Nested spheres: a globe, with a smaller one riding its surface. */
function SphereIcon({ className }: IconProps) {
  return (
    <svg {...SVG} className={className}>
      <circle cx="7" cy="8.5" r="5.4" />
      <path d="M1.6 8.5h10.8M3 5.2h8M3 11.8h8" />
      <circle cx="13.2" cy="3.4" r="2.1" />
    </svg>
  );
}

/* Nested cones: rings narrowing toward an apex, with a sub-cone hanging off. */
function ConeIcon({ className }: IconProps) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 1.6 2.4 12.4M8 1.6l5.6 10.8" />
      <ellipse cx="8" cy="12.4" rx="5.6" ry="1.9" />
      <ellipse cx="8" cy="7.6" rx="2.9" ry="1" />
    </svg>
  );
}

/* Organic tree: trunk, two limbs, and a crown of leaves. */
function TreeIcon({ className }: IconProps) {
  return (
    <svg {...SVG} className={className}>
      <path d="M8 14.4V7.2M8 7.2 4.4 4.4M8 7.2l3.6-2.8" />
      <circle cx="8" cy="5.4" r="1.5" />
      <circle cx="3.6" cy="3.4" r="1.4" />
      <circle cx="12.4" cy="3.4" r="1.4" />
    </svg>
  );
}

export const VIEW_MODE_ICON: Record<ViewMode, (p: IconProps) => ReactElement> = {
  default: WebIcon,
  sphere: SphereIcon,
  cone: ConeIcon,
  tree: TreeIcon,
};
