import { useState } from "react";
import { Button, Card } from "@shared/ui";
import { escapeGlob, excludedSummary } from "../lib";
import type { ExcludedFiles } from "@entities/review";

const LIST_PREVIEW = 8;

export type ExcludedFilesListProps = {
  excluded: ExcludedFiles;
  /** Called with the exclude pattern that takes one file back in. */
  onReviewAnyway: (pattern: string) => void;
};

/** The files the path filters leave out, each with the pattern that did it. */
export const ExcludedFilesList = ({
  excluded,
  onReviewAnyway,
}: ExcludedFilesListProps): React.ReactElement => {
  const [showAll, setShowAll] = useState(false);
  const files = excluded.excluded;
  const shown = showAll ? files : files.slice(0, LIST_PREVIEW);

  return (
    <Card surface="sunken" padding="none">
      <p
        className="text-fg-1 border-border m-0 border-b"
        style={{ fontSize: "var(--fs-control)", padding: "var(--space-2) var(--space-3)" }}
      >
        {excludedSummary(excluded)}
      </p>
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
                variant="ghost"
                size="sm"
                className="shrink-0"
                aria-label={`Review ${file.path} anyway`}
                onClick={() => {
                  onReviewAnyway(`!/${escapeGlob(file.path)}`);
                }}
              >
                Review anyway
              </Button>
            )}
          </li>
        ))}
      </ul>
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
