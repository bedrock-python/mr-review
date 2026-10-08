import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { describeAnchorProblem, parseLineNumber } from "../../lib";
import { useTriageContext } from "./triageContext";

type AnchorFieldsProps = {
  file: string | null;
  lineText: string;
  lineError: string | null;
  onFileChange: (file: string | null) => void;
  onLineChange: (lineText: string) => void;
};

const GENERAL_OPTION = "";

export const AnchorFields = ({
  file,
  lineText,
  lineError,
  onFileChange,
  onLineChange,
}: AnchorFieldsProps): React.ReactElement => {
  const { diffIndex, isDiffLoading } = useTriageContext();

  // The current file stays selectable even when it is not in the diff, so opening the editor
  // never silently re-anchors a comment.
  const files = useMemo(() => {
    const diffFiles = diffIndex?.files ?? [];
    return file === null || diffFiles.includes(file) ? diffFiles : [file, ...diffFiles];
  }, [diffIndex, file]);

  const warning =
    lineError === null ? describeAnchorProblem(diffIndex, file, parseLineNumber(lineText)) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-2 font-mono text-[10px] tracking-[0.08em] uppercase">anchor</span>
        <select
          aria-label="Anchor file"
          value={file ?? GENERAL_OPTION}
          onChange={(event) => {
            onFileChange(event.target.value === GENERAL_OPTION ? null : event.target.value);
          }}
          className="border-border bg-bg-0 text-fg-1 max-w-[340px] min-w-0 flex-1 rounded-md border px-2 py-1 font-mono text-[11px]"
        >
          <option value={GENERAL_OPTION}>General comment (no line)</option>
          {files.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
        {file !== null && (
          <label className="text-fg-2 flex items-center gap-1.5 font-mono text-[11px]">
            line
            <input
              aria-label="Line number"
              aria-invalid={lineError !== null}
              inputMode="numeric"
              value={lineText}
              onChange={(event) => {
                onLineChange(event.target.value);
              }}
              className="border-border bg-bg-0 text-fg-0 w-20 rounded-md border px-2 py-1 font-mono text-[11px] aria-[invalid=true]:border-[var(--c-critical)]"
            />
          </label>
        )}
        {isDiffLoading && <span className="text-fg-2 text-[11px]">Loading diff files…</span>}
      </div>
      {lineError !== null && (
        <p role="alert" className="text-[11px] text-[var(--c-critical)]">
          {lineError}
        </p>
      )}
      {warning !== null && (
        <p role="note" className="flex items-center gap-1.5 text-[11px] text-[var(--c-major)]">
          <TriangleAlert size={12} aria-hidden="true" />
          {warning}
        </p>
      )}
    </div>
  );
};
