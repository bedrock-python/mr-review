import { useState } from "react";
import { formatPostedAt } from "../lib/postSummary";
import type { PostState, PostSummary } from "../lib/postSummary";
import { FailedCommentList, ResendConfirm } from "./PostFailures";
import { ButtonSpinner, PostOptions, Stat } from "./PostParts";
import type { PostOptionsProps } from "./PostParts";

const STATE_LOOK: Record<Exclude<PostState, "ready">, { color: string; title: string }> = {
  posted: { color: "var(--c-add)", title: "Posted to" },
  partial: { color: "var(--c-minor)", title: "Partly posted to" },
  failed: { color: "var(--c-critical)", title: "Nothing was posted to" },
};

const StateIcon = ({ state }: { state: Exclude<PostState, "ready"> }): React.ReactElement => (
  <div
    style={{
      width: 64,
      height: 64,
      borderRadius: "50%",
      background: `color-mix(in oklch, ${STATE_LOOK[state].color} 18%, var(--bg-2))`,
      color: STATE_LOOK[state].color,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
    aria-hidden="true"
  >
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      {state === "posted" && <polyline points="20 6 9 17 4 12" />}
      {state === "partial" && (
        <>
          <line x1="12" y1="7" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12" y2="17.5" />
        </>
      )}
      {state === "failed" && (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      )}
    </svg>
  </div>
);

const subtitle = (summary: PostSummary): string => {
  const landed = summary.inline + summary.generalNotes;
  const at = summary.postedAt !== null ? formatPostedAt(summary.postedAt) : null;
  if (summary.state === "posted")
    return at !== null ? `Posted at ${at}` : "Every comment is on the MR.";
  const progress = `${String(landed)} of ${String(summary.kept.length)} comments are on the MR.`;
  return at !== null && landed > 0 ? `${progress} Last posted at ${at}.` : progress;
};

export type PostResultPanelProps = PostOptionsProps & {
  summary: PostSummary;
  mrLabel: string;
  mrUrl: string | null;
  isPosting: boolean;
  // resendAmbiguous: also send the comments that may already be on the MR (confirmed by the user).
  onRetry: (resendAmbiguous: boolean) => void;
  onReviewNext: () => void;
};

/** What the last post did, read from the server: survives a reload, offers to retry what failed. */
export const PostResultPanel = ({
  summary,
  mrLabel,
  mrUrl,
  isPosting,
  onRetry,
  onReviewNext,
  ...options
}: PostResultPanelProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  const state = summary.state === "ready" ? "failed" : summary.state;
  const retryable = summary.failed.length + summary.unsent;

  return (
    <div style={{ overflow: "auto", borderRight: "1px solid var(--border)", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <StateIcon state={state} />
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            marginTop: 14,
            color: "var(--fg-0)",
          }}
        >
          {STATE_LOOK[state].title} {mrLabel}
        </div>
        <div className="dim" style={{ fontSize: 13, marginTop: 6 }}>
          {subtitle(summary)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Stat label="Inline" value={summary.inline} />
        <Stat label="General" value={summary.generalNotes} />
        <Stat label="Failed" value={summary.failed.length} />
        {summary.unsent > 0 && <Stat label="Not sent" value={summary.unsent} />}
        {summary.unrecorded > 0 && <Stat label="No details" value={summary.unrecorded} />}
      </div>

      {summary.failed.length > 0 && <FailedCommentList comments={summary.failed} />}

      {retryable > 0 && (
        <div style={{ margin: "18px -24px 0" }}>
          <PostOptions {...options} />
        </div>
      )}

      {isConfirming && (
        <ResendConfirm
          count={summary.ambiguous.length}
          onConfirm={() => {
            setIsConfirming(false);
            onRetry(true);
          }}
          onCancel={() => {
            setIsConfirming(false);
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 18,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {retryable > 0 && (
          <button
            type="button"
            className="btn primary"
            disabled={isPosting || isConfirming}
            onClick={() => {
              // Comments that may already be on the MR are sent again only once that is confirmed.
              if (summary.ambiguous.length > 0) setIsConfirming(true);
              else onRetry(false);
            }}
          >
            {isPosting && <ButtonSpinner />}
            {isPosting ? "Posting…" : `Retry failed (${String(retryable)})`}
          </button>
        )}
        <button
          type="button"
          className={retryable > 0 ? "btn" : "btn primary"}
          disabled={mrUrl === null}
          onClick={() => {
            if (mrUrl !== null) window.open(mrUrl, "_blank", "noopener,noreferrer");
          }}
        >
          Open MR in browser →
        </button>
        <button type="button" className="btn" onClick={onReviewNext}>
          Review next MR
        </button>
      </div>
    </div>
  );
};
