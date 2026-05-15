import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useNav } from "@app/navigation";
import { useAIProviders } from "@entities/ai-provider";
import type { AIProvider } from "@entities/ai-provider";
import { useReview, reviewApi, useDiffSize, formatDiffSize, reviewKeys } from "@entities/review";
import type { ImportResponseResult } from "@entities/review";
import { useStageBarStore } from "@widgets/stage-bar";

type Mode = "auto" | "manual";
type DispatchStatus = "idle" | "streaming" | "done" | "error";

type ParsedComment = {
  file: string | null;
  line: number | null;
  severity: "critical" | "major" | "minor" | "suggestion";
  body: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggestion)",
};

function tryParsePartialComments(raw: string): ParsedComment[] {
  const stripped = raw.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(stripped);
  const candidate = fenceMatch ? (fenceMatch[1] ?? "").trim() : stripped;

  // Try full parse first
  try {
    const arr: unknown = JSON.parse(candidate);
    if (Array.isArray(arr)) return arr as ParsedComment[];
  } catch {
    // fall through to partial
  }

  // Partial: collect complete {...} objects
  const results: ParsedComment[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (candidate[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(candidate.slice(start, i + 1)) as ParsedComment;
          if (obj.body) results.push(obj);
        } catch {
          // skip malformed
        }
        start = -1;
      }
    }
  }
  return results;
}
type DropState = "idle" | "over" | "done";
type ImportStatus = "idle" | "loading" | "done" | "error";

const CopyIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const DownloadIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 13 7 8" />
    <line x1="12" y1="3" x2="12" y2="13" />
  </svg>
);

const UploadIcon = (): React.ReactElement => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* ── Manual dispatch flow ───────────────────────────────────── */
type ManualDispatchProps = {
  promptText: string | undefined;
  isLoading: boolean;
  reviewId: string;
  excludeDiff: boolean;
};

const ManualDispatch = ({
  promptText,
  isLoading,
  reviewId,
  excludeDiff,
}: ManualDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const qc = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [dropState, setDropState] = useState<DropState>("idle");
  const [jsonText, setJsonText] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importResult, setImportResult] = useState<ImportResponseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const diffSize = useDiffSize(reviewId);

  const handleCopy = (): void => {
    if (!promptText) return;
    void navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  const handleDownload = (): void => {
    if (!promptText) return;
    const blob = new Blob([promptText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review-prompt.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDiff = (): void => {
    void reviewApi.getDiff(reviewId).then((diff) => {
      const blob = new Blob([diff], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "review.diff";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const loadText = (text: string): void => {
    setJsonText(text);
    setDropState("done");
    setImportStatus("idle");
    setImportResult(null);
    setImportError(null);
    setShowErrors(false);
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void file.text().then(loadText);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(loadText);
  };

  const handleImport = (): void => {
    if (!jsonText.trim() || importStatus === "loading") return;
    setImportStatus("loading");
    setImportResult(null);
    setImportError(null);

    void reviewApi
      .importResponse(reviewId, jsonText)
      .then((result) => {
        setImportResult(result);
        setImportStatus("done");
        void qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : "Import failed");
        setImportStatus("error");
      });
  };

  const hasJson = jsonText.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Prompt preview */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", flex: 1 }}>
            Prompt
          </span>
          <button
            type="button"
            className="btn"
            style={{ gap: 6, padding: "4px 10px", fontSize: 12 }}
            onClick={handleCopy}
            disabled={isLoading || !promptText}
          >
            <CopyIcon />
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            className="btn"
            style={{ gap: 6, padding: "4px 10px", fontSize: 12 }}
            onClick={handleDownload}
            disabled={isLoading || !promptText}
          >
            <DownloadIcon />
            Download
          </button>
        </div>

        {/* Diff size warning */}
        {!diffSize.isLoading &&
          diffSize.level !== "ok" &&
          (() => {
            const isLarge = diffSize.level === "large";
            const warnColor = isLarge ? "var(--c-critical)" : "var(--c-major)";
            return (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `1px solid color-mix(in oklch, ${warnColor} 35%, transparent)`,
                  background: `color-mix(in oklch, ${warnColor} 8%, var(--bg-2))`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                  {isLarge ? "🚨" : "⚠️"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: warnColor, marginBottom: 4 }}>
                    {isLarge
                      ? "Diff excluded from prompt — too large for most models"
                      : "Large diff detected"}
                    <span className="mono" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                      {formatDiffSize(diffSize.chars)} · ~{diffSize.tokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 8 }}
                  >
                    {excludeDiff
                      ? "The diff has been removed from the prompt and replaced with a note to attach it as a separate file (`review.diff`). Download it below."
                      : "The diff takes up significant context. Consider attaching it as a separate file."}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ gap: 6, padding: "4px 10px", fontSize: 11 }}
                    onClick={handleDownloadDiff}
                  >
                    <DownloadIcon />
                    Download diff ({formatDiffSize(diffSize.chars)})
                  </button>
                </div>
              </div>
            );
          })()}

        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "20px 0",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                border: "2px solid var(--border)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
              }}
              className="animate-spin"
            />
            <span style={{ fontSize: 12, color: "var(--fg-3)" }}>Generating prompt…</span>
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              background: "var(--bg-0)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "12px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-1)",
              maxHeight: 320,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {promptText ?? ""}
          </pre>
        )}
      </div>

      {/* Step 2 hint */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "0 4px" }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            flexShrink: 0,
            marginTop: 1,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            color: "var(--fg-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          2
        </span>
        <span style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5 }}>
          Paste the prompt into your AI agent and run it. The model must respond with a JSON array.
        </span>
      </div>

      {/* Step 3: Import JSON response */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              flexShrink: 0,
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              color: "var(--fg-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            3
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", flex: 1 }}>
            Import JSON response
          </span>
          {hasJson && importStatus === "idle" && (
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
              {jsonText.length.toLocaleString()} chars loaded
            </span>
          )}
        </div>

        {/* Drop zone — shown when no text yet */}
        {!hasJson && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDropState("over");
            }}
            onDragLeave={() => {
              setDropState("idle");
            }}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dropState === "over" ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "24px 16px",
              textAlign: "center",
              background:
                dropState === "over"
                  ? "color-mix(in oklch, var(--accent) 5%, var(--bg-2))"
                  : "var(--bg-2)",
              transition: "all 0.1s",
            }}
          >
            <div style={{ marginBottom: 8, color: "var(--fg-3)" }}>
              <UploadIcon />
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 6 }}>
              {dropState === "over" ? "Drop it!" : "Drop the AI response here (JSON file or text)"}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Browse file
                <input
                  type="file"
                  accept=".json,.txt"
                  onChange={handleFileInput}
                  style={{ display: "none" }}
                />
              </label>
              <span style={{ fontSize: 11, color: "var(--fg-3)" }}>or</span>
              <button
                type="button"
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
                onClick={() => {
                  textareaRef.current?.focus();
                  setDropState("done");
                }}
              >
                paste text
              </button>
            </div>
          </div>
        )}

        {/* Text area — shown when text is loaded or paste mode */}
        {(hasJson || dropState === "done") && importStatus !== "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              ref={textareaRef}
              value={jsonText}
              onChange={(e) => {
                loadText(e.target.value);
              }}
              placeholder="Paste the AI response JSON here..."
              rows={8}
              style={{
                width: "100%",
                background: "var(--bg-0)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-1)",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setJsonText("");
                  setDropState("idle");
                  setImportStatus("idle");
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ fontSize: 12, gap: 6 }}
                onClick={handleImport}
                disabled={!hasJson || importStatus === "loading"}
              >
                {importStatus === "loading" ? (
                  <>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        border: "2px solid var(--accent-ink)",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                      }}
                      className="animate-spin"
                    />
                    Importing…
                  </>
                ) : (
                  "Import comments"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Import error (non-JSON / network) */}
        {importStatus === "error" && importError && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid color-mix(in oklch, var(--c-critical) 40%, transparent)",
              background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-2))",
              color: "var(--c-critical)",
              fontSize: 12,
            }}
          >
            {importError}
          </div>
        )}

        {/* Import result */}
        {importStatus === "done" &&
          importResult &&
          (() => {
            const hasJsonError = Boolean(importResult.json_error);
            const hasItemErrors = importResult.errors.length > 0;
            const succeeded = importResult.imported > 0;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Summary row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 6,
                    border: `1px solid color-mix(in oklch, ${succeeded ? "var(--accent)" : "var(--c-critical)"} 35%, transparent)`,
                    background: `color-mix(in oklch, ${succeeded ? "var(--accent)" : "var(--c-critical)"} 8%, var(--bg-2))`,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{succeeded ? "✓" : "✗"}</span>
                  <div style={{ flex: 1 }}>
                    {succeeded ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)" }}>
                        {importResult.imported} comment{importResult.imported !== 1 ? "s" : ""}{" "}
                        imported
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-critical)" }}>
                        Import failed — no valid comments found
                      </span>
                    )}
                    {hasItemErrors && (
                      <span style={{ fontSize: 11, color: "var(--fg-2)", marginLeft: 8 }}>
                        · {importResult.errors.length} item
                        {importResult.errors.length !== 1 ? "s" : ""} skipped
                      </span>
                    )}
                  </div>
                  {hasItemErrors && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={() => {
                        setShowErrors((v) => !v);
                      }}
                    >
                      {showErrors ? "Hide" : "Show"} errors
                    </button>
                  )}
                  {!succeeded && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={() => {
                        setImportStatus("idle");
                        setImportResult(null);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {/* Top-level JSON error */}
                {hasJsonError && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid color-mix(in oklch, var(--c-critical) 35%, transparent)",
                      background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-2))",
                      fontSize: 11,
                      color: "var(--c-critical)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <strong style={{ fontFamily: "var(--font-sans)" }}>JSON error: </strong>
                    {importResult.json_error}
                  </div>
                )}

                {/* Per-item errors */}
                {showErrors && hasItemErrors && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: "var(--fg-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Skipped items
                    </div>
                    {importResult.errors.map((err) => (
                      <div
                        key={err.index}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--bg-2)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                            #{err.index + 1}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--c-major)", fontWeight: 500 }}>
                            {err.reason}
                          </span>
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: 10,
                            color: "var(--fg-3)",
                            fontFamily: "var(--font-mono)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: 80,
                            overflowY: "auto",
                          }}
                        >
                          {err.raw}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* Continue button */}
                {succeeded && (
                  <button
                    type="button"
                    className="btn primary"
                    style={{ alignSelf: "flex-end", gap: 6 }}
                    onClick={() => {
                      setStage("polish");
                    }}
                  >
                    Polish comments →
                  </button>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
};

/* ── Auto dispatch (stream) ─────────────────────────────────── */
type AutoDispatchProps = {
  activeReviewId: string;
  providers: AIProvider[];
  onDone: (count: number) => void;
};

const AutoDispatch = ({
  activeReviewId,
  providers,
  onDone,
}: AutoDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const { refetch } = useReview(activeReviewId);

  const [status, setStatus] = useState<DispatchStatus>("idle");
  const [accumulated, setAccumulated] = useState("");
  const [parsedComments, setParsedComments] = useState<ParsedComment[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id ?? "");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const first = providers[0];
    return first?.models[0] ?? "";
  });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accRef = useRef("");

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers[0];
  const availableModels = selectedProvider?.models ?? [];

  // Animate cards appearing one by one after done
  useEffect(() => {
    if (status !== "done" || parsedComments.length === 0) return;
    let i = 0;
    const tick = (): void => {
      i++;
      setVisibleCount(i);
      if (i < parsedComments.length) setTimeout(tick, 60);
    };
    // Reset then start ticking after one frame to avoid synchronous setState in effect
    const resetTimer = setTimeout(() => {
      setVisibleCount(0);
      setTimeout(tick, 60);
    }, 0);
    return () => {
      clearTimeout(resetTimer);
    };
  }, [status, parsedComments.length]);

  const handleProviderChange = (id: string): void => {
    setSelectedProviderId(id);
    const p = providers.find((x) => x.id === id);
    setSelectedModel(p?.models[0] ?? "");
  };

  const handleDispatch = useCallback(async (): Promise<void> => {
    if (!selectedProviderId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("streaming");
    setAccumulated("");
    setParsedComments([]);
    setVisibleCount(0);
    setError(null);
    accRef.current = "";

    try {
      for await (const chunk of reviewApi.dispatchStream(
        activeReviewId,
        selectedProviderId,
        ctrl.signal,
        selectedModel || undefined
      )) {
        accRef.current += chunk;
        const next = accRef.current;
        setAccumulated(next);
        setParsedComments(tryParsePartialComments(next));
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      const updated = await refetch();
      const count = updated.data?.comments.length ?? 0;
      setCommentCount(count);
      setParsedComments(tryParsePartialComments(accRef.current));
      onDone(count);
      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setStatus("error");
    }
  }, [activeReviewId, selectedProviderId, selectedModel, refetch, onDone]);

  if (providers.length === 0) {
    return (
      <div
        style={{
          padding: "20px 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-2)",
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--fg-1)" }}>
          No AI providers configured
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>
          Add a provider in{" "}
          <Link to="/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Settings → AI Providers
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const isStreaming = status === "streaming";
  const isDone = status === "done";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Provider + model row */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              handleProviderChange(p.id);
            }}
            disabled={isStreaming}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: `1px solid ${selectedProviderId === p.id ? "var(--accent)" : "var(--border)"}`,
              background: selectedProviderId === p.id ? "var(--accent)" : "transparent",
              color: selectedProviderId === p.id ? "var(--accent-ink)" : "var(--fg-1)",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.08s",
            }}
          >
            {p.name}
          </button>
        ))}

        {availableModels.length > 0 && (
          <select
            value={selectedModel}
            disabled={isStreaming}
            onChange={(e) => {
              setSelectedModel(e.target.value);
            }}
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              color: "var(--fg-0)",
              fontFamily: "var(--font-mono)",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => {
            void handleDispatch();
          }}
          disabled={isStreaming || !selectedProviderId}
          className="btn primary"
          style={{
            fontSize: 13,
            padding: "6px 16px",
            opacity: isStreaming || !selectedProviderId ? 0.5 : 1,
            boxShadow:
              !isStreaming && selectedProviderId
                ? "0 0 18px color-mix(in oklch, var(--accent) 25%, transparent)"
                : "none",
          }}
        >
          {isStreaming ? (
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  border: "2px solid var(--accent-ink)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                }}
                className="animate-spin"
              />
              Dispatching…
            </span>
          ) : isDone ? (
            "Dispatch again"
          ) : (
            `Dispatch with ${selectedProvider?.name ?? "AI"}`
          )}
        </button>
      </div>

      {/* Streaming / result area */}
      {(isStreaming || isDone || status === "error") && accumulated && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            borderRadius: 10,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {/* Header bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              background: "var(--bg-1)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {isStreaming ? (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  flexShrink: 0,
                  animation: "pulse-ring 1.2s ease-out infinite",
                }}
              />
            ) : (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--c-add)",
                  flexShrink: 0,
                }}
              />
            )}
            <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-2)", flex: 1 }}>
              {isStreaming
                ? `${selectedProvider?.name ?? "AI"} · generating…`
                : `${selectedProvider?.name ?? "AI"} · done`}
            </span>
            <span className="chip" style={{ fontSize: 10 }}>
              {parsedComments.length > 0
                ? `${String(parsedComments.length)} comment${parsedComments.length !== 1 ? "s" : ""}${isStreaming ? "…" : ""}`
                : isStreaming
                  ? "parsing…"
                  : "0 comments"}
            </span>
          </div>

          {/* During streaming: raw text with cursor */}
          {isStreaming && (
            <div
              ref={scrollRef}
              style={{
                maxHeight: 220,
                overflowY: "auto",
                padding: "12px 14px",
                background: "var(--bg-0)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: 1.6,
                color: "var(--fg-2)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {accumulated}
              <span style={{ animation: "pulse 1s step-end infinite", color: "var(--accent)" }}>
                ▌
              </span>
            </div>
          )}

          {/* After done: comment cards */}
          {isDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {parsedComments.length === 0 ? (
                <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--fg-3)" }}>
                  No comments parsed from response.
                </div>
              ) : (
                parsedComments.slice(0, visibleCount).map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 14px",
                      borderBottom:
                        i < parsedComments.length - 1 ? "1px solid var(--border)" : "none",
                      background: i % 2 === 0 ? "var(--bg-0)" : "var(--bg-1)",
                      animation: "fadeSlideIn 0.18s ease both",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: `color-mix(in oklch, ${SEV_COLOR[c.severity] ?? "var(--fg-3)"} 15%, transparent)`,
                          color: SEV_COLOR[c.severity] ?? "var(--fg-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {c.severity}
                      </span>
                      {c.file ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            color: "var(--fg-3)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.file}
                          {c.line != null ? `:${String(c.line)}` : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: "var(--fg-3)" }}>general note</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--fg-1)",
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {c.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Done actions */}
      {isDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
            {commentCount} comment{commentCount !== 1 ? "s" : ""} saved · ready to polish
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setStage("polish");
            }}
          >
            Polish comments →
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            border: "1px solid color-mix(in oklch, var(--c-critical) 40%, transparent)",
            background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-2))",
            color: "var(--c-critical)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

/* ── DispatchStage ──────────────────────────────────────────── */
export const DispatchStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const { data: review } = useReview(activeReviewId);
  const { data: providers = [] } = useAIProviders();
  const [mode, setMode] = useState<Mode>("auto");

  // Must be called unconditionally — hooks before any early returns
  const diffSize = useDiffSize(activeReviewId);
  const excludeDiff = diffSize.level === "large";

  const { data: promptText, isLoading: isPromptLoading } = useQuery({
    queryKey: ["review-prompt", activeReviewId, excludeDiff],
    queryFn: () => reviewApi.getPrompt(activeReviewId ?? "", excludeDiff),
    enabled: activeReviewId !== null,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeReviewId) {
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
        No active review session. Go back to Pick and start a review.
      </div>
    );
  }

  if (!review) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode switch pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "14px 20px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: 3,
            gap: 2,
          }}
        >
          {(["manual", "auto"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
              }}
              style={{
                padding: "5px 16px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: mode === m ? 600 : 400,
                background: mode === m ? "var(--bg-0)" : "transparent",
                color: mode === m ? "var(--fg-0)" : "var(--fg-2)",
                border: mode === m ? "1px solid var(--border)" : "1px solid transparent",
                cursor: "pointer",
                transition: "all 0.1s",
              }}
            >
              {m === "manual" ? "Copy & paste" : "Run in app"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          maxWidth: 640,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {mode === "manual" ? (
          <ManualDispatch
            promptText={promptText}
            isLoading={isPromptLoading}
            reviewId={activeReviewId}
            excludeDiff={excludeDiff}
          />
        ) : (
          <AutoDispatch
            activeReviewId={activeReviewId}
            providers={providers}
            onDone={() => {
              /* comment count handled internally */
            }}
          />
        )}
      </div>
    </div>
  );
};
