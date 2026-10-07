import { useState } from "react";
import { parseLineNumber } from "../../lib";
import type { CommentDraft } from "../../model";
import type { CommentSeverity } from "@entities/review";

export type CommentDraftState = {
  body: string;
  severity: CommentSeverity;
  file: string | null;
  lineText: string;
  setBody: (body: string) => void;
  setSeverity: (severity: CommentSeverity) => void;
  setFile: (file: string | null) => void;
  setLineText: (lineText: string) => void;
  /** The validated draft, or null while the form is invalid. */
  draft: CommentDraft | null;
  bodyError: string | null;
  lineError: string | null;
  isDirty: boolean;
};

export const useCommentDraft = (initial: CommentDraft): CommentDraftState => {
  const [body, setBody] = useState(initial.body);
  const [severity, setSeverity] = useState<CommentSeverity>(initial.severity);
  const [file, setFile] = useState<string | null>(initial.file);
  const [lineText, setLineText] = useState(initial.line === null ? "" : String(initial.line));

  const line = file === null ? null : parseLineNumber(lineText);
  const bodyError = body.trim().length === 0 ? "The comment needs some text." : null;
  const lineError =
    file !== null && line === null ? "Enter a line number (1 or more), or pick General." : null;

  const isDirty =
    body !== initial.body ||
    severity !== initial.severity ||
    file !== initial.file ||
    (file !== null && line !== initial.line);

  return {
    body,
    severity,
    file,
    lineText,
    setBody,
    setSeverity,
    setFile,
    setLineText,
    draft: bodyError === null && lineError === null ? { body, severity, file, line } : null,
    bodyError,
    lineError,
    isDirty,
  };
};
