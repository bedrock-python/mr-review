import { cn } from "@shared/lib";
import type { DiffFile } from "@entities/mr";

export type FileListProps = {
  files: DiffFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

const basename = (path: string): string => path.split("/").pop() ?? path;

export const FileList = ({ files, selectedPath, onSelect }: FileListProps): React.ReactElement => {
  return (
    <div
      className="flex items-stretch overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0"
      role="tablist"
      aria-label="Changed files"
    >
      {files.map((file) => {
        const isActive = file.path === selectedPath;
        return (
          <button
            key={file.path}
            role="tab"
            aria-selected={isActive}
            title={file.path}
            onClick={() => onSelect(file.path)}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 text-xs font-mono whitespace-nowrap",
              "border-b-2 transition-colors flex-shrink-0",
              isActive
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border)]",
            )}
          >
            <span className="max-w-[160px] truncate">{basename(file.path)}</span>
            <span className="text-green-400">+{file.additions}</span>
            <span className="text-red-400">-{file.deletions}</span>
          </button>
        );
      })}
    </div>
  );
};
