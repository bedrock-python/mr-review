import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE } from "@shared/ui";
import type { FileTreeRow, TreeRowProps } from "../lib";

const ROW_HEIGHT_PX = 26;

const highlightMatch = (text: string, query: string): React.ReactNode => {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark
        className="text-inherit"
        style={{ background: "var(--accent-tint)", borderRadius: "var(--radius-1)" }}
      >
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
};

export type FileTreeItemProps = {
  row: FileTreeRow;
  isSelected: boolean;
  /** Draws the folder chevron column; off in the flat list. */
  isTree: boolean;
  query: string;
  rowProps: TreeRowProps;
  onActivate: (row: FileTreeRow) => void;
};

/** One row of the changed-files tree: a folder that opens, or a file that shows its diff. */
export const FileTreeItem = ({
  row,
  isSelected,
  isTree,
  query,
  rowProps,
  onActivate,
}: FileTreeItemProps): React.ReactElement => {
  const isDir = row.file === null;
  const FolderIcon = row.isOpen ? FolderOpen : Folder;

  return (
    <div
      {...rowProps}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-setsize={row.siblingCount}
      aria-posinset={row.position}
      aria-expanded={isDir ? row.isOpen : undefined}
      aria-selected={isDir ? undefined : isSelected}
      title={row.path}
      onClick={() => {
        onActivate(row);
      }}
      className={cn(
        "flex cursor-pointer items-center font-mono whitespace-nowrap select-none",
        "hover:bg-bg-hover -outline-offset-2 transition-colors",
        isDir ? "text-fg-2" : "text-fg-1",
        isSelected && "bg-bg-2 text-fg-0 hover:bg-bg-2 shadow-[inset_2px_0_0_var(--accent-fg)]"
      )}
      style={{
        height: ROW_HEIGHT_PX,
        gap: "var(--space-1)",
        paddingLeft: `calc(var(--space-2) + ${String(row.depth)} * var(--space-3))`,
        paddingRight: "var(--space-2)",
        fontSize: "var(--fs-meta)",
        transitionDuration: "var(--dur-fast)",
      }}
    >
      {isTree && (
        <ChevronRight
          size={ICON_SIZE.inline}
          aria-hidden="true"
          className={cn("text-fg-3 shrink-0 transition-transform", row.isOpen && "rotate-90")}
          style={{ visibility: isDir ? "visible" : "hidden" }}
        />
      )}
      {isDir ? (
        <FolderIcon size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-3 shrink-0" />
      ) : (
        <File size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-3 shrink-0" />
      )}
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis">
        {highlightMatch(row.name, query)}
      </span>
      {row.file && (
        <span className="flex shrink-0" style={{ gap: "var(--space-1)" }}>
          {row.file.additions > 0 && <span className="text-c-add-fg">+{row.file.additions}</span>}
          {row.file.deletions > 0 && <span className="text-c-del-fg">-{row.file.deletions}</span>}
        </span>
      )}
    </div>
  );
};
