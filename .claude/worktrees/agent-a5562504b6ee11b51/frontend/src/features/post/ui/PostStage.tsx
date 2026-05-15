import { useState } from "react";
import { useAppStore } from "@app/providers";
import { useReview, reviewApi } from "@entities/review";
import type { CommentSeverity } from "@entities/review";
import { cn } from "@shared/lib";

// ── Types ─────────────────────────────────────────────────────────────────────

type PostResult = {
  posted: number;
};

// ── Severity row ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<CommentSeverity, string> = {
  critical: "text-red-400",
  major: "text-orange-400",
  minor: "text-yellow-400",
  suggestion: "text-blue-400",
};

const SEVERITIES: CommentSeverity[] = ["critical", "major", "minor", "suggestion"];

type SeverityRowProps = {
  severity: CommentSeverity;
  count: number;
};

const SeverityRow = ({ severity, count }: SeverityRowProps): React.ReactElement => (
  <div className="flex items-center gap-2">
    <span className={cn("text-[10px] font-mono", SEVERITY_COLORS[severity])}>●</span>
    <span className="text-sm text-text-muted capitalize w-24">{severity}</span>
    <span className="font-mono text-sm text-text">{count}</span>
  </div>
);

// ── PostStage ─────────────────────────────────────────────────────────────────

export const PostStage = (): React.ReactElement => {
  const { activeReviewId, selectedHostId, selectedRepoPath, selectedMRIid } = useAppStore();
  const { data: review, isLoading } = useReview(activeReviewId);

  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Loading / empty states ────────────────────────────────────────────────

  if (activeReviewId === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <p className="text-sm">No active review. Go back to Pick to select a merge request.</p>
      </div>
    );
  }

  if (isLoading || review === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading review…
      </div>
    );
  }

  // ── Derived stats ────────────────────────────────────────────────────────

  const keptComments = review.comments.filter((c) => c.status === "kept");
  const dismissedComments = review.comments.filter((c) => c.status === "dismissed");
  const keptCount = keptComments.length;
  const totalCount = review.comments.length;
  const dismissedCount = dismissedComments.length;

  const countBySeverity = (severity: CommentSeverity): number =>
    keptComments.filter((c) => c.severity === severity).length;

  // ── Handler ──────────────────────────────────────────────────────────────

  const handlePost = async (): Promise<void> => {
    setPosting(true);
    setError(null);
    try {
      const res = await reviewApi.post(activeReviewId);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comments");
    } finally {
      setPosting(false);
    }
  };

  // ── Target label ─────────────────────────────────────────────────────────

  const targetLabel =
    selectedHostId !== null && selectedRepoPath !== null && selectedMRIid !== null
      ? `${selectedHostId} / ${selectedRepoPath} !${selectedMRIid}`
      : "Unknown target";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-start gap-4 p-6 h-full overflow-auto max-w-xl">
      {/* Summary card */}
      <div className="w-full rounded border border-border bg-surface p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Summary</h2>

        {/* Target */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">Target</span>
          <span className="font-mono text-sm text-text break-all">{targetLabel}</span>
        </div>

        <div className="border-t border-border/60" />

        {/* Counts overview */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted w-40">Comments to post</span>
            <span className="font-mono text-sm font-semibold text-[var(--accent)]">
              {keptCount}
            </span>
            <span className="text-text-muted text-xs">of {totalCount}</span>
          </div>

          {/* Per-severity breakdown */}
          <div className="ml-4 mt-1 flex flex-col gap-1">
            {SEVERITIES.map((s) => (
              <SeverityRow key={s} severity={s} count={countBySeverity(s)} />
            ))}
          </div>
        </div>

        <div className="border-t border-border/60" />

        {/* Dismissed */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted w-40">Dismissed</span>
          <span className="font-mono text-sm text-text">{dismissedCount}</span>
        </div>
      </div>

      {/* No kept comments warning */}
      {keptCount === 0 && (
        <div className="w-full rounded border border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
          <p className="text-sm text-yellow-300">
            No comments to post. Go back to Polish and keep at least one comment.
          </p>
        </div>
      )}

      {/* Post button + result */}
      {result === null ? (
        <button
          type="button"
          disabled={posting || keptCount === 0}
          onClick={() => {
            void handlePost();
          }}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-6 py-3 rounded text-base font-semibold",
            "bg-[var(--accent)] text-[rgb(var(--accent-fg))] hover:opacity-90 transition-opacity",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {posting ? (
            <>
              <span className="animate-spin font-mono text-sm" aria-hidden="true">
                ◌
              </span>
              Posting to GitLab/GitHub…
            </>
          ) : (
            <>
              Post Comments
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      ) : (
        <div className="w-full rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[var(--accent)] font-semibold text-lg" aria-hidden="true">
              ✓
            </span>
            <p className="text-sm text-text">
              Posted{" "}
              <span className="font-semibold font-mono text-[var(--accent)]">{result.posted}</span>{" "}
              {result.posted === 1 ? "comment" : "comments"} successfully
            </p>
          </div>
          <p className="text-xs text-text-muted">View on GitLab/GitHub</p>
        </div>
      )}

      {/* Error */}
      {error !== null && (
        <div className="w-full rounded border border-red-700/50 bg-red-900/20 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => {
              void handlePost();
            }}
            disabled={posting}
            className="self-start px-3 py-1 text-xs rounded border border-red-700/50 text-red-300 hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};
