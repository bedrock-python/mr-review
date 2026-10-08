import { useState } from "react";
import { parseLineNumber } from "../../lib";
import type { CommentDraft, CommentDraftChanges } from "../../model";
import type { CommentSeverity } from "@entities/review";

type Overrides = {
  body?: string;
  severity?: CommentSeverity;
  file?: string | null;
  lineText?: string;
};

export type CommentDraftState = {
  body: string;
  severity: CommentSeverity;
  file: string | null;
  lineText: string;
  setBody: (body: string) => void;
  setSeverity: (severity: CommentSeverity) => void;
  setFile: (file: string | null) => void;
  setLineText: (lineText: string) => void;
  /** The whole draft as it would be saved. */
  draft: CommentDraft;
  /** Only the fields the user changed, compared with the saved comment. */
  changes: CommentDraftChanges;
  isValid: boolean;
  bodyError: string | null;
  lineError: string | null;
  isDirty: boolean;
};

const has = (overrides: Overrides, key: keyof Overrides): boolean =>
  Object.prototype.hasOwnProperty.call(overrides, key);

/**
 * Editor state on top of the comment's saved values.
 *
 * Only what the user touches is held locally; every other field keeps following `saved`.
 * A bulk change or an undo that lands while the editor is open therefore shows up in it, is
 * not mistaken for an edit, and saving cannot write the old value back over it.
 *
 * `isNew`: a new comment is validated and sent whole, an edit only for the touched fields.
 */
export const useCommentDraft = (saved: CommentDraft, isNew = false): CommentDraftState => {
  const [overrides, setOverrides] = useState<Overrides>({});
  const override = (patch: Overrides): void => {
    setOverrides((prev) => ({ ...prev, ...patch }));
  };

  const body = overrides.body ?? saved.body;
  const severity = overrides.severity ?? saved.severity;
  const file = has(overrides, "file") ? (overrides.file ?? null) : saved.file;
  const lineText = overrides.lineText ?? (saved.line === null ? "" : String(saved.line));

  const isAnchorTouched = has(overrides, "file") || has(overrides, "lineText");
  const parsedLine = parseLineNumber(lineText);
  // An empty line is a file-level comment; only text that is not a line number is an error.
  const line = file === null ? null : parsedLine;
  const lineError =
    (isNew || isAnchorTouched) && file !== null && lineText.trim() !== "" && parsedLine === null
      ? "Enter a line number (1 or more), or leave it empty for the whole file."
      : null;
  const bodyError =
    (isNew || has(overrides, "body")) && body.trim() === "" ? "The comment needs some text." : null;

  const changes: CommentDraftChanges = {};
  if (has(overrides, "body") && body !== saved.body) changes.body = body;
  if (has(overrides, "severity") && severity !== saved.severity) changes.severity = severity;
  if (has(overrides, "file") && file !== saved.file) changes.file = file;
  if (isAnchorTouched && line !== saved.line) changes.line = line;

  return {
    body,
    severity,
    file,
    lineText,
    setBody: (value) => {
      override({ body: value });
    },
    setSeverity: (value) => {
      override({ severity: value });
    },
    setFile: (value) => {
      override({ file: value });
    },
    setLineText: (value) => {
      override({ lineText: value });
    },
    draft: { body, severity, file, line },
    changes,
    isValid: bodyError === null && lineError === null,
    bodyError,
    lineError,
    isDirty: Object.keys(changes).length > 0,
  };
};
