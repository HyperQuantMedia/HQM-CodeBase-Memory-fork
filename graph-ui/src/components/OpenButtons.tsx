import { useState } from "react";
import { openPath } from "../api/rpc";

interface OpenButtonsProps {
  project: string | null;
  /** Project-relative path of the file or folder to open. */
  path: string | undefined;
  /** Hide the file button when the target is a directory. */
  isFolder?: boolean;
  /** Compact = icon-only, for dense sidebar rows. */
  compact?: boolean;
}

/* Open file / Open folder, handing the path to the OS default application.
 * The server decides whether a path may be opened (it must resolve inside the
 * indexed project root); a refusal surfaces here as a tooltip rather than
 * silently doing nothing. */
export function OpenButtons({
  project,
  path,
  isFolder = false,
  compact = false,
}: OpenButtonsProps) {
  const [error, setError] = useState<string | null>(null);

  if (!project || !path) return null;

  const run = async (kind: "file" | "folder") => {
    setError(null);
    const err = await openPath(project, path, kind);
    if (err) setError(err);
  };

  const cls = compact
    ? "flex items-center justify-center w-5 h-5 rounded text-ink-dim hover:text-primary hover:bg-foreground/[0.06] transition-colors"
    : "px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/60 text-[11px] font-medium hover:bg-foreground/[0.09] hover:text-foreground/90 transition-colors";

  return (
    <>
      {!isFolder && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void run("file");
          }}
          className={cls}
          title={error ? `Open file — ${error}` : "Open file with your default app"}
          aria-label="Open file"
        >
          {compact ? <FileIcon /> : "Open file"}
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          void run("folder");
        }}
        className={cls}
        title={error ? `Open folder — ${error}` : "Open the containing folder"}
        aria-label="Open folder"
      >
        {compact ? <FolderIcon /> : "Open folder"}
      </button>
    </>
  );
}

function FileIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
