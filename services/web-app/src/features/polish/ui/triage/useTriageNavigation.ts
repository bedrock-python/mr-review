import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NEW_COMMENT_ID } from "./triageContext";
import type { FocusRequest } from "./TriageList";
import type { EditorHandle, RegisterEditor } from "./triageContext";
import type { UnsavedChoice } from "./UnsavedChangesDialog";

type FocusMemory = { id: string | null; index: number };

/** `wasDeferred` is true when the action ran after the unsaved-changes dialog. */
export type GuardedAction = (wasDeferred: boolean) => void;

export type TriageNavigation = {
  focusedId: string | null;
  focusRequest: FocusRequest | null;
  isGuardOpen: boolean;
  focusComment: (id: string, isFromKeyboard?: boolean) => void;
  moveFocus: (delta: number) => void;
  startEdit: (id: string) => void;
  /** Close the editor and give keyboard focus to `nextFocusId` or back to the edited card. */
  stopEdit: (nextFocusId?: string) => void;
  saveEditor: () => void;
  /** Close the editor if it belongs to `id` (the comment is going away). */
  dropEditorOf: (id: string) => void;
  runGuarded: (action: GuardedAction) => void;
  resolveGuard: (choice: UnsavedChoice) => void;
  registerEditor: RegisterEditor;
};

type UseTriageNavigationArgs = {
  visibleIds: readonly string[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
};

/**
 * Focus, editing and the unsaved-changes guard for the triage list.
 *
 * Focus is remembered as an id plus its last position: when the focused comment drops out
 * of the list (dismissed under a "kept" filter, deleted), focus lands on whatever now sits
 * at that position instead of jumping back to the top.
 */
export const useTriageNavigation = ({
  visibleIds,
  editingId,
  setEditingId,
}: UseTriageNavigationArgs): TriageNavigation => {
  const [focus, setFocus] = useState<FocusMemory>({ id: null, index: 0 });
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<{ run: GuardedAction } | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const focusedId = useMemo(() => {
    if (focus.id !== null && visibleIds.includes(focus.id)) return focus.id;
    return visibleIds[Math.min(focus.index, visibleIds.length - 1)] ?? null;
  }, [focus, visibleIds]);

  // Stable callbacks below read the latest render through this ref.
  const latest = useRef({ focusedId, visibleIds, editingId });
  useLayoutEffect(() => {
    latest.current = { focusedId, visibleIds, editingId };
  });

  const requestDomFocus = useCallback((id: string) => {
    setFocusRequest((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const closeEditor = useCallback(() => {
    // Forget the handle now: until the editor unmounts it would still report its draft as dirty.
    editorRef.current = null;
    setEditingId(null);
  }, [setEditingId]);

  const registerEditor = useCallback<RegisterEditor>((handle) => {
    editorRef.current = handle;
    return () => {
      if (editorRef.current === handle) editorRef.current = null;
    };
  }, []);

  const runGuarded = useCallback((action: GuardedAction) => {
    if (editorRef.current?.isDirty() === true) {
      setPendingAction({ run: action });
      return;
    }
    action(false);
  }, []);

  const applyFocus = useCallback(
    (id: string, shouldTakeDomFocus: boolean) => {
      const { visibleIds: ids, editingId: editing } = latest.current;
      if (editing !== null && editing !== id) closeEditor();
      setFocus({ id, index: Math.max(0, ids.indexOf(id)) });
      if (shouldTakeDomFocus) requestDomFocus(id);
    },
    [closeEditor, requestDomFocus]
  );

  const focusComment = useCallback(
    (id: string, isFromKeyboard = false) => {
      const { focusedId: current, editingId: editing } = latest.current;
      if (id === current && !isFromKeyboard) return;
      if (editing === null || editing === id) {
        applyFocus(id, isFromKeyboard);
        return;
      }
      // After the dialog the clicked card no longer holds DOM focus, so take it explicitly.
      runGuarded((wasDeferred) => {
        applyFocus(id, isFromKeyboard || wasDeferred);
      });
    },
    [applyFocus, runGuarded]
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const { focusedId: current, visibleIds: ids } = latest.current;
      if (ids.length === 0) return;
      const index = current === null ? -1 : ids.indexOf(current);
      const next = ids[Math.min(Math.max(index + delta, 0), ids.length - 1)];
      if (next !== undefined) focusComment(next, true);
    },
    [focusComment]
  );

  const startEdit = useCallback(
    (id: string) => {
      if (latest.current.editingId === id) {
        editorRef.current?.focus();
        return;
      }
      runGuarded(() => {
        editorRef.current = null;
        setEditingId(id);
        if (id !== NEW_COMMENT_ID) {
          setFocus({ id, index: Math.max(0, latest.current.visibleIds.indexOf(id)) });
        }
      });
    },
    [runGuarded, setEditingId]
  );

  const stopEdit = useCallback(
    (nextFocusId?: string) => {
      const { editingId: editing, focusedId: current, visibleIds: ids } = latest.current;
      closeEditor();
      if (nextFocusId !== undefined) {
        setFocus({ id: nextFocusId, index: Math.max(0, ids.indexOf(nextFocusId)) });
      }
      // Hand keyboard focus back to a card so the triage keys work again.
      const editedCard = editing !== null && editing !== NEW_COMMENT_ID ? editing : current;
      const target = nextFocusId ?? editedCard;
      if (target !== null) requestDomFocus(target);
    },
    [closeEditor, requestDomFocus]
  );

  const saveEditor = useCallback(() => {
    editorRef.current?.save();
  }, []);

  const dropEditorOf = useCallback(
    (id: string) => {
      if (latest.current.editingId === id) closeEditor();
    },
    [closeEditor]
  );

  const resolveGuard = useCallback(
    (choice: UnsavedChoice) => {
      const pending = pendingAction;
      setPendingAction(null);
      if (pending === null) return;
      const editor = editorRef.current;
      if (choice === "keep-editing") {
        editor?.focus();
        return;
      }
      if (choice === "save" && editor !== null && !editor.save()) {
        editor.focus();
        return;
      }
      if (choice === "discard") closeEditor();
      pending.run(true);
    },
    [pendingAction, closeEditor]
  );

  return {
    focusedId,
    focusRequest,
    isGuardOpen: pendingAction !== null,
    focusComment,
    moveFocus,
    startEdit,
    stopEdit,
    saveEditor,
    dropEditorOf,
    runGuarded,
    resolveGuard,
    registerEditor,
  };
};
