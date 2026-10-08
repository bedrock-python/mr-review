import { useCallback, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ClipboardCopy, Sparkles } from "lucide-react";

import { useNav } from "@app/navigation";
import { useAIProviders } from "@entities/ai-provider";
import {
  useReview,
  reviewApi,
  useDiffSize,
  useContextSize,
  getReviewBriefConfig,
} from "@entities/review";
import {
  EmptyState,
  ICON_SIZE,
  SegmentedControl,
  Skeleton,
  StageLoading,
  Toolbar,
  ToolbarSpacer,
} from "@shared/ui";
import { useStageBarStore } from "@widgets/stage-bar";

import { useResponseDraft } from "../model/useResponseDraft";
import { AutoDispatch } from "./AutoDispatch";
import { ManualDispatch } from "./ManualDispatch";
import { DISPATCH_COLUMN_WIDTH, StageBody } from "./StageLayout";

import type { AIProvider } from "@entities/ai-provider";

type Mode = "auto" | "manual";

const PROMPT_STALE_TIME_MS = 5 * 60 * 1000;
const SKELETON_CARDS = [0, 1];
// The shapes of the form that replaces it: a section label, a provider card.
const SKELETON_LABEL_WIDTH_PX = 72;
const SKELETON_CARD_HEIGHT_PX = 64;

const ProvidersSkeleton = (): React.ReactElement => (
  <div
    role="status"
    aria-label="Loading AI providers"
    style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
  >
    <Skeleton width={SKELETON_LABEL_WIDTH_PX} height="var(--fs-eyebrow)" />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-2)" }}>
      {SKELETON_CARDS.map((i) => (
        <Skeleton key={i} height={SKELETON_CARD_HEIGHT_PX} radius="card" />
      ))}
    </div>
    <Skeleton
      width={SKELETON_LABEL_WIDTH_PX}
      height="var(--fs-eyebrow)"
      style={{ marginTop: "var(--space-5)" }}
    />
    <Skeleton height="var(--control-md)" radius="control" />
  </div>
);

const NO_PROVIDERS: AIProvider[] = [];

export const DispatchStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review } = useReview(activeReviewId);
  const { data: providers = NO_PROVIDERS, isPending: isProvidersPending } = useAIProviders();
  const [mode, setMode] = useState<Mode>("auto");
  // Held here, not in Copy & paste: switching modes must not lose a pasted response.
  const responseDraft = useResponseDraft(activeReviewId, activeIterationId);
  const { load: loadResponse } = responseDraft;
  // Switching modes unmounts the generator and would cut a running generation short.
  const [isGenerating, setIsGenerating] = useState(false);

  const handleEditInManual = useCallback(
    (rawText: string): void => {
      loadResponse(rawText);
      setMode("manual");
    },
    [loadResponse]
  );

  const handleUseManual = useCallback((): void => {
    setMode("manual");
  }, []);

  const existingCommentsCount =
    review?.iterations.find((it) => it.id === activeIterationId)?.comments.length ?? 0;

  const diffSize = useDiffSize(activeReviewId);
  const contextSize = useContextSize(activeReviewId);
  const excludeDiff = diffSize.level === "large";
  const excludeContext = contextSize.level === "large";

  const promptConfig =
    review != null
      ? {
          ...getReviewBriefConfig(review),
          ...(excludeDiff ? { include_diff: false } : {}),
          ...(excludeContext ? { include_context: false } : {}),
        }
      : undefined;

  const {
    data: promptText,
    isLoading: isPromptLoading,
    error: promptError,
  } = useQuery({
    queryKey: ["review-prompt", activeReviewId, activeIterationId, promptConfig],
    queryFn: () =>
      reviewApi.getPrompt(activeReviewId ?? "", promptConfig, activeIterationId ?? undefined),
    enabled:
      activeReviewId !== null && !diffSize.isLoading && !contextSize.isLoading && review != null,
    staleTime: PROMPT_STALE_TIME_MS,
  });

  if (!activeReviewId) {
    return (
      <EmptyState
        isFill
        title="No active review session"
        description="Go back to Pick and start a review."
      />
    );
  }

  if (!review) {
    return <StageLoading label="Loading review…" />;
  }

  const lockedTitle = "Stop the generation to switch modes";

  return (
    <div
      style={
        {
          "--dispatch-column": DISPATCH_COLUMN_WIDTH,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
      <Toolbar>
        <ToolbarSpacer />
        <SegmentedControl
          aria-label="Dispatch mode"
          options={[
            {
              value: "manual",
              label: "Copy & paste",
              icon: <ClipboardCopy size={ICON_SIZE.inline} aria-hidden="true" />,
              isDisabled: isGenerating && mode !== "manual",
              ...(isGenerating && mode !== "manual" ? { title: lockedTitle } : {}),
            },
            {
              value: "auto",
              label: "Run in app",
              icon: <Sparkles size={ICON_SIZE.inline} aria-hidden="true" />,
              isDisabled: isGenerating && mode !== "auto",
              ...(isGenerating && mode !== "auto" ? { title: lockedTitle } : {}),
            },
          ]}
          value={mode}
          onValueChange={setMode}
        />
        <ToolbarSpacer />
      </Toolbar>

      {mode === "manual" && (
        <ManualDispatch
          promptText={promptText}
          isLoading={isPromptLoading}
          promptError={promptError ? promptError.message : null}
          reviewId={activeReviewId}
          excludeDiff={excludeDiff}
          excludeContext={excludeContext}
          existingCommentsCount={existingCommentsCount}
          draft={responseDraft}
        />
      )}
      {/* AutoDispatch restores the saved provider and model when it mounts, so it
          must not mount before the provider list is known. */}
      {mode === "auto" && isProvidersPending && (
        <StageBody>
          <ProvidersSkeleton />
        </StageBody>
      )}
      {mode === "auto" && !isProvidersPending && (
        <AutoDispatch
          activeReviewId={activeReviewId}
          providers={providers}
          onEditInManual={handleEditInManual}
          onUseManual={handleUseManual}
          onRunningChange={setIsGenerating}
          existingCommentsCount={existingCommentsCount}
        />
      )}
    </div>
  );
};
