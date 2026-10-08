import { useMemo } from "react";
import { DiffTable } from "@shared/ui";
import type { DiffFile } from "@entities/mr";
import type { DiffLineWithFile } from "@shared/ui";

export type DiffViewerProps = {
  file: DiffFile;
};

/** The structured hunks of one file as rows of the shared diff table. */
const toDiffLines = (file: DiffFile): DiffLineWithFile[] =>
  file.hunks.flatMap((hunk) => [
    {
      type: "header" as const,
      content: `@@ -${String(hunk.old_start)},${String(hunk.old_count)} +${String(hunk.new_start)},${String(hunk.new_count)} @@`,
      newLine: null,
      oldLine: null,
      file: file.path,
    },
    ...hunk.lines.map((line) => ({
      type: line.type,
      content: line.content,
      newLine: line.new_line,
      oldLine: line.old_line,
      file: file.path,
    })),
  ]);

export const DiffViewer = ({ file }: DiffViewerProps): React.ReactElement => {
  const lines = useMemo(() => toDiffLines(file), [file]);
  const displayPath = file.old_path ? `${file.old_path} → ${file.path}` : file.path;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-1)] px-4 py-2.5">
        <span className="truncate font-mono text-sm text-[var(--fg-0)]" title={displayPath}>
          {displayPath}
        </span>
        <div className="ml-4 flex shrink-0 items-center gap-3 font-mono text-xs">
          <span className="text-[var(--c-add)]">+{file.additions}</span>
          <span className="text-[var(--c-del)]">-{file.deletions}</span>
        </div>
      </div>
      {file.hunks.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-[var(--fg-2)]">
          Binary file or no diff available
        </div>
      ) : (
        <DiffTable lines={lines} className="min-h-0 flex-1" ariaLabel={`Diff of ${file.path}`} />
      )}
    </div>
  );
};
