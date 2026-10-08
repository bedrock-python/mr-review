import { Download } from "lucide-react";

import {
  formatContextSize,
  formatDiffSize,
  reviewApi,
  useContextSize,
  useDiffSize,
} from "@entities/review";
import { Button, Callout, ICON_SIZE } from "@shared/ui";

import { downloadText } from "../lib/downloadText";

const SizeMeta = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <span
    style={{
      marginLeft: "var(--space-2)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      fontWeight: "var(--fw-regular)",
      color: "var(--fg-2)",
    }}
  >
    {children}
  </span>
);

export type PromptSizeNoticesProps = {
  reviewId: string;
  /** The diff was left out of the prompt because it is too large. */
  excludeDiff: boolean;
  /** The project context was left out of the prompt because it is too large. */
  excludeContext: boolean;
};

/** Warns when the diff or the context is too big for most models, with a download to attach. */
export const PromptSizeNotices = ({
  reviewId,
  excludeDiff,
  excludeContext,
}: PromptSizeNoticesProps): React.ReactElement | null => {
  const diffSize = useDiffSize(reviewId);
  const contextSize = useContextSize(reviewId);
  const isDiffNoticeShown = !diffSize.isLoading && diffSize.level !== "ok";
  const isContextNoticeShown = !contextSize.isLoading && contextSize.level === "large";

  if (!isDiffNoticeShown && !isContextNoticeShown) return null;

  const handleDownloadDiff = (): void => {
    void reviewApi.getDiff(reviewId).then((diff) => {
      downloadText(diff, "review.diff");
    });
  };

  const handleDownloadContext = (): void => {
    void reviewApi.getContext(reviewId).then((ctx) => {
      downloadText(ctx, "context.md");
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {isDiffNoticeShown && (
        <Callout
          tone="warn"
          size="sm"
          title={
            <>
              {diffSize.level === "large"
                ? "Diff excluded — too large for most models"
                : "Large diff detected"}
              <SizeMeta>
                {formatDiffSize(diffSize.chars)} · ~{diffSize.tokens.toLocaleString()} tokens
              </SizeMeta>
            </>
          }
          actions={
            <Button
              size="sm"
              icon={<Download size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={handleDownloadDiff}
            >
              Download diff ({formatDiffSize(diffSize.chars)})
            </Button>
          }
        >
          {excludeDiff
            ? "Diff removed from prompt. Download it below and attach separately."
            : "Consider attaching diff as a separate file."}
        </Callout>
      )}
      {isContextNoticeShown && (
        <Callout
          tone="warn"
          size="sm"
          title={
            <>
              Context excluded — too large for most models
              <SizeMeta>
                {formatContextSize(contextSize.chars)} · ~{contextSize.tokens.toLocaleString()}{" "}
                tokens
              </SizeMeta>
            </>
          }
          actions={
            <Button
              size="sm"
              icon={<Download size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={handleDownloadContext}
            >
              Download context.md ({formatContextSize(contextSize.chars)})
            </Button>
          }
        >
          {excludeContext
            ? "Project context removed from prompt. Download it below and attach separately."
            : "Context removed from prompt. Download it and attach separately."}
        </Callout>
      )}
    </div>
  );
};
