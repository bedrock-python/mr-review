import { useState } from "react";
import { ArrowRight, ExternalLink, RotateCw, Send } from "lucide-react";
import { Button, ICON_SIZE, StageFooter, buttonClassName } from "@shared/ui";
import { ResendConfirm } from "./PostFailures";
import type { PostSummary } from "../lib/postSummary";

const plural = (count: number): string =>
  `${String(count)} ${count === 1 ? "comment" : "comments"}`;

export type PostReadyFooterProps = {
  keptCount: number;
  targetLabel: string;
  isPosting: boolean;
  onPost: () => void;
};

/** Ready: how many comments go where, and the Post button. */
export const PostReadyFooter = ({
  keptCount,
  targetLabel,
  isPosting,
  onPost,
}: PostReadyFooterProps): React.ReactElement => (
  <StageFooter
    aria-label="Post actions"
    summary={keptCount > 0 ? `${plural(keptCount)} to ${targetLabel}` : "No comments to post"}
    primaryAction={
      <Button
        variant="primary"
        size="lg"
        icon={<Send size={ICON_SIZE.inline} aria-hidden="true" />}
        isLoading={isPosting}
        disabled={keptCount === 0}
        onClick={onPost}
      >
        {isPosting ? "Posting…" : `Post ${plural(keptCount)}`}
      </Button>
    }
  />
);

const OpenMrLink = ({
  mrUrl,
  isPrimary,
}: {
  mrUrl: string | null;
  isPrimary: boolean;
}): React.ReactElement => {
  const variant = isPrimary ? "primary" : "secondary";
  const size = isPrimary ? "lg" : "md";
  const icon = <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />;
  if (mrUrl === null) {
    return (
      <Button variant={variant} size={size} icon={icon} disabled>
        Open MR in browser
      </Button>
    );
  }
  return (
    <a
      href={mrUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClassName({ variant, size })}
    >
      {icon}
      Open MR in browser
    </a>
  );
};

/**
 * How much is on the MR. A completed iteration has every comment there, including those posted
 * before per-comment records were kept (they count as neither inline nor general).
 */
const describeLanded = (summary: PostSummary, targetLabel: string): string => {
  const kept = summary.kept.length;
  if (summary.state === "posted") {
    return kept === 1
      ? `1 comment on ${targetLabel}`
      : `All ${String(kept)} comments on ${targetLabel}`;
  }
  const landed = summary.inline + summary.generalNotes;
  return `${String(landed)} of ${plural(kept)} on ${targetLabel}`;
};

export type PostResultFooterProps = {
  summary: PostSummary;
  targetLabel: string;
  mrUrl: string | null;
  isPosting: boolean;
  // resendAmbiguous: also send the comments that may already be on the MR (confirmed by the user).
  onRetry: (resendAmbiguous: boolean) => void;
  onReviewNext: () => void;
};

/** After a post: retry what failed (asking first about what may be on the MR), or move on. */
export const PostResultFooter = ({
  summary,
  targetLabel,
  mrUrl,
  isPosting,
  onRetry,
  onReviewNext,
}: PostResultFooterProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  const retryable = summary.failed.length + summary.unsent;

  const handleRetry = (): void => {
    // Comments that may already be on the MR are sent again only once that is confirmed.
    if (summary.ambiguous.length > 0) setIsConfirming(true);
    else onRetry(false);
  };

  return (
    <>
      <StageFooter
        aria-label="Post actions"
        summary={describeLanded(summary, targetLabel)}
        secondaryActions={
          <>
            <Button
              variant="ghost"
              iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={onReviewNext}
            >
              Review next MR
            </Button>
            {retryable > 0 && <OpenMrLink mrUrl={mrUrl} isPrimary={false} />}
          </>
        }
        primaryAction={
          retryable > 0 ? (
            <Button
              variant="primary"
              size="lg"
              icon={<RotateCw size={ICON_SIZE.inline} aria-hidden="true" />}
              isLoading={isPosting}
              onClick={handleRetry}
            >
              {isPosting ? "Posting…" : `Retry failed (${String(retryable)})`}
            </Button>
          ) : (
            <OpenMrLink mrUrl={mrUrl} isPrimary />
          )
        }
      />
      <ResendConfirm
        isOpen={isConfirming}
        count={summary.ambiguous.length}
        onConfirm={() => {
          setIsConfirming(false);
          onRetry(true);
        }}
        onCancel={() => {
          setIsConfirming(false);
        }}
      />
    </>
  );
};
