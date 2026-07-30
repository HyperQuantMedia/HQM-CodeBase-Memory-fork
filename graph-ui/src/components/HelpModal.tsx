import { useEffect } from "react";
import { FILE_KINDS } from "../lib/fileKind";

/* Interaction reference. Everything documented here is behavior the app
 * already has — the modal exists because none of it was discoverable. */
export function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-scrim backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="How the graph works"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] max-h-full overflow-auto rounded-xl border border-border/60 bg-popover/98 backdrop-blur-md shadow-2xl p-6 text-popover-foreground"
      >
        <button
          onClick={onClose}
          aria-label="Close help"
          className="absolute top-3 right-3 text-ink-dim hover:text-foreground/70 transition-colors text-[18px] leading-none p-1"
        >
          ×
        </button>

        <h2 className="text-[15px] font-semibold mb-1">How the graph works</h2>
        <p className="text-[12px] text-ink-soft leading-relaxed mb-4">
          Every indexed thing is a node; edges are the relationships between
          them. Colour is the node's label (see the Filters panel — click a chip
          to hide that type). Size grows with how connected a node is.
        </p>

        <Section title="Getting around">
          <Item keys="Drag">orbits the camera; <b>wheel</b> zooms.</Item>
          <Item keys="Click a node">
            highlights its neighbourhood, flies the camera to it, and opens its
            detail panel on the right.
          </Item>
          <Item keys="Click a folder">
            in the Folders panel filters the graph to that subtree.
          </Item>
          <Item keys="Esc">clears the current selection.</Item>
          <Item keys="Breadcrumb">
            appears above the graph once something is selected — click any
            ancestor to jump up to it.
          </Item>
          <Item keys="Idle">
            for a minute and the camera begins a slow auto-orbit; any input takes
            the wheel back.
          </Item>
        </Section>

        <Section title="Views">
          <Item keys="The projection button">
            in the toolbar cycles four views; its icon shows the current one.
            Settings → View has the same choice plus each view's own controls.
          </Item>
          <Item keys="Web">
            is the server's own force-directed 3D layout — the default.
          </Item>
          <Item keys="Sphere / Cone">
            are nested: every container becomes its own cluster and its children
            cluster inside that, so a folder reads as a sphere of files rather
            than scattered points. Cone hangs each cluster below its parent.
          </Item>
          <Item keys="Tree">
            grows the hierarchy as a branching 3D tree. A folder whose contents
            are all leaves becomes a terminal cluster — a flat rosette, a ball on
            the tip, or an open spray, mixed per cluster unless you pin one shape.
          </Item>
          <Item keys="Framing">
            resets whenever you switch projection. The alternate views are built
            from node spacing, not from a fixed box, so each one has its own size.
          </Item>
          <Item keys="Nodes">
            in the toolbar sets how many nodes to load; edges between loaded
            nodes follow automatically.
          </Item>
          <Item keys="Theme">
            switches at the top right. The graph is drawn differently in each:
            glow and bloom on dark, ink and composited links on light.
          </Item>
        </Section>

        <Section title="Opening files">
          <Item keys="Open file / folder">
            buttons appear on hover in the Folders panel and in a selected node's
            detail panel. They launch the path with your OS default application.
            Only paths inside the indexed project can be opened.
          </Item>
        </Section>

        <Section title="Search">
          <Item keys="Plain text">matches node names and paths.</Item>
          <Item keys="kind:">
            filters by file type from the extension —{" "}
            <code className="text-primary/80">
              {FILE_KINDS.slice(0, 6).join(" · ")}
            </code>{" "}
            and more.
          </Item>
          <Item keys="label:">
            filters by node label (<code className="text-primary/80">label:Function</code>).
          </Item>
          <Item keys="status:">
            filters by dead-code status (<code className="text-primary/80">status:dead</code>).
          </Item>
          <p className="text-[11px] text-ink-dim mt-1.5 leading-relaxed">
            Terms combine — every space-separated term must match.
          </p>
        </Section>

        <Section title="Sharing">
          <Item keys="Export">
            writes the current filtered view to a single self-contained HTML
            file. It needs no server and no network: open or mail it as-is.
          </Item>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-medium text-ink-soft uppercase tracking-wider mb-1.5">
        {title}
      </h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Item({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <li className="text-[12px] text-foreground/60 leading-relaxed">
      <b className="text-foreground/85">{keys}</b> {children}
    </li>
  );
}
