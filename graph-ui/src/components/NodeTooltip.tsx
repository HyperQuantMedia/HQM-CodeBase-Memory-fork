import { Html } from "@react-three/drei";
import type { GraphNode } from "../lib/types";
import { colorForLabel, colorForStatus } from "../lib/colors";

interface NodeTooltipProps {
  node: GraphNode;
}

function lineRange(node: GraphNode): string | null {
  if (!node.start_line) return null;
  if (node.end_line && node.end_line !== node.start_line)
    return `L${node.start_line}-${node.end_line}`;
  return `L${node.start_line}`;
}

export function NodeTooltip({ node }: NodeTooltipProps) {
  return (
    <Html
      position={[node.x, node.y + node.size * 0.7, node.z]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div className="bg-panel/95 text-foreground backdrop-blur border border-border rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl max-w-[350px]">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: colorForLabel(node.label) }}
          />
          <span className="font-medium truncate">{node.name}</span>
          <span className="text-ink-soft ml-1 shrink-0">{node.label}</span>
        </div>
        {node.file_path && (
          <p className="text-ink-soft font-mono truncate">
            {node.file_path}
            {lineRange(node) && (
              <span className="text-ink-soft"> · {lineRange(node)}</span>
            )}
          </p>
        )}
        {node.status && node.status !== "structural" && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: colorForStatus(node.status) }}
            />
            <span className="text-foreground/60">{node.status}</span>
            {node.in_calls !== undefined && (
              <span className="text-ink-soft">
                · {node.in_calls} caller{node.in_calls === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        <p className="text-ink-soft mt-1 text-[10px]">click for code →</p>
      </div>
    </Html>
  );
}
