import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reviewKeys } from "@entities/review";
import { planPatch } from "./planPatch";
import { useCommentSync } from "./useCommentSync";
import type { CommentFieldPatch, CommentPatches, CommentSync } from "./commentSync";
import type {
  Comment,
  CommentSeverity,
  CommentStatus,
  NewCommentInput,
  Review,
} from "@entities/review";

export type CommentDraft = {
  body: string;
  severity: CommentSeverity;
  file: string | null;
  line: number | null;
};

export type PolishActions = {
  updateComment: (id: string, patch: CommentFieldPatch) => void;
  setStatus: (ids: readonly string[], status: CommentStatus) => void;
  /** Flip kept/dismissed based on the cached state at call time, not a render snapshot. */
  toggleStatus: (id: string) => void;
  setSeverity: (ids: readonly string[], severity: CommentSeverity) => void;
  saveDraft: (id: string, draft: CommentDraft) => void;
  addComment: (draft: CommentDraft) => Promise<Comment | null>;
  deleteComment: (id: string) => void;
  undoLast: () => void;
  flush: () => Promise<void>;
};

type UndoEntry = { label: string; isDone: boolean; run: () => void };

// One toast slot: rapid triage replaces the message instead of stacking dozens of toasts.
const UNDO_TOAST_ID = "polish-undo";
const MAX_UNDO_ENTRIES = 50;

const toNewComment = (draft: CommentDraft): NewCommentInput => {
  const hasAnchor = draft.file !== null && draft.line !== null && draft.line >= 1;
  return {
    file: draft.file,
    line: hasAnchor ? draft.line : null,
    severity: draft.severity,
    body: draft.body,
  };
};

const subjectOf = (count: number): string =>
  count === 1 ? "comment" : `${String(count)} comments`;

const describe = (count: number, patch: CommentFieldPatch): string => {
  const keys = Object.keys(patch);
  if (keys.length === 1 && patch.status !== undefined) {
    const verb = patch.status === "kept" ? "Kept" : "Dismissed";
    return count === 1 ? `Comment ${verb.toLowerCase()}` : `${verb} ${subjectOf(count)}`;
  }
  if (keys.length === 1 && patch.severity !== undefined) {
    return `Set ${subjectOf(count)} to ${patch.severity}`;
  }
  return count === 1 ? "Comment updated" : `Updated ${subjectOf(count)}`;
};

const createActions = (
  sync: CommentSync,
  getComments: () => readonly Comment[],
  iterationId: string,
  undoStack: UndoEntry[]
): PolishActions => {
  const runUndo = (entry: UndoEntry): void => {
    if (entry.isDone) return;
    entry.isDone = true;
    entry.run();
    toast(`Undone: ${entry.label}`, { id: UNDO_TOAST_ID });
  };

  const pushUndo = (label: string, run: () => void): void => {
    const entry: UndoEntry = { label, isDone: false, run };
    undoStack.push(entry);
    if (undoStack.length > MAX_UNDO_ENTRIES) undoStack.shift();
    toast(label, {
      id: UNDO_TOAST_ID,
      action: {
        label: "Undo",
        onClick: () => {
          runUndo(entry);
        },
      },
    });
  };

  const applyChanges = (changes: CommentPatches, label: (count: number) => string): void => {
    const { forward, inverse } = planPatch(getComments(), changes);
    if (forward.size === 0) return;
    sync.patch(iterationId, forward);
    pushUndo(label(forward.size), () => {
      sync.patch(iterationId, inverse);
    });
  };

  const sameForAll = (ids: readonly string[], patch: CommentFieldPatch): CommentPatches =>
    new Map(ids.map((id) => [id, patch]));

  const restore = (comment: Comment): void => {
    sync
      .add(iterationId, toNewComment(comment))
      .then((created) => {
        const extra: CommentFieldPatch = {};
        if (comment.status !== created.status) extra.status = comment.status;
        if (comment.resolved !== created.resolved) extra.resolved = comment.resolved;
        if (Object.keys(extra).length > 0) sync.patch(iterationId, new Map([[created.id, extra]]));
      })
      .catch((error: unknown) => {
        toast.error("Failed to restore the comment", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return {
    updateComment: (id, patch) => {
      applyChanges(new Map([[id, patch]]), (count) => describe(count, patch));
    },
    setStatus: (ids, status) => {
      applyChanges(sameForAll(ids, { status }), (count) => describe(count, { status }));
    },
    toggleStatus: (id) => {
      const comment = getComments().find((c) => c.id === id);
      if (comment === undefined) return;
      const status = comment.status === "dismissed" ? "kept" : "dismissed";
      applyChanges(new Map([[id, { status }]]), (count) => describe(count, { status }));
    },
    setSeverity: (ids, severity) => {
      applyChanges(sameForAll(ids, { severity }), (count) => describe(count, { severity }));
    },
    saveDraft: (id, draft) => {
      const patch: CommentFieldPatch = {
        body: draft.body,
        severity: draft.severity,
        file: draft.file,
        line: draft.file === null ? null : draft.line,
      };
      applyChanges(new Map([[id, patch]]), () => "Comment updated");
    },
    addComment: async (draft) => {
      try {
        const created = await sync.add(iterationId, toNewComment(draft));
        pushUndo("Comment added", () => {
          void sync.remove(iterationId, created.id);
        });
        return created;
      } catch (error) {
        toast.error("Failed to add the comment", {
          description: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    deleteComment: (id) => {
      const comment = getComments().find((c) => c.id === id);
      if (comment === undefined) return;
      const removal = sync.remove(iterationId, id);
      pushUndo("Comment deleted", () => {
        void removal.then((isRemoved) => {
          if (isRemoved) restore(comment);
        });
      });
    },
    undoLast: () => {
      const entry = [...undoStack].reverse().find((e) => !e.isDone);
      if (entry === undefined) {
        toast("Nothing to undo", { id: UNDO_TOAST_ID });
        return;
      }
      runUndo(entry);
    },
    flush: () => sync.flush(),
  };
};

export type UsePolishActionsResult = {
  actions: PolishActions;
  isSaving: boolean;
};

/**
 * Every comment change in the Polish stage: optimistic, coalesced, and undoable.
 *
 * The returned `actions` object is stable for a given review and iteration — the current
 * comments are read from the query cache at call time — so memoised cards never re-render
 * just because a sibling changed.
 */
export const usePolishActions = (reviewId: string, iterationId: string): UsePolishActionsResult => {
  const queryClient = useQueryClient();
  const { sync, isSaving } = useCommentSync(reviewId);
  // A mutable list that lives as long as the stage; changes to it never need a render.
  const [undoStack] = useState<UndoEntry[]>(() => []);

  const actions = useMemo(() => {
    const getComments = (): readonly Comment[] =>
      queryClient
        .getQueryData<Review>(reviewKeys.detail(reviewId))
        ?.iterations.find((it) => it.id === iterationId)?.comments ?? [];
    return createActions(sync, getComments, iterationId, undoStack);
  }, [queryClient, reviewId, iterationId, sync, undoStack]);

  return { actions, isSaving };
};
