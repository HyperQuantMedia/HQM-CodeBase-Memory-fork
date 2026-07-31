import { useEffect, useState } from "react";
import type { GraphNode } from "../lib/types";

/* Right-panel callout for a selected missed-skeleton node: says what was not fully
 * covered, and hands the user something they can act on.
 *
 * Ported from upstream, with its outbound issue link removed. Theirs fetched an
 * `upstream_issues_url` from `/api/ui-config` and offered a prefilled GitHub issue
 * against their tracker. Two reasons that could not stay: routing a Cartograph user
 * into another organisation's issue tracker is the same leak as naming HQM on an
 * end-user surface, only pointed outward; and the prompt it built asked the user's
 * agent to file that issue, which is the same disclosure wearing a different hat —
 * including, potentially, a snippet of the user's own unindexable code.
 *
 * What is kept is the part that helps whoever is looking at the graph: the file, the
 * honest statement that coverage is best-effort, and an agent prompt that diagnoses
 * the gap *locally*. Nothing here leaves the machine. */

interface MissedCalloutProps {
  node: GraphNode;
  project: string | null;
  onClose: () => void;
}

/* A prompt the user can paste into whatever agent they already have open. It asks
 * for a diagnosis, not a report: which construct the parser could not handle, on
 * which lines. That answer is useful on its own — it tells the reader whether the
 * gap matters — and it is the same summary anyone would need before deciding to
 * raise it anywhere. Where it then goes is the user's call, not ours. */
function buildAgentPrompt(path: string, project: string | null): string {
  return (
    `The code index could not fully parse \`${path}\`` +
    (project ? ` (project \`${project}\`)` : "") +
    " — this is a best-effort coverage signal, so treat the file itself as ground " +
    "truth. Please: 1) call the index_status tool and note this file's flagged line " +
    "ranges under parse_partial; 2) read those ranges and tell me which construct " +
    "fails to parse and why; 3) say whether anything important is missing from the " +
    "graph as a result."
  );
}

export function MissedCallout({ node, project, onClose }: MissedCalloutProps) {
  const path = node.file_path || node.name;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildAgentPrompt(path, project));
      setCopied(true);
    } catch {
      /* Clipboard unavailable (permissions, or an insecure context) — leave the
       * button state alone so the failure shows rather than reading as success. */
    }
  };

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-y-auto">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          {/* Parsed, not indexed — the file is in the index and its bytes are in the
              size view's indexed total. See the state list on `MissedGraph`. */}
          <p className="text-[10px] text-ink-dim uppercase tracking-widest">
            Not fully parsed
          </p>
          <p className="text-sm font-medium text-foreground break-all mt-1">{path}</p>
          <p className="text-[10px] text-ink-dim mt-0.5">{node.label}</p>
        </div>
        <button
          onClick={onClose}
          className="text-ink-faint hover:text-ink-soft transition-colors text-[16px] leading-none p-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-soft">
        This part of the corpus was not fully parsed, so constructs here may be missing
        from the graph. Detection is best-effort — the file itself is ground truth.
      </p>

      {/* Ink roles, not opacity modifiers: `text-foreground/70` and `bg-white/[0.03]`
          compile to a real alpha and can never be theme-aware, so the ported markup
          was unreadable on the light stage. */}
      <button
        onClick={copyPrompt}
        className={`text-[12px] font-medium rounded-md px-3 py-1.5 transition-colors text-left ${
          copied
            ? "bg-primary/15 text-primary"
            : "bg-foreground/[0.05] text-ink-soft hover:bg-foreground/[0.09] hover:text-foreground"
        }`}
      >
        {copied ? "✓ Copied — paste it to your agent" : "Copy diagnosis prompt"}
      </button>

      <p className="text-[10px] leading-snug text-ink-dim">
        The prompt names only this file and the project, and asks your agent to read
        the file locally. Nothing is sent anywhere.
      </p>
    </div>
  );
}
