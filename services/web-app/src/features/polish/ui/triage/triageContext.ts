import { createContext, useContext } from "react";
import type { DiffIndex } from "../../lib";
import type { CommentDraftChanges } from "../../model";

/** What the triage view needs from whichever editor is open, without re-rendering on keystrokes. */
export type EditorHandle = {
  isDirty: () => boolean;
  /** Validate and save; false when the draft is invalid and the editor stays open. */
  save: () => boolean;
  focus: () => void;
};

export type RegisterEditor = (handle: EditorHandle) => () => void;

export type TriageCardHandlers = {
  onFocus: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleContext: (id: string) => void;
  onSaveDraft: (id: string, changes: CommentDraftChanges) => void;
  /** Close the editor and drop the draft (the Cancel button). */
  onCancelEdit: () => void;
  /** Close the editor, confirming first if the draft changed (Esc). */
  onRequestCancelEdit: () => void;
  onRegisterEditor: RegisterEditor;
};

export type TriageContextValue = {
  handlers: TriageCardHandlers;
  diffIndex: DiffIndex | null;
  isDiffLoading: boolean;
  isLocked: boolean;
};

// Holds only stable or rarely-changing values, so cards can read it without losing memoisation.
export const TriageContext = createContext<TriageContextValue | null>(null);

export const useTriageContext = (): TriageContextValue => {
  const value = useContext(TriageContext);
  if (value === null) throw new Error("useTriageContext must be used inside TriageContext");
  return value;
};

/** Id of the pseudo-comment the "new comment" editor edits. */
export const NEW_COMMENT_ID = "__new__";

export const cardDomId = (commentId: string): string => `polish-comment-${commentId}`;
