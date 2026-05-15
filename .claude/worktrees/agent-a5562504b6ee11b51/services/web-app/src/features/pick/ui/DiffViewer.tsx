import { cn } from "@shared/lib";
import type { DiffFile, DiffHunk, DiffLine } from "@entities/mr";

export type DiffViewerProps = {
  file: DiffFile;
};

type DiffLineViewProps = {
  line: DiffLine;
};

type HunkViewProps = {
  hunk: DiffHunk;
};

const LINE_STYLES: Record<DiffLine["type"], string> = {
  added: "bg-green-950/40",
  removed: "bg-red-950/40",
  context: "",
};

const LINE_SIGNS: Record<DiffLine["type"], string> = {
  added: "+",
  removed: "-",
  context: " ",
};

const LINE_SIGN_COLORS: Record<DiffLine["type"], string> = {
  added: "text-green-400",
  removed: "text-red-400",
  context: "text-[var(--text-muted)]",
};

const DiffLineView = ({ line }: DiffLineViewProps): React.ReactElement => {
  return (
    <div className={cn("flex items-stretch text-xs font-mono leading-5", LINE_STYLES[line.type])}>
      {/* Old line number */}
      <span className="w-10 flex-shrink-0 px-1.5 text-right text-[var(--text-muted)]/60 select-none border-r border-[var(--border)]/40">
        {line.old_line ?? ""}
      </span>
      {/* New line number */}
      <span className="w-10 flex-shrink-0 px-1.5 text-right text-[var(--text-muted)]/60 select-none border-r border-[var(--border)]/40">
        {line.new_line ?? ""}
      </span>
      {/* Sign */}
      <span className={cn("w-5 flex-shrink-0 text-center select-none", LINE_SIGN_COLORS[line.type])}>
        {LINE_SIGNS[line.type]}
      </span>
      {/* Content */}
      <pre className="flex-1 px-2 overflow-x-auto whitespace-pre text-[var(--text)]">{line.content}</pre>
    </div>
  );
};

const HunkView = ({ hunk }: HunkViewProps): React.ReactElement => {
  const header = `@@ -${hunk.old_start},${hunk.old_count} +${hunk.new_start},${hunk.new_count} @@`;
  return (
    <div>
      {/* Hunk header */}
      <div className="flex items-center px-3 py-1 bg-[var(--surface-2)] border-y border-[var(--border)]/60 text-xs font-mono text-[var(--text-muted)]">
        {header}
      </div>
      {/* Lines */}
      {hunk.lines.map((line, i) => (
        <DiffLineView key={i} line={line} />
      ))}
    </div>
  );
};

export const DiffViewer = ({ file }: DiffViewerProps): React.ReactElement => {
  const displayPath = file.old_path ? `${file.old_path} → ${file.path}` : file.path;
  return (
    <div className="min-w-0">
      {/* File header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
        <span className="text-sm font-mono text-[var(--text)] truncate">{displayPath}</span>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4 text-xs font-mono">
          <span className="text-green-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </div>
      </div>
      {/* Hunks */}
      {file.hunks.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-[var(--text-muted)] text-sm">
          Binary file or no diff available
        </div>
      ) : (
        file.hunks.map((hunk, i) => <HunkView key={i} hunk={hunk} />)
      )}
    </div>
  );
};
