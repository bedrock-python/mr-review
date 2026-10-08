import { useState } from "react";
import { useNav } from "@app/navigation";
import { useStageNavigation } from "@widgets/stage-bar";
import { useMR, useDiff, getDiffStats, sumDiffStats } from "@entities/mr";
import { Markdown } from "@shared/ui";
import { DiffViewer } from "./DiffViewer";
import { FileList } from "./FileList";
import type { MR, MRDiffStats, PipelineStatus } from "@entities/mr";

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
  /** Totals to show; `null` hides the block (unknown until the diff loads). */
  diffStats: MRDiffStats | null;
  onCompose: () => void;
  isCreating: boolean;
};

const Sidebar = ({ mr, diffStats, onCompose, isCreating }: SidebarProps): React.ReactElement => {
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

        {/* Changes stats — omitted when the host did not report them */}
        {diffStats && (
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
                style={{
                  fontSize: 12,
                  color: "oklch(72% 0.18 145)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                +{diffStats.additions}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "oklch(68% 0.20 25)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                -{diffStats.deletions}
              </span>
            </div>
          </section>
        )}
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
  const { selectedHostId, selectedRepoPath, selectedMRIid } = useNav();
  const { goToStage, isPending } = useStageNavigation();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

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

  const isLoading = mrLoading || diffLoading;
  const isError = mrError || diffError;

  const activeFile = diff?.find((f) => f.path === selectedFilePath) ?? diff?.[0] ?? null;
  // Some hosts (GitLab) never report MR-level stats; the loaded diff has them.
  const diffStats = (mr ? getDiffStats(mr) : null) ?? (diff ? sumDiffStats(diff) : null);

  // Creates the review and its iteration when needed, and starts a new round on a review
  // whose last iteration was already posted.
  const handleCompose = (): void => {
    void goToStage("brief");
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

        {/* Center: diff viewer — it scrolls its own rows, so it can render only the visible ones */}
        <div style={{ overflow: "hidden", minWidth: 0, minHeight: 0 }}>
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
        {mr && (
          <Sidebar mr={mr} diffStats={diffStats} onCompose={handleCompose} isCreating={isPending} />
        )}
      </div>
    </>
  );
};
