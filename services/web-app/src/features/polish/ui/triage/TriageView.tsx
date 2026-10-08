import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReviewDiff } from "@entities/review";
import { Callout } from "@shared/ui";
import { EMPTY_FILTERS, GENERAL_FILE_KEY, buildDiffIndex, isFiltering } from "../../lib";
import { usePolishViewStore } from "../../model";
import { NewCommentPanel } from "./NewCommentPanel";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TriageEmptyState } from "./TriageEmptyState";
import { TriageList } from "./TriageList";
import { TriageToolbar } from "./TriageToolbar";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { NEW_COMMENT_ID, TriageContext } from "./triageContext";
import { useTriageData } from "./useTriageData";
import { useTriageHotkeys } from "./useTriageHotkeys";
import { useTriageNavigation } from "./useTriageNavigation";
import type { CommentFilters } from "../../lib";
import type { PolishActions } from "../../model";
import type { TriageCardHandlers, TriageContextValue } from "./triageContext";
import type { Comment } from "@entities/review";

export type LeaveGuard = {
  /** Run `action` now, or after the user decided what happens to an unsaved draft. */
  run: (action: () => void) => void;
  hasUnsavedDraft: () => boolean;
};

type TriageViewProps = {
  reviewId: string;
  comments: readonly Comment[];
  isLocked: boolean;
  /** Open the new-comment editor right away (the iteration has no comments yet). */
  isComposingInitially?: boolean;
  actions: PolishActions;
  registerLeaveGuard: (guard: LeaveGuard) => () => void;
};

const toggleInSet = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};

export const TriageView = ({
  reviewId,
  comments,
  isLocked,
  isComposingInitially = false,
  actions,
  registerLeaveGuard,
}: TriageViewProps): React.ReactElement => {
  const [filters, setFilters] = useState<CommentFilters>(EMPTY_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(
    isComposingInitially ? NEW_COMMENT_ID : null
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const isGrouped = usePolishViewStore((s) => s.isGroupedByFile);
  const setGrouped = usePolishViewStore((s) => s.setGroupedByFile);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: rawDiff, isLoading: isDiffLoading } = useReviewDiff(reviewId);
  const diffIndex = useMemo(
    () => (rawDiff === undefined ? null : buildDiffIndex(rawDiff)),
    [rawDiff]
  );

  const data = useTriageData({ comments, filters, editingId, isGrouped, collapsedGroups });
  const nav = useTriageNavigation({ visibleIds: data.visibleIds, editingId, setEditingId });
  const { focusedId, focusComment, startEdit, stopEdit, dropEditorOf, registerEditor } = nav;
  const { runGuarded, hasUnsavedDraft, saveUnsavedDraft, requestCancelEdit } = nav;

  useEffect(
    () => registerLeaveGuard({ run: runGuarded, hasUnsavedDraft }),
    [registerLeaveGuard, runGuarded, hasUnsavedDraft]
  );

  // Leaving by a route this view cannot intercept (stage bar, another review or iteration):
  // keep what was typed rather than drop it — the save comes with the usual Undo toast. A
  // layout cleanup runs before the editor's own effects are torn down, so it is still there.
  useLayoutEffect(() => saveUnsavedDraft, [saveUnsavedDraft]);

  const toggleContext = useCallback((id: string) => {
    setExpandedIds((prev) => toggleInSet(prev, id));
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => toggleInSet(prev, key));
  }, []);

  // Built once: every dependency is stable, so the context never changes because of focus or
  // editing, and memoised cards only re-render for their own props.
  const handlers = useMemo(
    (): TriageCardHandlers => ({
      onFocus: (id) => {
        focusComment(id);
      },
      onToggleStatus: actions.toggleStatus,
      onEdit: startEdit,
      onDelete: (id) => {
        dropEditorOf(id);
        actions.deleteComment(id);
      },
      onToggleContext: toggleContext,
      onSaveDraft: (id, changes) => {
        actions.saveDraft(id, changes);
        stopEdit();
      },
      onCancelEdit: () => {
        stopEdit();
      },
      onRequestCancelEdit: requestCancelEdit,
      onRegisterEditor: registerEditor,
    }),
    [
      actions,
      focusComment,
      startEdit,
      stopEdit,
      requestCancelEdit,
      dropEditorOf,
      registerEditor,
      toggleContext,
    ]
  );

  const contextValue = useMemo(
    (): TriageContextValue => ({ handlers, diffIndex, isDiffLoading, isLocked }),
    [handlers, diffIndex, isDiffLoading, isLocked]
  );

  const actionableIds = data.actionable.map((c) => c.id);
  const isEditing = editingId !== null;

  useTriageHotkeys({
    isEnabled: !isHelpOpen && !nav.isGuardOpen,
    isEditing,
    onMove: nav.moveFocus,
    onSetStatus: (status) => {
      if (focusedId === null) return;
      actions.setStatus([focusedId], status);
      nav.moveFocus(1);
    },
    onEdit: () => {
      if (focusedId !== null) nav.startEdit(focusedId);
    },
    onSetSeverity: (severity) => {
      if (focusedId !== null) actions.setSeverity([focusedId], severity);
    },
    onToggleContext: () => {
      if (focusedId !== null) toggleContext(focusedId);
    },
    onNew: () => {
      if (!isLocked) nav.startEdit(NEW_COMMENT_ID);
    },
    onSearch: () => searchRef.current?.focus(),
    onUndo: actions.undoLast,
    onHelp: () => {
      setIsHelpOpen(true);
    },
    onCancelEdit: requestCancelEdit,
    onSaveEdit: nav.saveEditor,
  });

  return (
    <TriageContext.Provider value={contextValue}>
      <div className="flex h-full flex-col">
        <TriageToolbar
          filters={filters}
          onFiltersChange={setFilters}
          severityCounts={data.severityCounts}
          fileOptions={data.fileOptions}
          isGrouped={isGrouped}
          onGroupedChange={setGrouped}
          searchRef={searchRef}
          shownCount={data.actionable.length}
          totalCount={comments.length}
          isPartial={isFiltering(filters) || data.actionable.length < comments.length}
          onKeepAll={() => {
            actions.setStatus(actionableIds, "kept");
          }}
          onDismissAll={() => {
            actions.setStatus(actionableIds, "dismissed");
          }}
          onSetSeverity={(severity) => {
            actions.setSeverity(actionableIds, severity);
          }}
          onAdd={() => {
            nav.startEdit(NEW_COMMENT_ID);
          }}
          isLocked={isLocked}
          onShowShortcuts={() => {
            setIsHelpOpen(true);
          }}
        />

        {isLocked && (
          <div className="border-border shrink-0 border-b px-(--space-4) py-(--space-2)">
            <Callout tone="info" size="sm">
              This iteration was already posted: comments can still be edited, but not added or
              deleted.
            </Callout>
          </div>
        )}

        {editingId === NEW_COMMENT_ID && (
          <NewCommentPanel
            defaultFile={filters.file === GENERAL_FILE_KEY ? null : filters.file}
            addComment={actions.addComment}
            onAdded={stopEdit}
            onCancel={() => {
              stopEdit();
            }}
            onRequestCancel={requestCancelEdit}
            onRegister={registerEditor}
          />
        )}

        <div className="min-h-0 flex-1">
          {data.rows.length === 0 ? (
            <TriageEmptyState
              hasComments={comments.length > 0}
              onClearFilters={() => {
                setFilters(EMPTY_FILTERS);
              }}
            />
          ) : (
            <TriageList
              rows={data.rows}
              focusedId={focusedId}
              focusRequest={nav.focusRequest}
              editingId={editingId}
              expandedIds={expandedIds}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>
      </div>

      <ShortcutsDialog
        isOpen={isHelpOpen}
        onClose={() => {
          setIsHelpOpen(false);
        }}
      />
      <UnsavedChangesDialog isOpen={nav.isGuardOpen} onChoose={nav.resolveGuard} />
    </TriageContext.Provider>
  );
};
