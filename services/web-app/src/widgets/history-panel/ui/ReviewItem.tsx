import { useEffect, useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { SeverityCounts, countSeverities } from "@entities/review";
import { Button, Callout, ICON_SIZE, IconButton, StatusBadge } from "@shared/ui";
import { formatRelative, getReviewDisplayStage, getReviewTargetLabel } from "../lib/historyList";
import {
  MONO_META,
  ROW_ACTIVE,
  ROW_CLASS,
  ROW_LINE,
  ROW_OPEN,
  ROW_TITLE,
  STAGE_META,
  TRUNCATE,
} from "./historyStyles";
import type { Review } from "@entities/review";

export type ReviewItemProps = {
  review: Review;
  isActive: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

const DeleteConfirmation = ({
  review,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  review: Review;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const detailId = useId();
  useEffect(() => {
    // The safe choice gets the focus: Enter right after the trash icon must not delete.
    cancelRef.current?.focus();
  }, []);
  const iterations = review.iterations.length;
  return (
    <div
      role="group"
      aria-label="Confirm deletion"
      aria-describedby={detailId}
      style={{ padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--border)" }}
    >
      <Callout
        tone="danger"
        size="sm"
        role="none"
        title="Delete this review?"
        actions={
          <>
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" isLoading={isDeleting} onClick={onConfirm}>
              Delete
            </Button>
          </>
        }
      >
        <span id={detailId}>
          {review.repo_path} {getReviewTargetLabel(review)}
          {iterations > 0
            ? ` and its ${String(iterations)} ${iterations === 1 ? "iteration" : "iterations"}`
            : ""}{" "}
          will be gone for good.
        </span>
      </Callout>
    </div>
  );
};

/** A review in the history: repository, target, when, stage and what it found. */
export const ReviewItem = ({
  review,
  isActive,
  isDeleting,
  onOpen,
  onDelete,
}: ReviewItemProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);
  const shouldFocusTrash = useRef(false);
  const stage = STAGE_META[getReviewDisplayStage(review)];
  const repoName = review.repo_path.split("/").pop() ?? review.repo_path;
  const target = getReviewTargetLabel(review);
  const kept = (review.iterations.at(-1)?.comments ?? []).filter((c) => c.status === "kept");

  useEffect(() => {
    // Back from Cancel: focus returns to the trash button that opened the question.
    if (!isConfirming && shouldFocusTrash.current) {
      shouldFocusTrash.current = false;
      trashRef.current?.focus();
    }
  }, [isConfirming]);

  if (isConfirming) {
    return (
      <DeleteConfirmation
        review={review}
        isDeleting={isDeleting}
        onConfirm={onDelete}
        onCancel={() => {
          shouldFocusTrash.current = true;
          setIsConfirming(false);
        }}
      />
    );
  }

  return (
    <div className={ROW_CLASS} style={isActive ? ROW_ACTIVE : undefined}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={isActive ? "page" : undefined}
        className="focus-visible:-outline-offset-2"
        style={ROW_OPEN}
      >
        <span style={ROW_LINE}>
          <span style={{ ...ROW_TITLE, ...TRUNCATE, flexShrink: 1 }}>{repoName}</span>
          {/* A long branch pair gives way before the repository name does. */}
          <span style={{ ...MONO_META, ...TRUNCATE, flexShrink: 4 }}>{target}</span>
          <span style={{ ...MONO_META, marginLeft: "auto", flexShrink: 0 }}>
            {formatRelative(review.created_at)}
          </span>
        </span>
        <span style={{ ...MONO_META, ...TRUNCATE }}>{review.repo_path}</span>
        <span style={{ ...ROW_LINE, gap: "var(--space-3)", marginTop: "var(--space-1)" }}>
          <StatusBadge status={stage.status} label={stage.label} />
          {kept.length > 0 && <SeverityCounts counts={countSeverities(kept)} isCompact />}
        </span>
      </button>
      <IconButton
        ref={trashRef}
        size="sm"
        variant="danger"
        label={`Delete review of ${review.repo_path} ${target}`}
        tooltip="Delete review"
        tooltipSide="left"
        icon={<Trash2 size={ICON_SIZE.inline} aria-hidden="true" />}
        className="mr-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        onClick={() => {
          setIsConfirming(true);
        }}
      />
    </div>
  );
};
