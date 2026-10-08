import { memo, useCallback, useMemo } from "react";
import { Check, ChevronRight, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import { SeverityBadge } from "@entities/review";
import { cn } from "@shared/lib";
import { Badge, Button, Card, ICON_SIZE, IconButton, Kbd, Markdown } from "@shared/ui";
import { describeAnchorProblem } from "../../lib";
import { CodeContext } from "./CodeContext";
import { CommentEditor } from "./CommentEditor";
import { cardDomId, useTriageContext } from "./triageContext";
import type { CommentDraft, CommentDraftChanges } from "../../model";
import type { Comment } from "@entities/review";

type CommentCardProps = {
  comment: Comment;
  isFocused: boolean;
  isEditing: boolean;
  isContextOpen: boolean;
};

/** The icon size Badge is laid out for. */
const BADGE_ICON_PX = 12;

const locationOf = (comment: Comment): string => {
  if (comment.file === null) return "general";
  return comment.line === null ? comment.file : `${comment.file}:${String(comment.line)}`;
};

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
  const saved = useMemo(
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
    (_draft: CommentDraft, changes: CommentDraftChanges) => {
      onSaveDraft(id, changes);
    },
    [onSaveDraft, id]
  );

  return (
    <Card
      as="article"
      padding="sm"
      id={cardDomId(id)}
      data-comment-id={id}
      tabIndex={isFocused ? 0 : -1}
      aria-current={isFocused ? "true" : undefined}
      aria-label={`${comment.severity} comment on ${locationOf(comment)}`}
      onFocus={() => {
        if (!isFocused) handlers.onFocus(id);
      }}
      className={cn(
        "group flex flex-col gap-(--space-2) transition-colors",
        // A keyboard focus ring lies over the border instead of floating outside it.
        "focus-visible:-outline-offset-1",
        isFocused
          ? "border-accent-fg shadow-[inset_3px_0_0_var(--accent)]"
          : "hover:border-border-strong"
      )}
    >
      <header className="flex min-h-(--control-sm) flex-wrap items-center gap-(--space-2)">
        <SeverityBadge severity={comment.severity} />
        {comment.file === null ? (
          <Badge variant="outline">general</Badge>
        ) : (
          <span className="text-fg-1 font-mono text-(length:--fs-meta) break-all">
            {locationOf(comment)}
          </span>
        )}
        {anchorProblem !== null && (
          <Badge
            tone="warn"
            variant="outline"
            title={anchorProblem}
            icon={<TriangleAlert size={BADGE_ICON_PX} aria-hidden="true" />}
          >
            not in diff
          </Badge>
        )}
        {isDismissed && <Badge>dismissed</Badge>}
        <div
          className={cn(
            "ml-auto flex gap-(--space-1) transition-opacity duration-(--dur-fast)",
            // The focused card always shows its actions; the others on hover or keyboard focus.
            isFocused
              ? "opacity-100"
              : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          )}
        >
          <IconButton
            size="sm"
            label={isDismissed ? "Keep comment" : "Dismiss comment"}
            shortcut={isDismissed ? "a" : "d"}
            icon={
              isDismissed ? (
                <Check size={ICON_SIZE.inline} aria-hidden="true" />
              ) : (
                <X size={ICON_SIZE.inline} aria-hidden="true" />
              )
            }
            onClick={() => {
              handlers.onToggleStatus(id);
            }}
          />
          <IconButton
            size="sm"
            label="Edit comment"
            shortcut="e"
            disabled={isEditing}
            icon={<Pencil size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={() => {
              handlers.onEdit(id);
            }}
          />
          <IconButton
            size="sm"
            variant="danger"
            label="Delete comment"
            disabled={isLocked}
            icon={<Trash2 size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={() => {
              handlers.onDelete(id);
            }}
          />
        </div>
      </header>

      {isEditing ? (
        <CommentEditor
          saved={saved}
          mode="edit"
          onSave={handleSave}
          onCancel={handlers.onCancelEdit}
          onRequestCancel={handlers.onRequestCancelEdit}
          onRegister={handlers.onRegisterEditor}
        />
      ) : (
        <div className={cn(isDismissed && "opacity-55")}>
          {/* The card's gap spaces the blocks; the last one's own margin would double it. */}
          <Markdown className="[&>:last-child]:mb-0!">{comment.body}</Markdown>
        </div>
      )}

      {comment.file !== null && comment.line !== null && (
        <div className="flex flex-col items-start gap-(--space-2)">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-(--space-2)"
            aria-expanded={isContextOpen}
            icon={
              <ChevronRight
                size={ICON_SIZE.inline}
                aria-hidden="true"
                className={cn("transition-transform", isContextOpen && "rotate-90")}
              />
            }
            iconRight={
              <span aria-hidden="true">
                <Kbd>c</Kbd>
              </span>
            }
            onClick={() => {
              handlers.onToggleContext(id);
            }}
          >
            {isContextOpen ? "Hide code" : "Show code"}
          </Button>
          {isContextOpen && (
            <div className="border-border bg-bg-0 w-full overflow-hidden rounded-(--radius-control) border">
              <CodeContext file={comment.file} line={comment.line} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// Cards re-render only when their own comment or flags change; the handlers come from a
// stable context, so moving focus or editing one card leaves the others untouched.
export const CommentCard = memo(CommentCardBase);
