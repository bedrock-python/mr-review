import { useState } from "react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, usePostReview } from "@entities/review";
import { useMR } from "@entities/mr";
import { useHosts } from "@entities/host";
import { EmptyState, StageLoading } from "@shared/ui";
import { describePostResult, summarizePost } from "../lib/postSummary";
import { useSeverityLabel } from "../model/useSeverityLabel";
import { PostConfirmPanel } from "./PostConfirmPanel";
import { PostReadyFooter, PostResultFooter } from "./PostFooter";
import { PostPreview } from "./PostPreview";
import { PostResultPanel } from "./PostResultPanel";
import { ASIDE_WIDTH_PX } from "./postStyles";
import type { Iteration, Review } from "@entities/review";

const downloadJson = (json: string, name: string): void => {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

type PostWorkspaceProps = { review: Review; iteration: Iteration | null };

const PostWorkspace = ({ review, iteration }: PostWorkspaceProps): React.ReactElement => {
  const { selectedHostId, selectedRepoPath, selectedMRIid, clearMR, goToStage } = useNav();
  const { data: mr } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);
  const { data: hosts } = useHosts();
  const postReview = usePostReview(review.id);
  const [isJsonShown, setIsJsonShown] = useState(false);
  const [fallbackToGeneralNote, setFallbackToGeneralNote] = useState(true);
  const [severityLabel, setSeverityLabel] = useSeverityLabel();

  const summary = iteration ? summarizePost(iteration) : null;
  const kept = summary?.kept ?? [];
  const mrLabel = `!${String(review.mr_iid)}`;
  const targetLabel = `${review.repo_path} ${mrLabel}`;
  const host = hosts?.find((h) => h.id === review.host_id);
  const options = {
    fallbackToGeneralNote,
    onFallbackChange: setFallbackToGeneralNote,
    severityLabel,
    onSeverityLabelChange: setSeverityLabel,
  };

  const handlePost = (resendAmbiguous = false): void => {
    postReview.mutate(
      { iterationId: iteration?.id ?? null, fallbackToGeneralNote, severityLabel, resendAmbiguous },
      {
        onSuccess: (result) => {
          const { kind, message } = describePostResult(result);
          toast[kind](message);
        },
        onError: (err) => {
          toast.error("Failed to post comments", { description: err.message });
        },
      }
    );
  };

  const json = JSON.stringify(
    {
      target: targetLabel,
      comments: kept.map((c) => ({
        ...(c.file !== null ? { file: c.file, line: c.line } : {}),
        severity: c.severity,
        body: c.body,
      })),
    },
    null,
    2
  );

  const isAttempted = summary !== null && summary.state !== "ready";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${String(ASIDE_WIDTH_PX)}px minmax(0, 1fr)`,
          flex: 1,
          minHeight: 0,
        }}
      >
        {isAttempted ? (
          <PostResultPanel summary={summary} mrLabel={mrLabel} {...options} />
        ) : (
          <PostConfirmPanel
            kept={kept}
            targetLabel={targetLabel}
            hostLabel={host ? host.name : null}
            onBackToPolish={() => {
              goToStage({ stage: "polish" });
            }}
            {...options}
          />
        )}
        <PostPreview
          mode={isAttempted ? "status" : "dryrun"}
          comments={kept}
          json={json}
          isJsonShown={isJsonShown}
          onToggleJson={() => {
            setIsJsonShown((value) => !value);
          }}
          onSaveAsJson={() => {
            downloadJson(json, `review-${review.id}.json`);
          }}
          isCompleted={(iteration?.completed_at ?? null) !== null}
        />
      </div>
      {isAttempted ? (
        <PostResultFooter
          summary={summary}
          targetLabel={targetLabel}
          mrUrl={mr !== undefined && mr.web_url !== "" ? mr.web_url : null}
          isPosting={postReview.isPending}
          onRetry={handlePost}
          onReviewNext={clearMR}
        />
      ) : (
        <PostReadyFooter
          keptCount={kept.length}
          targetLabel={targetLabel}
          isPosting={postReview.isPending}
          onPost={() => {
            handlePost();
          }}
        />
      )}
    </div>
  );
};

export const PostStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review, isLoading } = useReview(activeReviewId);

  if (activeReviewId === null) {
    return (
      <EmptyState
        isFill
        title="No active review"
        description="Go back to Pick to select a merge request."
      />
    );
  }

  if (isLoading || review === undefined) {
    return <StageLoading label="Loading review…" />;
  }

  const iteration = review.iterations.find((it) => it.id === activeIterationId) ?? null;
  return <PostWorkspace key={iteration?.id ?? "none"} review={review} iteration={iteration} />;
};
