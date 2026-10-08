import { useEffect, useRef, useState } from "react";
import { STAGE_META, SEVERITY_COLORS, SEVERITY_ORDER } from "./historyStyles";
import { formatRelative, getReviewDisplayStage, getReviewTargetLabel } from "../lib/historyList";
import type { Review } from "@entities/review";

const ClockIcon = (): React.ReactElement => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const TrashIcon = (): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export type ReviewItemProps = {
  review: Review;
  /** Host and repository, shown under the title. */
  location: string;
  isActive: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

const SeverityCounts = ({ review }: { review: Review }): React.ReactElement | null => {
  const kept = (review.iterations.at(-1)?.comments ?? []).filter((c) => c.status === "kept");
  if (kept.length === 0) return null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
      {SEVERITY_ORDER.map((severity) => {
        const count = kept.filter((c) => c.severity === severity).length;
        if (count === 0) return null;
        return (
          <span
            key={severity}
            title={`${String(count)} ${severity}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: SEVERITY_COLORS[severity],
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: SEVERITY_COLORS[severity],
              }}
            />
            {count}
          </span>
        );
      })}
    </span>
  );
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
  useEffect(() => {
    // The safe choice gets the focus: Enter right after the trash icon must not delete.
    cancelRef.current?.focus();
  }, []);
  const iterations = review.iterations.length;
  return (
    <div
      role="group"
      aria-label="Confirm deletion"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 14px",
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-1))",
      }}
    >
      <span style={{ flex: 1, fontSize: 12, color: "var(--fg-1)" }}>
        Delete {review.repo_path} {getReviewTargetLabel(review)}
        {iterations > 0 ? ` and its ${String(iterations)} iteration(s)` : ""}? This cannot be
        undone.
      </span>
      <button ref={cancelRef} type="button" className="btn ghost" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="btn"
        disabled={isDeleting}
        onClick={onConfirm}
        style={{ color: "var(--c-critical-fg)" }}
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
};

export const ReviewItem = ({
  review,
  location,
  isActive,
  isDeleting,
  onOpen,
  onDelete,
}: ReviewItemProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  const stage = getReviewDisplayStage(review);
  const stageMeta = STAGE_META[stage];
  const repoName = review.repo_path.split("/").pop() ?? review.repo_path;

  if (isConfirming) {
    return (
      <DeleteConfirmation
        review={review}
        isDeleting={isDeleting}
        onConfirm={onDelete}
        onCancel={() => {
          setIsConfirming(false);
        }}
      />
    );
  }

  return (
    <div
      className="history-row"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        background: isActive ? "var(--bg-3)" : undefined,
      }}
    >
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 28,
            background: "var(--accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-current={isActive ? "page" : undefined}
        className="history-row-open"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "9px 6px 9px 14px",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <span
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--fg-0)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {repoName}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-2)",
              flexShrink: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-1)",
              padding: "0 4px",
            }}
          >
            {getReviewTargetLabel(review)}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10,
              color: "var(--fg-2)",
            }}
          >
            <ClockIcon />
            {formatRelative(review.created_at)}
          </span>
          <span className="mono" style={{ fontSize: 10, color: stageMeta.color, fontWeight: 500 }}>
            {stageMeta.label}
          </span>
          <SeverityCounts review={review} />
        </span>
        <span
          className="mono"
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--fg-2)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {location}
        </span>
      </button>
      <button
        type="button"
        className="icon-btn history-row-delete"
        aria-label={`Delete review of ${review.repo_path} ${getReviewTargetLabel(review)}`}
        title="Delete review"
        onClick={() => {
          setIsConfirming(true);
        }}
        style={{ marginRight: 8 }}
      >
        <TrashIcon />
      </button>
    </div>
  );
};
