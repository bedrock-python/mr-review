import { useId, useState } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Badge, Button, ICON_SIZE, IconButton, SegmentedControl, Textarea } from "@shared/ui";
import { SEVERITY_OPTIONS } from "../severityOptions";
import type { CommentFieldPatch } from "../../model";
import type { Comment, CommentSeverity } from "@entities/review";

type PinnedCommentEditorProps = {
  comment: Comment;
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  position: number;
  total: number;
  onUpdate: (id: string, patch: CommentFieldPatch) => void;
  onToggleStatus: (id: string) => void;
  isPending: boolean;
};

export const PinnedCommentEditor = ({
  comment,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  position,
  total,
  onUpdate,
  onToggleStatus,
  isPending,
}: PinnedCommentEditorProps): React.ReactElement => {
  const [body, setBody] = useState(comment.body);
  const [severity, setSeverity] = useState<CommentSeverity>(comment.severity);
  const severityLabelId = useId();
  const isDismissed = comment.status === "dismissed";

  const locationLabel =
    comment.file !== null
      ? `${comment.file.split("/").pop() ?? ""}${comment.line !== null ? `:${String(comment.line)}` : ""}`
      : "General";

  // The server refuses a blank body; better to say so here than to roll the save back.
  const isBodyBlank = body.trim().length === 0;

  const handleSave = (): void => {
    if (isBodyBlank) return;
    onUpdate(comment.id, { body, severity });
  };

  return (
    <div className="comment-editor flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span
          className="text-fg-1 min-w-0 truncate font-mono text-(length:--fs-meta)"
          title={comment.file ?? undefined}
        >
          {locationLabel}
        </span>
        <span className="text-fg-2 font-mono text-(length:--fs-meta)">
          {position + 1}/{total}
        </span>
        {isDismissed && <Badge>dismissed</Badge>}
        <span className="ml-auto flex gap-0.5">
          <IconButton
            size="sm"
            label="Previous comment"
            disabled={!canGoPrev}
            icon={<ChevronUp size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={onPrev}
          />
          <IconButton
            size="sm"
            label="Next comment"
            disabled={!canGoNext}
            icon={<ChevronDown size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={onNext}
          />
        </span>
      </div>

      <div className="ui-field">
        <span id={severityLabelId} className="ui-eyebrow">
          Severity
        </span>
        <SegmentedControl
          size="sm"
          aria-labelledby={severityLabelId}
          options={SEVERITY_OPTIONS}
          value={severity}
          onValueChange={setSeverity}
          className="self-start"
        />
      </div>

      <Textarea
        aria-label="Edit comment body"
        value={body}
        rows={8}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        className="min-h-45 flex-1 text-(length:--fs-body)"
      />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={
            isDismissed ? (
              <Check size={ICON_SIZE.inline} aria-hidden="true" />
            ) : (
              <X size={ICON_SIZE.inline} aria-hidden="true" />
            )
          }
          onClick={() => {
            onToggleStatus(comment.id);
          }}
        >
          {isDismissed ? "Keep" : "Dismiss"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={isPending || isBodyBlank}
          title={isBodyBlank ? "The comment needs some text" : undefined}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
};
