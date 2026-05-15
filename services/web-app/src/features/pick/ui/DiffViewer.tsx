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
    <div className={cn("flex items-stretch font-mono text-xs leading-5", LINE_STYLES[line.type])}>
      {/* Old line number */}
      <span className="w-10 flex-shrink-0 border-r border-[var(--border)]/40 px-1.5 text-right text-[var(--text-muted)]/60 select-none">
        {line.old_line ?? ""}
      </span>
      {/* New line number */}
      <span className="w-10 flex-shrink-0 border-r border-[var(--border)]/40 px-1.5 text-right text-[var(--text-muted)]/60 select-none">
        {line.new_line ?? ""}
      </span>
      {/* Sign */}
      <span
        className={cn("w-5 flex-shrink-0 text-center select-none", LINE_SIGN_COLORS[line.type])}
      >
        {LINE_SIGNS[line.type]}
      </span>
      {/* Content */}
      <pre className="flex-1 overflow-x-auto px-2 whitespace-pre text-[var(--text)]">
        {line.content}
      </pre>
    </div>
  );
};

const HunkView = ({ hunk }: HunkViewProps): React.ReactElement => {
  const header = `@@ -${String(hunk.old_start)},${String(hunk.old_count)} +${String(hunk.new_start)},${String(hunk.new_count)} @@`;
  return (
    <div>
      {/* Hunk header */}
      <div className="flex items-center border-y border-[var(--border)]/60 bg-[var(--surface-2)] px-3 py-1 font-mono text-xs text-[var(--text-muted)]">
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
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <span className="truncate font-mono text-sm text-[var(--text)]">{displayPath}</span>
        <div className="ml-4 flex flex-shrink-0 items-center gap-3 font-mono text-xs">
          <span className="text-green-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </div>
      </div>
      {/* Hunks */}
      {file.hunks.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-[var(--text-muted)]">
          Binary file or no diff available
        </div>
      ) : (
        file.hunks.map((hunk, i) => <HunkView key={i} hunk={hunk} />)
      )}
    </div>
  );
};
