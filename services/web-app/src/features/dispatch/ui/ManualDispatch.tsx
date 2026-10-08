import { useState } from "react";

import { Check, Copy, Download } from "lucide-react";

import { Button, Callout, ICON_SIZE, Spinner } from "@shared/ui";

import { downloadText } from "../lib/downloadText";
import type { ResponseDraft } from "../model/useResponseDraft";
import { PromptSizeNotices } from "./PromptSizeNotices";
import { ResponseImport } from "./ResponseImport";
import { StageBody } from "./StageLayout";
import { StepCard } from "./StepCard";

const PROMPT_MAX_HEIGHT_PX = 320;
const COPIED_FEEDBACK_MS = 2000;

export type ManualDispatchProps = {
  promptText: string | undefined;
  isLoading: boolean;
  /** Why the prompt could not be built, e.g. every changed file is excluded by the brief. */
  promptError: string | null;
  reviewId: string;
  excludeDiff: boolean;
  excludeContext: boolean;
  existingCommentsCount: number;
  /** The response to import and its report, kept by the stage across mode switches. */
  draft: ResponseDraft;
};

const PromptView = ({
  promptText,
  isLoading,
  promptError,
}: Pick<ManualDispatchProps, "promptText" | "isLoading" | "promptError">): React.ReactElement => {
  if (isLoading) {
    return (
      <p
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          margin: 0,
          padding: "var(--space-5) 0",
          fontSize: "var(--fs-control)",
          color: "var(--fg-2)",
        }}
      >
        <Spinner size="sm" isDecorative />
        Building the prompt…
      </p>
    );
  }
  if (promptError !== null) {
    return <Callout tone="danger">{`The prompt could not be built: ${promptError}`}</Callout>;
  }
  return (
    <pre
      aria-label="Prompt"
      tabIndex={0}
      style={{
        margin: 0,
        background: "var(--bg-0)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-control)",
        padding: "var(--space-3)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-meta)",
        lineHeight: "var(--lh-body)",
        color: "var(--fg-1)",
        maxHeight: PROMPT_MAX_HEIGHT_PX,
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {promptText ?? ""}
    </pre>
  );
};

/** "Copy & paste": take the prompt to any AI agent, then import what it answers. */
export const ManualDispatch = ({
  promptText,
  isLoading,
  promptError,
  reviewId,
  excludeDiff,
  excludeContext,
  existingCommentsCount,
  draft,
}: ManualDispatchProps): React.ReactElement => {
  const [isCopied, setIsCopied] = useState(false);
  const isPromptReady = !isLoading && Boolean(promptText);

  const handleCopy = (): void => {
    if (!promptText) return;
    void navigator.clipboard.writeText(promptText).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, COPIED_FEEDBACK_MS);
    });
  };

  const handleDownload = (): void => {
    if (!promptText) return;
    downloadText(promptText, "review-prompt.txt");
  };

  return (
    <StageBody>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <StepCard
          step={1}
          title="Copy the prompt"
          actions={
            <>
              <Button
                size="sm"
                icon={
                  isCopied ? (
                    <Check size={ICON_SIZE.inline} aria-hidden="true" />
                  ) : (
                    <Copy size={ICON_SIZE.inline} aria-hidden="true" />
                  )
                }
                onClick={handleCopy}
                disabled={!isPromptReady}
              >
                {isCopied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                icon={<Download size={ICON_SIZE.inline} aria-hidden="true" />}
                onClick={handleDownload}
                disabled={!isPromptReady}
              >
                Download
              </Button>
            </>
          }
        >
          <PromptSizeNotices
            reviewId={reviewId}
            excludeDiff={excludeDiff}
            excludeContext={excludeContext}
          />
          <PromptView promptText={promptText} isLoading={isLoading} promptError={promptError} />
        </StepCard>

        <StepCard step={2} title="Run it in your AI agent">
          <p
            style={{
              margin: 0,
              fontSize: "var(--fs-control)",
              lineHeight: "var(--lh-body)",
              color: "var(--fg-1)",
            }}
          >
            Paste the prompt into your AI agent and run it. The model must answer with a JSON array
            of comments.
          </p>
        </StepCard>

        <ResponseImport step={3} existingCommentsCount={existingCommentsCount} draft={draft} />
      </ol>
    </StageBody>
  );
};
