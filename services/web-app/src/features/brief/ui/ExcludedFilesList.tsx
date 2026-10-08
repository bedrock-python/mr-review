import { useRef, useState } from "react";
import { cn } from "@shared/lib";
import { Button, Card } from "@shared/ui";
import { escapeGlob, excludedSummary } from "../lib";
import type { ExcludedFiles } from "@entities/review";

const LIST_PREVIEW = 8;

const takeBackPattern = (path: string): string => `!/${escapeGlob(path)}`;

export type ExcludedFilesListProps = {
  excluded: ExcludedFiles;
  /** The exclude patterns now in the brief: a file taken back stays listed until re-checked. */
  excludePatterns: readonly string[];
  /** Called with the exclude pattern that takes one file back in. */
  onReviewAnyway: (pattern: string) => void;
};

/** The files the path filters leave out, each with the pattern that did it. */
export const ExcludedFilesList = ({
  excluded,
  excludePatterns,
  onReviewAnyway,
}: ExcludedFilesListProps): React.ReactElement => {
  const [showAll, setShowAll] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const files = excluded.excluded;
  const shown = showAll ? files : files.slice(0, LIST_PREVIEW);
  const summary =
    excludedSummary(excluded) ?? `All ${String(excluded.total)} changed files are reviewed.`;

  // The row taken back leaves the list once the filters are re-checked, and its button with
  // it: focus moves on now, to the next file that can be taken back, else to the summary.
  const handleReviewAnyway = (path: string): void => {
    const open = shown.filter(
      (file) =>
        !file.reason.startsWith("(") &&
        (file.path === path || !excludePatterns.includes(takeBackPattern(file.path)))
    );
    const index = open.findIndex((file) => file.path === path);
    const target = open[index + 1] ?? open[index - 1];
    (target ? buttons.current.get(target.path) : summaryRef.current)?.focus();
    onReviewAnyway(takeBackPattern(path));
  };

  return (
    <Card surface="sunken" padding="none">
      <p
        ref={summaryRef}
        tabIndex={-1}
        aria-live="polite"
        className={cn(
          "text-fg-1 border-border m-0 -outline-offset-2",
          files.length > 0 && "border-b"
        )}
        style={{ fontSize: "var(--fs-control)", padding: "var(--space-2) var(--space-3)" }}
      >
        {summary}
      </p>
      {files.length > 0 && (
        <ul className="m-0 list-none p-0">
          {shown.map((file) => (
            <li
              key={file.path}
              className="border-border flex items-center border-b font-mono last:border-b-0"
              style={{
                gap: "var(--space-3)",
                minHeight: "var(--control-md)",
                padding: "0 var(--space-1) 0 var(--space-3)",
                fontSize: "var(--fs-meta)",
              }}
            >
              {/* Path and reason share the row 2:1; both clip and show the rest on hover. */}
              <span className="text-fg-1 min-w-0 flex-[2_1_0%] truncate" title={file.path}>
                {file.path}
              </span>
              <span
                className="text-fg-2 min-w-0 flex-[1_1_0%] truncate text-right"
                title={file.reason}
              >
                {file.reason}
              </span>
              {/* "(not matched by the include patterns)": an exclude pattern cannot undo that. */}
              {file.reason.startsWith("(") ? null : (
                <Button
                  ref={(element) => {
                    if (element) buttons.current.set(file.path, element);
                    else buttons.current.delete(file.path);
                  }}
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Review anyway: ${file.path}`}
                  onClick={() => {
                    handleReviewAnyway(file.path);
                  }}
                >
                  Review anyway
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {files.length > LIST_PREVIEW && (
        <div className="border-border border-t" style={{ padding: "var(--space-1)" }}>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            onClick={() => {
              setShowAll((all) => !all);
            }}
          >
            {showAll ? "Show fewer" : `Show all ${String(files.length)}`}
          </Button>
        </div>
      )}
    </Card>
  );
};
