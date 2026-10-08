import { useState } from "react";
import { List, ListTree, SearchX } from "lucide-react";
import {
  CountBadge,
  EmptyState,
  Eyebrow,
  ICON_SIZE,
  SearchField,
  SegmentedControl,
  Toolbar,
  ToolbarSpacer,
} from "@shared/ui";
import {
  buildFileTree,
  collectDirPaths,
  flatFileRows,
  matchesFileQuery,
  useTreeKeyboard,
  visibleTreeRows,
} from "../lib";
import { FileTreeItem } from "./FileTreeItem";
import { PICK_LAYOUT } from "./PICK_LAYOUT";
import type { DiffFile } from "@entities/mr";
import type { FileTreeRow } from "../lib";

type ViewMode = "tree" | "list";

const VIEW_OPTIONS = [
  {
    value: "tree",
    label: <span className="ui-visually-hidden">Tree</span>,
    icon: <ListTree size={ICON_SIZE.inline} aria-hidden="true" />,
    title: "Tree view",
  },
  {
    value: "list",
    label: <span className="ui-visually-hidden">List</span>,
    icon: <List size={ICON_SIZE.inline} aria-hidden="true" />,
    title: "List view",
  },
] as const;

export type FileListProps = {
  files: DiffFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

/** The changed files as a tree or a flat list, with a filter; picking one shows its diff. */
export const FileList = ({ files, selectedPath, onSelect }: FileListProps): React.ReactElement => {
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set(collectDirPaths(buildFileTree(files)))
  );
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");

  const handleToggleDir = (path: string): void => {
    setOpenDirs((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const trimmed = query.trim();
  const matched = trimmed ? files.filter((file) => matchesFileQuery(file, trimmed)) : files;
  const isTree = viewMode === "tree";
  let rows: FileTreeRow[];
  if (!isTree) {
    rows = flatFileRows(matched);
  } else {
    const tree = buildFileTree(matched);
    // While filtering, every folder holding a match is open.
    rows = visibleTreeRows(tree, trimmed ? new Set(collectDirPaths(tree)) : openDirs);
  }

  const handleActivate = (row: FileTreeRow): void => {
    if (row.file) onSelect(row.path);
    else handleToggleDir(row.path);
  };
  const keyboard = useTreeKeyboard({
    rows,
    selectedPath,
    onActivate: handleActivate,
    onToggleDir: handleToggleDir,
  });

  return (
    <div
      className="border-border bg-bg-1 flex flex-col overflow-hidden border-r"
      style={{ width: PICK_LAYOUT.filesWidthPx, flexShrink: 0 }}
    >
      <Toolbar size="sm">
        <Eyebrow as="h2">Files</Eyebrow>
        {trimmed ? (
          <span className="text-fg-2 font-mono" style={{ fontSize: "var(--fs-meta)" }}>
            {`${String(matched.length)} / ${String(files.length)}`}
          </span>
        ) : (
          <CountBadge count={files.length} label={`${String(files.length)} changed files`} />
        )}
        <ToolbarSpacer />
        <SegmentedControl
          size="sm"
          aria-label="File view"
          options={VIEW_OPTIONS}
          value={viewMode}
          onValueChange={setViewMode}
        />
      </Toolbar>

      <div className="border-border shrink-0 border-b" style={{ padding: "var(--space-2)" }}>
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder="Filter files…"
          ariaLabel="Filter files"
        />
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <div role="tree" aria-label="Changed files" style={{ paddingBlock: "var(--space-1)" }}>
          {rows.map((row, index) => (
            <FileTreeItem
              key={row.path}
              row={row}
              isSelected={row.file !== null && row.path === selectedPath}
              isTree={isTree}
              query={trimmed}
              rowProps={keyboard.getRowProps(row, index)}
              onActivate={handleActivate}
            />
          ))}
        </div>
        {rows.length === 0 && trimmed && (
          <EmptyState
            size="sm"
            icon={<SearchX size={ICON_SIZE.inline} />}
            title="No matching files"
            description={`Nothing here matches “${trimmed}”.`}
          />
        )}
      </div>
    </div>
  );
};
