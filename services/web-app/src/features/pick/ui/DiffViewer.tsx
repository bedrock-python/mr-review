import { useMemo } from "react";
import { FileX } from "lucide-react";
import { DiffTable, EmptyState, ICON_SIZE, Toolbar, ToolbarSpacer } from "@shared/ui";
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
      <Toolbar size="sm">
        <h2
          className="text-fg-0 m-0 min-w-0 truncate font-mono font-normal"
          style={{ fontSize: "var(--fs-control)" }}
          title={displayPath}
        >
          {displayPath}
        </h2>
        <ToolbarSpacer />
        <span
          className="flex shrink-0 font-mono"
          style={{ gap: "var(--space-2)", fontSize: "var(--fs-meta)" }}
        >
          <span className="text-c-add-fg">+{file.additions}</span>
          <span className="text-c-del-fg">-{file.deletions}</span>
        </span>
      </Toolbar>
      {file.hunks.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<FileX size={ICON_SIZE.inline} />}
          title="No diff to show"
          description="A binary file, or a change the host did not send a diff for."
        />
      ) : (
        <DiffTable lines={lines} className="min-h-0 flex-1" ariaLabel={`Diff of ${file.path}`} />
      )}
    </div>
  );
};
