import { useCallback } from "react";
import { useReviewDiff } from "@entities/review";
import { DiffViewer } from "@shared/ui";
import { SEV_COLOR } from "../../lib";
import type { Comment } from "@entities/review";
import type { DiffLineWithFile } from "@shared/ui";

// Thin wrapper around the shared DiffViewer: fetches the review diff and renders
// severity-coloured markers for inline comments.

type ReviewDiffViewerProps = {
  reviewId: string;
  targetFile: string | null;
  targetLine: number | null;
  activeCommentId: string | null;
  commentsOnLines: Map<number, Comment[]>;
  onCommentClick: (id: string) => void;
};

export const ReviewDiffViewer = ({
  reviewId,
  targetFile,
  targetLine,
  activeCommentId,
  commentsOnLines,
  onCommentClick,
}: ReviewDiffViewerProps): React.ReactElement => {
  const { data: rawDiff, isLoading } = useReviewDiff(reviewId);

  // Must stay referentially stable: the diff rows are memoised on this prop.
  const renderLineDecoration = useCallback(
    ({ line, comments }: { line: DiffLineWithFile; comments: readonly Comment[] }) =>
      comments.map((c) => (
        <button
          key={c.id}
          type="button"
          data-decoration-id={c.id}
          onClick={() => {
            onCommentClick(c.id);
          }}
          title={c.body.slice(0, 80)}
          aria-label={`${c.severity} comment on ${line.file}:${String(line.newLine ?? "")}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            background: SEV_COLOR[c.severity],
            border: "none",
            cursor: "pointer",
            padding: 0,
            opacity: c.status === "dismissed" ? 0.4 : 1,
          }}
        />
      )),
    [onCommentClick]
  );

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          color: "var(--fg-2)",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
          }}
          className="animate-spin motion-reduce:animate-none"
        />
        <span style={{ fontSize: 12 }}>Loading diff…</span>
      </div>
    );
  }

  return (
    <DiffViewer<Comment>
      diff={rawDiff ?? ""}
      mode="full"
      highlightFile={targetFile}
      highlightLine={targetLine}
      activeDecorationId={activeCommentId}
      commentsOnLines={commentsOnLines}
      ariaLabel="Review diff"
      renderLineDecoration={renderLineDecoration}
    />
  );
};
