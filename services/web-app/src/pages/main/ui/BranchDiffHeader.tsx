import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { getReviewSource, useReview } from "@entities/review";

/** Header of a review that has no merge request: the repository and the two refs. */
export const BranchDiffHeader = (): React.ReactElement | null => {
  const { selectedRepoPath, activeReviewId } = useNav();
  const toggleIterationHistory = useAppStore((s) => s.toggleIterationHistory);
  const { data: review } = useReview(activeReviewId);
  if (!review) return null;
  const source = getReviewSource(review);
  if (source.kind !== "branch_diff") return null;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        padding: "12px 20px 10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6 }}>
          {selectedRepoPath} › branch diff
        </div>
        <h1
          style={{
            fontSize: 22,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            color: "var(--fg-0)",
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          {source.title || `${source.head_ref} into ${source.base_ref}`}
        </h1>
        <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 6 }}>
          {source.base_ref} … {source.head_ref}
        </div>
      </div>
      <button type="button" className="btn" onClick={toggleIterationHistory}>
        Iterations · {review.iterations.length}
      </button>
    </div>
  );
};
