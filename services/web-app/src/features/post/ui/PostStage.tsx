import { useState } from "react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, usePostReview } from "@entities/review";
import type { Iteration, Review } from "@entities/review";
import { useMR } from "@entities/mr";
import { useHosts } from "@entities/host";
import { describePostResult, summarizePost } from "../lib/postSummary";
import { useSeverityLabel } from "../model/useSeverityLabel";
import { PostConfirmPanel } from "./PostConfirmPanel";
import { PostPreview } from "./PostPreview";
import { PostResultPanel } from "./PostResultPanel";

const CENTERED: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  gap: 10,
  color: "var(--fg-3)",
  fontSize: 13,
};

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
  const { selectedHostId, selectedRepoPath, selectedMRIid, clearMR } = useNav();
  const { data: mr } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);
  const { data: hosts } = useHosts();
  const postReview = usePostReview(review.id);
  const [isDryRun, setIsDryRun] = useState(false);
  const [fallbackToGeneralNote, setFallbackToGeneralNote] = useState(true);
  const [severityLabel, setSeverityLabel] = useSeverityLabel();

  const summary = iteration ? summarizePost(iteration) : null;
  const kept = summary?.kept ?? [];
  const mrLabel = `!${String(review.mr_iid)}`;
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
      target: `${review.repo_path} ${mrLabel}`,
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 400px",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {isAttempted ? (
        <PostResultPanel
          summary={summary}
          mrLabel={mrLabel}
          mrUrl={mr !== undefined && mr.web_url !== "" ? mr.web_url : null}
          isPosting={postReview.isPending}
          onRetry={handlePost}
          onReviewNext={clearMR}
          {...options}
        />
      ) : (
        <PostConfirmPanel
          kept={kept}
          targetLabel={`${review.repo_path} ${mrLabel}`}
          hostLabel={host ? host.name : null}
          isPosting={postReview.isPending}
          isDryRun={isDryRun}
          onToggleDryRun={() => {
            setIsDryRun((value) => !value);
          }}
          onSaveAsJson={() => {
            downloadJson(json, `review-${review.id}.json`);
          }}
          onPost={() => {
            handlePost();
          }}
          {...options}
        />
      )}
      <PostPreview
        mode={isAttempted ? "status" : isDryRun ? "dryrun" : "json"}
        comments={kept}
        json={json}
      />
    </div>
  );
};

export const PostStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review, isLoading } = useReview(activeReviewId);

  if (activeReviewId === null) {
    return <div style={CENTERED}>No active review. Go back to Pick to select a merge request.</div>;
  }

  if (isLoading || review === undefined) {
    return (
      <div style={CENTERED}>
        <div
          style={{
            width: 16,
            height: 16,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
          }}
          className="animate-spin"
        />
        <span>Loading review…</span>
      </div>
    );
  }

  const iteration = review.iterations.find((it) => it.id === activeIterationId) ?? null;
  return <PostWorkspace key={iteration?.id ?? "none"} review={review} iteration={iteration} />;
};
