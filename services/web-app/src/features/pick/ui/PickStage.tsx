import { useState } from "react";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useMR, useDiff } from "@entities/mr";
import { useCreateReview, useReviews, reviewApi } from "@entities/review";
import { Markdown } from "@shared/ui";
import { DiffViewer } from "./DiffViewer";
import { FileList } from "./FileList";
import type { MR, PipelineStatus } from "@entities/mr";
import type { Review, ReviewStage, Iteration } from "@entities/review";

const STAGE_LABEL: Record<ReviewStage, string> = {
  pick: "Pick",
  brief: "Brief",
  dispatch: "Dispatch",
  polish: "Polish",
  post: "Posted",
};

const STAGE_COLOR: Record<ReviewStage, string> = {
  pick: "var(--fg-3)",
  brief: "oklch(78% 0.18 60)",
  dispatch: "oklch(78% 0.18 260)",
  polish: "oklch(78% 0.18 300)",
  post: "oklch(72% 0.18 145)",
};

const getLatestIteration = (review: Review): Iteration | null =>
  review.iterations.length > 0 ? (review.iterations[review.iterations.length - 1] ?? null) : null;

const getReviewStage = (review: Review): ReviewStage => {
  const it = getLatestIteration(review);
  return it ? it.stage : "pick";
};

type ExistingReviewsModalProps = {
  reviews: Review[];
  onSelect: (review: Review) => void;
  onCreateNew: () => void;
  onClose: () => void;
};

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  return `${String(Math.floor(hrs / 24))}d ago`;
};

const ExistingReviewsModal = ({
  reviews,
  onSelect,
  onCreateNew,
  onClose,
}: ExistingReviewsModalProps): React.ReactElement => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        style={{
          position: "relative",
          width: 480,
          maxHeight: "70vh",
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>
              Existing reviews
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>
              Select a review to continue or create a new one
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--fg-3)",
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {reviews.map((r) => {
            const latestIt = getLatestIteration(r);
            const stage = getReviewStage(r);
            const kept = latestIt ? latestIt.comments.filter((c) => c.status === "kept").length : 0;
            const total = latestIt ? latestIt.comments.length : 0;
            const iterCount = r.iterations.length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect(r);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "1px solid var(--border)",
                  background: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "color-mix(in oklch, var(--accent) 6%, var(--bg-1))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                {/* Stage badge */}
                <span
                  style={{
                    flexShrink: 0,
                    padding: "2px 7px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: STAGE_COLOR[stage],
                    border: `1px solid color-mix(in oklch, ${STAGE_COLOR[stage]} 40%, transparent)`,
                    background: `color-mix(in oklch, ${STAGE_COLOR[stage]} 10%, transparent)`,
                  }}
                >
                  {STAGE_LABEL[stage]}
                </span>

                {/* Meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 12, color: "var(--fg-2)", fontFamily: "var(--font-mono)" }}
                  >
                    {formatRelativeTime(r.updated_at)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>
                    {iterCount > 0
                      ? `${String(iterCount)} iteration${iterCount > 1 ? "s" : ""}${total > 0 ? ` · ${String(kept)}/${String(total)} comments kept` : ""}`
                      : "No iterations yet"}
                  </div>
                </div>

                {/* Arrow */}
                <span style={{ color: "var(--fg-3)", fontSize: 14 }}>›</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" onClick={onCreateNew} className="btn primary" style={{ gap: 6 }}>
            + New review
          </button>
        </div>
      </div>
    </div>
  );
};

const PIPELINE_DOT: Record<NonNullable<PipelineStatus>, string> = {
  passed: "oklch(72% 0.18 145)",
  failed: "oklch(68% 0.20 25)",
  running: "oklch(78% 0.18 60)",
  none: "var(--fg-3)",
};

const EnterIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 10 4 15 9 20" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
);

type SidebarProps = {
  mr: MR;
  onCompose: () => void;
  isCreating: boolean;
};

const Sidebar = ({ mr, onCompose, isCreating }: SidebarProps): React.ReactElement => {
  const pipelineColor = mr.pipeline ? PIPELINE_DOT[mr.pipeline] : "var(--fg-3)";

  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-1)",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Description */}
        {mr.description && mr.description.trim().length > 0 && (
          <section style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--fg-3)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Description
            </div>
            <Markdown>{mr.description}</Markdown>
          </section>
        )}

        {/* Status */}
        <section style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Status
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 3,
                border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
                background: "color-mix(in oklch, var(--accent) 12%, transparent)",
                color: "var(--accent)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  display: "inline-block",
                }}
              />
              {mr.status}
            </span>
            {mr.pipeline && mr.pipeline !== "none" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: pipelineColor,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: pipelineColor,
                    display: "inline-block",
                  }}
                />
                {mr.pipeline}
              </span>
            )}
          </div>
        </section>

        {/* Changes stats */}
        <section style={{ padding: "12px 16px" }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Changes
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span
              style={{ fontSize: 12, color: "oklch(72% 0.18 145)", fontFamily: "var(--font-mono)" }}
            >
              +{mr.additions}
            </span>
            <span
              style={{ fontSize: 12, color: "oklch(68% 0.20 25)", fontFamily: "var(--font-mono)" }}
            >
              -{mr.deletions}
            </span>
          </div>
        </section>
      </div>

      {/* CTA card */}
      <div
        style={{
          padding: 16,
          borderTop: "1px solid var(--border)",
          background: "color-mix(in oklch, var(--accent) 6%, var(--bg-1))",
        }}
      >
        <p style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 10, lineHeight: 1.5 }}>
          Ready to review? Compose a prompt for AI analysis.
        </p>
        <button
          type="button"
          onClick={onCompose}
          disabled={isCreating}
          className="btn primary"
          style={{
            width: "100%",
            justifyContent: "center",
            gap: 8,
            opacity: isCreating ? 0.5 : 1,
          }}
        >
          Compose prompt
          <span
            className="kbd"
            style={{
              background: "var(--accent-ink)",
              color: "var(--accent)",
              borderColor: "transparent",
            }}
          >
            <EnterIcon />
          </span>
        </button>
      </div>
    </aside>
  );
};

export const PickStage = (): React.ReactElement => {
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId, setReview } = useNav();
  const { setStage, setIterationId } = useStageBarStore();
  const createReview = useCreateReview();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false);

  const {
    data: mr,
    isLoading: mrLoading,
    isError: mrError,
  } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);
  const {
    data: diff,
    isLoading: diffLoading,
    isError: diffError,
  } = useDiff(selectedHostId, selectedRepoPath, selectedMRIid);
  const { data: allReviews } = useReviews();

  const isLoading = mrLoading || diffLoading;
  const isError = mrError || diffError;

  const activeFile = diff?.find((f) => f.path === selectedFilePath) ?? diff?.[0] ?? null;

  const mrReviews =
    allReviews?.filter(
      (r) =>
        r.host_id === selectedHostId &&
        r.repo_path === selectedRepoPath &&
        r.mr_iid === selectedMRIid
    ) ?? [];

  const doStartReview = (): void => {
    if (!selectedHostId || !selectedRepoPath || selectedMRIid === null) return;
    setShowExisting(false);
    // upsert review, then create a new iteration on it
    createReview.mutate(
      { host_id: selectedHostId, repo_path: selectedRepoPath, mr_iid: selectedMRIid },
      {
        onSuccess: (review) => {
          setReview(review.id);
          void reviewApi.createIteration(review.id).then((updated) => {
            const newIt = updated.iterations[updated.iterations.length - 1];
            if (newIt) setIterationId(newIt.id);
            setStage("brief");
          });
        },
      }
    );
  };

  const handleCompose = (): void => {
    if (activeReviewId) {
      setStage("brief");
      return;
    }
    doStartReview();
  };

  const handleSelectExisting = (review: Review): void => {
    setShowExisting(false);
    setReview(review.id);
    const latestIt = getLatestIteration(review);
    if (latestIt) {
      setIterationId(latestIt.id);
      setStage(latestIt.stage);
    } else {
      setStage("brief");
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 10,
          color: "var(--fg-3)",
        }}
      >
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
        <span style={{ fontSize: 13 }}>Loading merge request…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
          color: "var(--fg-3)",
        }}
      >
        <span style={{ fontSize: 24 }}>⚠</span>
        <p style={{ fontSize: 13 }}>Failed to load merge request data.</p>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr 320px",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Left: file tree */}
        <FileList
          files={diff ?? []}
          selectedPath={activeFile?.path ?? null}
          onSelect={setSelectedFilePath}
        />

        {/* Center: diff viewer */}
        <div style={{ overflowY: "auto", minWidth: 0 }}>
          {activeFile ? (
            <DiffViewer file={activeFile} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                fontSize: 13,
                color: "var(--fg-3)",
              }}
            >
              No changes in this MR
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        {mr && <Sidebar mr={mr} onCompose={handleCompose} isCreating={createReview.isPending} />}
      </div>

      {showExisting && (
        <ExistingReviewsModal
          reviews={mrReviews}
          onSelect={handleSelectExisting}
          onCreateNew={doStartReview}
          onClose={() => {
            setShowExisting(false);
          }}
        />
      )}
    </>
  );
};
