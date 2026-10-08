import { cn } from "@shared/lib";
import type { Comment, CommentSeverity } from "@entities/review";
import { ButtonSpinner, PostOptions, SectionHeader, SummaryRow } from "./PostParts";
import type { PostOptionsProps } from "./PostParts";

const SEVERITIES: CommentSeverity[] = ["critical", "major", "minor", "suggestion"];

export type PostConfirmPanelProps = PostOptionsProps & {
  kept: Comment[];
  targetLabel: string;
  hostLabel: string | null;
  isPosting: boolean;
  isDryRun: boolean;
  onToggleDryRun: () => void;
  onSaveAsJson: () => void;
  onPost: () => void;
};

/** The "ready to post" column: what will be sent where, the options, and the Post button. */
export const PostConfirmPanel = ({
  kept,
  targetLabel,
  hostLabel,
  isPosting,
  isDryRun,
  onToggleDryRun,
  onSaveAsJson,
  onPost,
  ...options
}: PostConfirmPanelProps): React.ReactElement => {
  const inline = kept.filter((c) => c.file !== null && c.line !== null).length;
  const keptCount = kept.length;

  return (
    <div style={{ overflow: "auto", borderRight: "1px solid var(--border)" }}>
      <SectionHeader title="Ready to post" hint="Review the final payload before it hits the MR." />

      <div
        style={{
          margin: "0 24px 18px",
          padding: 14,
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-3)",
        }}
      >
        <SummaryRow label="Target">{targetLabel}</SummaryRow>
        {hostLabel !== null && <SummaryRow label="Host">{hostLabel}</SummaryRow>}
        <SummaryRow label="Inline comments">{inline}</SummaryRow>
        <SummaryRow label="General notes">{keptCount - inline}</SummaryRow>
        <SummaryRow label="Severity tags">
          <span style={{ display: "flex", gap: 4 }}>
            {SEVERITIES.map((s) => {
              const n = kept.filter((c) => c.severity === s).length;
              return n > 0 ? (
                <span key={s} className={`sev ${s}`}>
                  <span className="dot" />
                  {n}
                </span>
              ) : null;
            })}
          </span>
        </SummaryRow>
      </div>

      <PostOptions {...options} />

      {keptCount === 0 && (
        <div
          style={{
            margin: "0 24px 18px",
            padding: "10px 14px",
            background: "color-mix(in oklch, var(--c-minor) 10%, var(--bg-1))",
            border: "1px solid color-mix(in oklch, var(--c-minor) 40%, transparent)",
            borderRadius: "var(--radius-3)",
            fontSize: 12.5,
            color: "var(--c-minor-fg)",
          }}
        >
          No comments to post. Go back to Polish and keep at least one comment.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 24px 0", paddingBottom: 24 }}>
        <button
          type="button"
          className={cn("btn ghost", isDryRun && "active")}
          aria-pressed={isDryRun}
          style={isDryRun ? { background: "var(--bg-hover)", color: "var(--fg-0)" } : undefined}
          onClick={onToggleDryRun}
        >
          Dry-run preview
        </button>
        <button type="button" className="btn ghost" onClick={onSaveAsJson}>
          Save as JSON
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn primary"
          disabled={isPosting || keptCount === 0}
          onClick={onPost}
        >
          {isPosting ? (
            <>
              <ButtonSpinner />
              Posting…
            </>
          ) : (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Post {keptCount} {keptCount === 1 ? "comment" : "comments"}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
