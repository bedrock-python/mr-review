import { useState } from "react";
import { toast } from "sonner";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, reviewApi } from "@entities/review";
import type { CommentSeverity } from "@entities/review";
import { useMR } from "@entities/mr";

type PostResult = {
  posted: number;
};

const SEVERITIES: CommentSeverity[] = ["critical", "major", "minor", "suggestion"];

const SectionHeader = ({ title, hint }: { title: string; hint?: string }): React.ReactElement => (
  <div style={{ padding: "20px 24px 14px" }}>
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 15,
        fontWeight: 600,
        color: "var(--fg-0)",
        marginBottom: hint ? 4 : 0,
      }}
    >
      {title}
    </div>
    {hint && (
      <div className="dim" style={{ fontSize: 12 }}>
        {hint}
      </div>
    )}
  </div>
);

export const PostStage = (): React.ReactElement => {
  const { activeReviewId, selectedHostId, selectedRepoPath, selectedMRIid, clearMR } = useNav();
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review, isLoading } = useReview(activeReviewId);
  const { data: mr } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);

  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const [previewMode, setPreviewMode] = useState<"json" | "dryrun">("json");
  const [fallbackToGeneralNote, setFallbackToGeneralNote] = useState(true);

  if (activeReviewId === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--fg-3)",
          fontSize: 13,
        }}
      >
        No active review. Go back to Pick to select a merge request.
      </div>
    );
  }

  if (isLoading || review === undefined) {
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
        <span style={{ fontSize: 13 }}>Loading review…</span>
      </div>
    );
  }

  const activeIteration = review.iterations.find((it) => it.id === activeIterationId) ?? null;
  const iterationComments = activeIteration?.comments ?? [];
  const keptComments = iterationComments.filter((c) => c.status !== "dismissed");
  const inlineComments = keptComments.filter((c) => c.file !== null);
  const generalComments = keptComments.filter((c) => c.file === null);
  const keptCount = keptComments.length;

  const countBySeverity = (severity: CommentSeverity): number =>
    keptComments.filter((c) => c.severity === severity).length;

  const handlePost = async (): Promise<void> => {
    setPosting(true);
    try {
      const res = await reviewApi.post(
        activeReviewId,
        undefined,
        activeIterationId,
        fallbackToGeneralNote
      );
      setResult(res);
      toast.success(
        `Posted ${String(res.posted)} ${res.posted === 1 ? "comment" : "comments"} to MR`
      );
    } catch (e) {
      toast.error("Failed to post comments", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setPosting(false);
    }
  };

  const mrIid = selectedMRIid !== null ? String(selectedMRIid) : "?";
  const branchLabel = `!${mrIid}`;
  const targetLabel =
    selectedHostId !== null && selectedRepoPath !== null
      ? `${selectedRepoPath} !${mrIid}`
      : "Unknown target";

  // ── Success state ─────────────────────────────────────────────────────────

  if (result !== null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            padding: 40,
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          {/* Check circle */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "color-mix(in oklch, var(--c-add) 18%, var(--bg-2))",
              color: "var(--c-add)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 600,
              marginTop: 14,
              color: "var(--fg-0)",
            }}
          >
            Posted to {branchLabel}
          </div>
          <div className="dim" style={{ fontSize: 13, marginTop: 6 }}>
            {result.posted} {result.posted === 1 ? "comment" : "comments"} now live on the MR.
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            {(
              [
                { label: "Inline", value: inlineComments.length },
                { label: "General", value: generalComments.length },
                { label: "Failed", value: 0 },
              ] as { label: string; value: number }[]
            ).map((stat) => (
              <div
                key={stat.label}
                style={{
                  flex: 1,
                  padding: "12px 8px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--fg-0)",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 2,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "center" }}>
            <button
              type="button"
              className="btn primary"
              disabled={!mr?.web_url}
              onClick={() => {
                if (mr?.web_url) window.open(mr.web_url, "_blank", "noopener,noreferrer");
              }}
            >
              Open MR in browser →
            </button>
            <button type="button" className="btn" onClick={clearMR}>
              Review next MR
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── JSON preview / dry-run ────────────────────────────────────────────────

  const fullPayload = {
    target: targetLabel,
    comments: keptComments.map((c) => ({
      ...(c.file !== null ? { file: c.file, line: c.line } : {}),
      severity: c.severity,
      body: c.body,
    })),
  };

  const jsonPayload = JSON.stringify(fullPayload, null, 2);

  const handleSaveAsJson = (): void => {
    const blob = new Blob([jsonPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-${activeReviewId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Normal state ──────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 400px",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Left: confirm panel */}
      <div style={{ overflow: "auto", borderRight: "1px solid var(--border)" }}>
        <SectionHeader
          title="Ready to post"
          hint="Review the final payload before it hits the MR."
        />

        {/* Summary card */}
        <div
          style={{
            margin: "0 24px 18px",
            padding: 14,
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          {(
            [
              { label: "Target", value: targetLabel },
              { label: "As user", value: "you (api token)" },
              { label: "Inline comments", value: String(inlineComments.length) },
              { label: "General notes", value: String(generalComments.length) },
            ] as { label: string; value: string }[]
          ).map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                fontSize: 12.5,
              }}
            >
              <span className="dim">{row.label}</span>
              <span className="mono">{row.value}</span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 0",
              fontSize: 12.5,
            }}
          >
            <span className="dim">Severity tags</span>
            <span style={{ display: "flex", gap: 4 }}>
              {SEVERITIES.map((s) => {
                const n = countBySeverity(s);
                return n > 0 ? (
                  <span key={s} className={`sev ${s}`}>
                    <span className="dot" />
                    {n}
                  </span>
                ) : null;
              })}
            </span>
          </div>
        </div>

        {/* Options */}
        <div style={{ margin: "0 24px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={fallbackToGeneralNote}
              onChange={(e) => {
                setFallbackToGeneralNote(e.target.checked);
              }}
              style={{ accentColor: "var(--accent)" }}
            />
            <span>Fall back to general note if inline comment can&apos;t anchor</span>
          </label>
        </div>

        {/* No kept warning */}
        {keptCount === 0 && (
          <div
            style={{
              margin: "0 24px 18px",
              padding: "10px 14px",
              background: "color-mix(in oklch, var(--c-minor) 10%, var(--bg-1))",
              border: "1px solid color-mix(in oklch, var(--c-minor) 40%, transparent)",
              borderRadius: 8,
              fontSize: 12.5,
              color: "var(--c-minor)",
            }}
          >
            No comments to post. Go back to Polish and keep at least one comment.
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, margin: "20px 24px 0", paddingBottom: 24 }}>
          <button
            type="button"
            className={`btn ghost${previewMode === "dryrun" ? "active" : ""}`}
            onClick={() => {
              setPreviewMode((m) => (m === "dryrun" ? "json" : "dryrun"));
            }}
          >
            Dry-run preview
          </button>
          <button type="button" className="btn ghost" onClick={handleSaveAsJson}>
            Save as JSON
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn primary"
            disabled={posting || keptCount === 0}
            onClick={() => {
              void handlePost();
            }}
          >
            {posting ? (
              <>
                <div
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    border: "2px solid var(--accent-ink)",
                    borderTopColor: "transparent",
                  }}
                  className="animate-spin"
                />
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

      {/* Right: JSON / dry-run preview */}
      <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-1)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
            {previewMode === "dryrun" ? "dry-run · no changes will be made" : "review.json"}
          </span>
          <span className="chip" style={{ fontSize: 10 }}>
            {previewMode === "dryrun"
              ? `${String(keptCount)} comment${keptCount === 1 ? "" : "s"}`
              : "schema OK"}
          </span>
        </div>

        {previewMode === "json" ? (
          <pre
            style={{
              flex: 1,
              margin: 0,
              padding: "14px 18px",
              overflow: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.5,
              color: "var(--fg-1)",
              whiteSpace: "pre",
              background: "var(--bg-0)",
            }}
          >
            {jsonPayload}
          </pre>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "12px 0" }}>
            {keptComments.length === 0 ? (
              <div style={{ padding: "20px 18px", fontSize: 12.5, color: "var(--fg-3)" }}>
                No comments to preview.
              </div>
            ) : (
              keptComments.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    margin: "0 12px 8px",
                    padding: "10px 12px",
                    background: "var(--bg-0)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}
                    >
                      #{i + 1}
                    </span>
                    <span className={`sev ${c.severity}`}>
                      <span className="dot" />
                      {c.severity}
                    </span>
                    {c.file !== null ? (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "var(--fg-2)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.file}
                        {c.line !== null ? `:${String(c.line)}` : ""}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--fg-3)" }}>general note</span>
                    )}
                  </div>
                  <div style={{ color: "var(--fg-1)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {c.body}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
