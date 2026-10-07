import { memo, useCallback, useMemo } from "react";
import { Check, ChevronRight, Pencil, Trash, TriangleAlert, X } from "lucide-react";
import { cn } from "@shared/lib";
import { Markdown } from "@shared/ui";
import { describeAnchorProblem } from "../../lib";
import { CodeContext } from "./CodeContext";
import { CommentEditor } from "./CommentEditor";
import { cardDomId, useTriageContext } from "./triageContext";
import type { CommentDraft } from "../../model";
import type { Comment } from "@entities/review";

type CommentCardProps = {
  comment: Comment;
  isFocused: boolean;
  isEditing: boolean;
  isContextOpen: boolean;
};

const locationOf = (comment: Comment): string => {
  if (comment.file === null) return "general";
  return comment.line === null ? comment.file : `${comment.file}:${String(comment.line)}`;
};

const ICON_SIZE = 13;

const CommentCardBase = ({
  comment,
  isFocused,
  isEditing,
  isContextOpen,
}: CommentCardProps): React.ReactElement => {
  const { handlers, diffIndex, isLocked } = useTriageContext();
  const { id } = comment;
  const isDismissed = comment.status === "dismissed";
  const anchorProblem = describeAnchorProblem(diffIndex, comment.file, comment.line);
  const initialDraft = useMemo(
    (): CommentDraft => ({
      body: comment.body,
      severity: comment.severity,
      file: comment.file,
      line: comment.line,
    }),
    [comment.body, comment.severity, comment.file, comment.line]
  );
  const { onSaveDraft } = handlers;
  const handleSave = useCallback(
    (draft: CommentDraft) => {
      onSaveDraft(id, draft);
    },
    [onSaveDraft, id]
  );

  return (
    <article
      id={cardDomId(id)}
      data-comment-id={id}
      tabIndex={isFocused ? 0 : -1}
      aria-current={isFocused ? "true" : undefined}
      aria-label={`${comment.severity} comment on ${locationOf(comment)}`}
      onFocus={() => {
        if (!isFocused) handlers.onFocus(id);
      }}
      className={cn(
        "bg-bg-1 rounded-[10px] border px-3.5 py-3 transition-colors outline-none",
        isFocused
          ? "border-accent shadow-[inset_3px_0_0_var(--accent)]"
          : "border-border hover:border-border-strong"
      )}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className={cn("sev", comment.severity)}>
          <span className="dot" />
          {comment.severity}
        </span>
        {comment.file === null ? (
          <span className="chip dim text-[10px]">general</span>
        ) : (
          <span className="text-fg-1 font-mono text-[11px] break-all">{locationOf(comment)}</span>
        )}
        {anchorProblem !== null && (
          <span className="chip text-[var(--c-major)]" title={anchorProblem}>
            <TriangleAlert size={11} aria-hidden="true" />
            not in diff
          </span>
        )}
        {isDismissed && <span className="chip text-fg-3">dismissed</span>}
        <div className="ml-auto flex gap-0.5">
          <button
            type="button"
            className="icon-btn"
            aria-label={isDismissed ? "Keep comment" : "Dismiss comment"}
            title={isDismissed ? "Keep (a)" : "Dismiss (d)"}
            onClick={() => {
              handlers.onToggleStatus(id);
            }}
          >
            {isDismissed ? <Check size={ICON_SIZE} /> : <X size={ICON_SIZE} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit comment"
            title="Edit (e)"
            disabled={isEditing}
            onClick={() => {
              handlers.onEdit(id);
            }}
          >
            <Pencil size={ICON_SIZE} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete comment"
            title={isLocked ? "This iteration was posted; comments can't be deleted" : "Delete"}
            disabled={isLocked}
            onClick={() => {
              handlers.onDelete(id);
            }}
          >
            <Trash size={ICON_SIZE} />
          </button>
        </div>
      </header>

      {isEditing ? (
        <CommentEditor
          initial={initialDraft}
          mode="edit"
          onSave={handleSave}
          onCancel={handlers.onCancelEdit}
          onRegister={handlers.onRegisterEditor}
        />
      ) : (
        <div className={cn("text-[12.5px]", isDismissed && "opacity-55")}>
          <Markdown>{comment.body}</Markdown>
        </div>
      )}

      {comment.file !== null && comment.line !== null && (
        <div className="mt-1.5">
          <button
            type="button"
            aria-expanded={isContextOpen}
            onClick={() => {
              handlers.onToggleContext(id);
            }}
            className="text-fg-3 hover:text-fg-1 flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase"
          >
            <ChevronRight
              size={11}
              aria-hidden="true"
              className={cn("transition-transform", isContextOpen && "rotate-90")}
            />
            code context
          </button>
          {isContextOpen && (
            <div className="border-border bg-bg-0 mt-1.5 overflow-hidden rounded-md border">
              <CodeContext file={comment.file} line={comment.line} />
            </div>
          )}
        </div>
      )}
    </article>
  );
};

// Cards re-render only when their own comment or flags change; the handlers come from a
// stable context, so moving focus or editing one card leaves the others untouched.
export const CommentCard = memo(CommentCardBase);
