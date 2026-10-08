import { useCallback, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { reviewApi, reviewKeys } from "@entities/review";

import type { ImportResponseResult } from "@entities/review";

export type ImportStatus = "idle" | "loading" | "done" | "error";

type DraftState = {
  /** The review the draft belongs to; another review starts from an empty one. */
  reviewId: string | null;
  /** The AI response as pasted, dropped or loaded. */
  text: string;
  /** The text editor is shown even while the text is empty (Paste text). */
  isEditorOpen: boolean;
  status: ImportStatus;
  result: ImportResponseResult | null;
  error: string | null;
};

export type ResponseDraft = Omit<DraftState, "reviewId"> & {
  /** Puts `text` in the editor and drops the last import's report. */
  load: (text: string) => void;
  openEditor: () => void;
  clear: () => void;
  /** Back from an import report to the text it came from. */
  edit: () => void;
  submit: () => void;
};

const emptyDraft = (reviewId: string | null): DraftState => ({
  reviewId,
  text: "",
  isEditorOpen: false,
  status: "idle",
  result: null,
  error: null,
});

/**
 * The Copy & paste response and its import. Held by the stage rather than the step that shows
 * it, so switching to "Run in app" and back keeps what was pasted and what the import reported.
 */
export const useResponseDraft = (
  reviewId: string | null,
  iterationId: string | null
): ResponseDraft => {
  const qc = useQueryClient();
  const [state, setState] = useState<DraftState>(() => emptyDraft(reviewId));
  // A response pasted for one review must not be imported into another.
  const draft = state.reviewId === reviewId ? state : emptyDraft(reviewId);
  if (draft !== state) setState(draft);

  const load = useCallback(
    (text: string): void => {
      setState({ ...emptyDraft(reviewId), text, isEditorOpen: true });
    },
    [reviewId]
  );

  const openEditor = useCallback((): void => {
    setState((current) => ({ ...current, isEditorOpen: true }));
  }, []);

  const clear = useCallback((): void => {
    setState(emptyDraft(reviewId));
  }, [reviewId]);

  const edit = useCallback((): void => {
    setState((current) => ({ ...current, status: "idle", result: null }));
  }, []);

  const submit = (): void => {
    if (reviewId === null || draft.text.trim() === "" || draft.status === "loading") return;
    const text = draft.text;
    setState((current) => ({ ...current, status: "loading", result: null, error: null }));
    void reviewApi
      .importResponse(reviewId, text, iterationId)
      .then((result) => {
        setState((current) =>
          current.reviewId === reviewId ? { ...current, status: "done", result } : current
        );
        void qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
      })
      .catch((err: unknown) => {
        setState((current) =>
          current.reviewId === reviewId
            ? {
                ...current,
                status: "error",
                error: err instanceof Error ? err.message : "Import failed",
              }
            : current
        );
      });
  };

  return {
    text: draft.text,
    isEditorOpen: draft.isEditorOpen,
    status: draft.status,
    result: draft.result,
    error: draft.error,
    load,
    openEditor,
    clear,
    edit,
    submit,
  };
};
