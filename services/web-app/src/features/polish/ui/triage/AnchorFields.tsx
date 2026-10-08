import { useId, useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Field, ICON_SIZE, Input, Select } from "@shared/ui";
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

/** Where a comment is posted: a file of the diff (and a line), or the merge request itself. */
export const AnchorFields = ({
  file,
  lineText,
  lineError,
  onFileChange,
  onLineChange,
}: AnchorFieldsProps): React.ReactElement => {
  const { diffIndex, isDiffLoading } = useTriageContext();
  const lineErrorId = useId();

  // The current file stays selectable even when it is not in the diff, so opening the editor
  // never silently re-anchors a comment.
  const files = useMemo(() => {
    const diffFiles = diffIndex?.files ?? [];
    return file === null || diffFiles.includes(file) ? diffFiles : [file, ...diffFiles];
  }, [diffIndex, file]);

  const warning =
    lineError === null ? describeAnchorProblem(diffIndex, file, parseLineNumber(lineText)) : null;

  return (
    <>
      <Field
        label="Anchor file"
        hint={isDiffLoading ? "Loading the files of the diff…" : undefined}
        className="max-w-96 min-w-48 flex-1"
      >
        <Select
          size="sm"
          value={file ?? GENERAL_OPTION}
          onChange={(event) => {
            onFileChange(event.target.value === GENERAL_OPTION ? null : event.target.value);
          }}
        >
          <option value={GENERAL_OPTION}>General comment (no line)</option>
          {files.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </Select>
      </Field>
      {file !== null && (
        <Field label="Line" className="w-20">
          <Input
            size="sm"
            isMono
            aria-label="Line number"
            inputMode="numeric"
            isInvalid={lineError !== null}
            aria-describedby={lineError === null ? undefined : lineErrorId}
            value={lineText}
            onChange={(event) => {
              onLineChange(event.target.value);
            }}
          />
        </Field>
      )}
      {lineError !== null && (
        <p
          id={lineErrorId}
          role="alert"
          className="basis-full text-(length:--fs-meta) text-(--c-critical-fg)"
        >
          {lineError}
        </p>
      )}
      {warning !== null && (
        <p
          role="note"
          className="flex basis-full items-center gap-1.5 text-(length:--fs-meta) text-(--c-major-fg)"
        >
          <TriangleAlert size={ICON_SIZE.inline} aria-hidden="true" />
          {warning}
        </p>
      )}
    </>
  );
};
