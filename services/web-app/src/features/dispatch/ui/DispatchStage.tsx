import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useNav } from "@app/navigation";
import { useAIProviders } from "@entities/ai-provider";
import type { AIProvider } from "@entities/ai-provider";
import {
  useReview,
  reviewApi,
  reviewKeys,
  useDiffSize,
  useContextSize,
  formatDiffSize,
  formatContextSize,
  getReviewBriefConfig,
} from "@entities/review";
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

type ReasoningMode = "budget" | "effort";
type ReasoningEffort = "low" | "medium" | "high";

type ModelSettings = {
  temperature: number | null;
  reasoningBudget: number | null;
  reasoningEffort: ReasoningEffort | null;
  reasoningMode: ReasoningMode;
};

const SEV_COLOR: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  suggestion: "var(--c-suggestion)",
};

const LAST_PROVIDER_KEY = "mr-review:dispatch:last-provider";
const LAST_MODEL_KEY = "mr-review:dispatch:last-model";
const LAST_SETTINGS_KEY = "mr-review:dispatch:last-settings";

/* ── Provider metadata ──────────────────────────────────────── */
const PROVIDER_COLOR: Record<AIProvider["type"], string> = {
  claude: "#c97a4f",
  openai: "#74a98a",
  openai_compat: "#7c8cf8",
};

const PROVIDER_LABEL: Record<AIProvider["type"], string> = {
  claude: "Anthropic",
  openai: "OpenAI",
  openai_compat: "Compatible",
};

const PROVIDER_DESC: Record<AIProvider["type"], string> = {
  claude: "Claude models with extended thinking support",
  openai: "GPT-4, o1, o3 and other OpenAI models",
  openai_compat: "Local or third-party OpenAI-compatible endpoint",
};

/* ── Icons ──────────────────────────────────────────────────── */
const ProviderIcon = ({
  type,
  size = 18,
}: {
  type: AIProvider["type"];
  size?: number;
}): React.ReactElement => {
  if (type === "claude") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.827 3.52h3.603l-7.376 16.96H6.45zm-6.851 0H10.58L3.204 20.48H-.172z" />
      </svg>
    );
  }
  if (type === "openai") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zm-9.66-4.126a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="2" />
      <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="2" />
    </svg>
  );
};

/* ── Partial comment parser ─────────────────────────────────── */
function extractJsonCandidate(raw: string): string {
  const stripped = raw.trim();
  // 1. Unwrap ```json ... ``` or ``` ... ``` fences
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(stripped);
  if (fenceMatch) return (fenceMatch[1] ?? "").trim();
  // 2. Find first '[' ... last ']' anywhere in the text (handles preamble/postamble)
  const arrayMatch = /(\[[\s\S]*\])/.exec(stripped);
  if (arrayMatch) return (arrayMatch[1] ?? "").trim();
  return stripped;
}

function tryParsePartialComments(raw: string): ParsedComment[] {
  const candidate = extractJsonCandidate(raw);

  try {
    const arr: unknown = JSON.parse(candidate);
    if (Array.isArray(arr)) return arr as ParsedComment[];
  } catch {
    // fall through to partial
  }

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

/* ── Manual dispatch ────────────────────────────────────────── */
type DropState = "idle" | "over" | "done";
type ImportStatus = "idle" | "loading" | "done" | "error";

type ManualDispatchProps = {
  promptText: string | undefined;
  isLoading: boolean;
  reviewId: string;
  excludeDiff: boolean;
  excludeContext: boolean;
  existingCommentsCount: number;
};

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

const ManualDispatch = ({
  promptText,
  isLoading,
  reviewId,
  excludeDiff,
  excludeContext,
  existingCommentsCount,
}: ManualDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
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
  const contextSize = useContextSize(reviewId);

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

  const handleDownloadContext = (): void => {
    void reviewApi.getContext(reviewId).then((ctx) => {
      const blob = new Blob([ctx], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "context.md";
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
      .importResponse(reviewId, jsonText, activeIterationId)
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
                    {isLarge ? "Diff excluded — too large for most models" : "Large diff detected"}
                    <span className="mono" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                      {formatDiffSize(diffSize.chars)} · ~{diffSize.tokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 8 }}
                  >
                    {excludeDiff
                      ? "Diff removed from prompt. Download it below and attach separately."
                      : "Consider attaching diff as a separate file."}
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

        {!contextSize.isLoading &&
          contextSize.level === "large" &&
          (() => {
            const warnColor = "var(--c-critical)";
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
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: warnColor, marginBottom: 4 }}>
                    Context excluded — too large for most models
                    <span className="mono" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                      {formatContextSize(contextSize.chars)} · ~
                      {contextSize.tokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 8 }}
                  >
                    {excludeContext
                      ? "Project context removed from prompt. Download it below and attach separately."
                      : "Context removed from prompt. Download it and attach separately."}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ gap: 6, padding: "4px 10px", fontSize: 11 }}
                    onClick={handleDownloadContext}
                  >
                    <DownloadIcon />
                    Download context.md ({formatContextSize(contextSize.chars)})
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
          Paste into your AI agent and run it. The model must respond with a JSON array.
        </span>
      </div>

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
              {jsonText.length.toLocaleString()} chars
            </span>
          )}
        </div>

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

        {(hasJson || dropState === "done") && importStatus !== "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              ref={textareaRef}
              value={jsonText}
              onChange={(e) => {
                loadText(e.target.value);
              }}
              placeholder="Paste AI response JSON here…"
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
            {existingCommentsCount > 0 && importStatus === "idle" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 6,
                  background: "color-mix(in oklch, var(--c-warn, #e6a817) 12%, var(--bg-1))",
                  border: "1px solid color-mix(in oklch, var(--c-warn, #e6a817) 35%, transparent)",
                  fontSize: 11,
                  color: "var(--fg-1)",
                }}
              >
                <span style={{ color: "var(--c-warn, #e6a817)", flexShrink: 0 }}>⚠</span>
                {existingCommentsCount} existing comment
                {existingCommentsCount !== 1 ? "s" : ""} will be replaced on import
              </div>
            )}
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

        {importStatus === "done" &&
          importResult &&
          (() => {
            const hasJsonError = Boolean(importResult.json_error);
            const hasItemErrors = importResult.errors.length > 0;
            const succeeded = importResult.imported > 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                        · {importResult.errors.length} skipped
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

/* ── AutoDispatch ───────────────────────────────────────────── */
type AutoDispatchProps = {
  activeReviewId: string;
  providers: AIProvider[];
  onDone: (count: number) => void;
  existingCommentsCount: number;
};

const AutoDispatch = ({
  activeReviewId,
  providers,
  onDone,
  existingCommentsCount,
}: AutoDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { refetch } = useReview(activeReviewId);

  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    const saved = localStorage.getItem(LAST_PROVIDER_KEY);
    if (saved && providers.find((p) => p.id === saved)) return saved;
    return providers[0]?.id ?? "";
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const savedPid = localStorage.getItem(LAST_PROVIDER_KEY);
    const savedModel = localStorage.getItem(LAST_MODEL_KEY);
    const provider = providers.find((p) => p.id === (savedPid ?? providers[0]?.id));
    if (savedModel && provider?.models.includes(savedModel)) return savedModel;
    return provider?.models[0] ?? "";
  });

  const [settings, setSettings] = useState<ModelSettings>(() => {
    try {
      const s = localStorage.getItem(LAST_SETTINGS_KEY);
      if (s) return JSON.parse(s) as ModelSettings;
    } catch {
      /* ignore */
    }
    return {
      temperature: null,
      reasoningBudget: null,
      reasoningEffort: null,
      reasoningMode: "budget",
    };
  });

  const [status, setStatus] = useState<DispatchStatus>("idle");
  const [accumulated, setAccumulated] = useState("");
  const [parsedComments, setParsedComments] = useState<ParsedComment[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [modelSearch, setModelSearch] = useState("");
  const [isModelDropOpen, setIsModelDropOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accRef = useRef("");
  const modelInputRef = useRef<HTMLInputElement>(null);
  const modelDropRef = useRef<HTMLDivElement>(null);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers[0];
  const availableModels = selectedProvider?.models ?? [];
  const isReasoningOn = settings.reasoningBudget !== null || settings.reasoningEffort !== null;

  useEffect(() => {
    if (selectedProviderId) localStorage.setItem(LAST_PROVIDER_KEY, selectedProviderId);
  }, [selectedProviderId]);
  useEffect(() => {
    if (selectedModel) localStorage.setItem(LAST_MODEL_KEY, selectedModel);
  }, [selectedModel]);
  useEffect(() => {
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!isModelDropOpen) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        modelDropRef.current &&
        !modelDropRef.current.contains(e.target as Node) &&
        modelInputRef.current &&
        !modelInputRef.current.contains(e.target as Node)
      ) {
        setIsModelDropOpen(false);
        setModelSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isModelDropOpen]);

  useEffect(() => {
    if (status !== "done" || parsedComments.length === 0) return;
    let i = 0;
    const tick = (): void => {
      i++;
      setVisibleCount(i);
      if (i < parsedComments.length) setTimeout(tick, 60);
    };
    const t = setTimeout(() => {
      setVisibleCount(0);
      setTimeout(tick, 60);
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [status, parsedComments.length]);

  const handleProviderChange = (id: string): void => {
    setSelectedProviderId(id);
    const p = providers.find((x) => x.id === id);
    const savedModel = localStorage.getItem(LAST_MODEL_KEY);
    if (savedModel && p?.models.includes(savedModel)) setSelectedModel(savedModel);
    else setSelectedModel(p?.models[0] ?? "");
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
        selectedModel || undefined,
        settings.temperature,
        settings.reasoningBudget,
        settings.reasoningEffort,
        activeIterationId
      )) {
        accRef.current += chunk;
        const next = accRef.current;
        setAccumulated(next);
        setParsedComments(tryParsePartialComments(next));
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      // Poll until backend persists comments (background task after stream ends)
      let updated = await refetch();
      const POLL_INTERVAL_MS = 300;
      const MAX_POLLS = 15;
      for (let poll = 0; poll < MAX_POLLS; poll++) {
        const comments = updated.data?.iterations.at(-1)?.comments ?? [];
        if (comments.length > 0) break;
        await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL_MS));
        updated = await refetch();
      }
      const count = updated.data?.iterations.at(-1)?.comments.length ?? 0;
      setCommentCount(count);
      setParsedComments(tryParsePartialComments(accRef.current));
      onDone(count);
      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError((err as Error).message);
      setStatus("error");
    }
  }, [
    activeReviewId,
    activeIterationId,
    selectedProviderId,
    selectedModel,
    settings,
    refetch,
    onDone,
  ]);

  if (providers.length === 0) {
    return (
      <div
        style={{
          padding: "32px 20px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg-2)",
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>
          No AI providers configured
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>
          Add a provider in{" "}
          <Link to="/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Settings → AI Providers
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const providerColor = selectedProvider ? PROVIDER_COLOR[selectedProvider.type] : "var(--accent)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Section 1: Provider cards ── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          Provider
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${String(Math.min(providers.length, 3))}, 1fr)`,
            gap: 8,
          }}
        >
          {providers.map((p) => {
            const isSelected = p.id === selectedProviderId;
            const color = PROVIDER_COLOR[p.type];
            return (
              <button
                key={p.id}
                type="button"
                disabled={isStreaming}
                onClick={() => {
                  handleProviderChange(p.id);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${isSelected ? color : "var(--border)"}`,
                  background: isSelected
                    ? `color-mix(in oklch, ${color} 8%, var(--bg-1))`
                    : "var(--bg-1)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.12s",
                  boxShadow: isSelected
                    ? `0 0 0 3px color-mix(in oklch, ${color} 14%, transparent)`
                    : "none",
                  opacity: isStreaming ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span style={{ color: isSelected ? color : "var(--fg-3)", display: "flex" }}>
                    <ProviderIcon type={p.type} size={20} />
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected ? "var(--fg-0)" : "var(--fg-1)",
                      marginBottom: 2,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{ fontSize: 10, color: "var(--fg-3)", lineHeight: 1.4, marginBottom: 4 }}
                  >
                    {PROVIDER_LABEL[p.type]}
                    {p.models.length > 0 &&
                      ` · ${String(p.models.length)} model${p.models.length !== 1 ? "s" : ""}`}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: isSelected
                        ? `color-mix(in oklch, ${color} 80%, var(--fg-2))`
                        : "var(--fg-3)",
                      lineHeight: 1.4,
                      opacity: 0.85,
                    }}
                  >
                    {PROVIDER_DESC[p.type]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Model select ── */}
      {availableModels.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 10,
            }}
          >
            Model
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                border: `1.5px solid ${isModelDropOpen ? providerColor : "var(--border)"}`,
                background: "var(--bg-1)",
                padding: "0 10px",
                transition: "border-color 0.1s",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ flexShrink: 0, color: "var(--fg-3)" }}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={modelInputRef}
                type="text"
                disabled={isStreaming}
                placeholder={selectedModel || "Search model…"}
                value={modelSearch}
                onChange={(e) => {
                  setModelSearch(e.target.value);
                  setIsModelDropOpen(true);
                }}
                onFocus={() => {
                  setIsModelDropOpen(true);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  color: modelSearch ? "var(--fg-0)" : "var(--fg-2)",
                  padding: "9px 0",
                  cursor: isStreaming ? "not-allowed" : "text",
                }}
              />
              {selectedModel && !modelSearch && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--fg-3)",
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 220,
                  }}
                >
                  {selectedModel}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  flexShrink: 0,
                  color: "var(--fg-3)",
                  transform: isModelDropOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                }}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {isModelDropOpen && (
              <div
                ref={modelDropRef}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-1)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {availableModels
                  .filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
                  .map((m) => {
                    const isSelected = m === selectedModel;
                    return (
                      <button
                        key={m}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedModel(m);
                          setIsModelDropOpen(false);
                          setModelSearch("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "8px 12px",
                          background: isSelected
                            ? `color-mix(in oklch, ${providerColor} 10%, var(--bg-0))`
                            : "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {isSelected ? (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={providerColor}
                            strokeWidth="3"
                            style={{ flexShrink: 0 }}
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <span style={{ width: 12, flexShrink: 0 }} />
                        )}
                        <span
                          style={{
                            fontSize: 13,
                            fontFamily: "var(--font-mono)",
                            color: isSelected ? "var(--fg-0)" : "var(--fg-1)",
                            fontWeight: isSelected ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {m}
                        </span>
                      </button>
                    );
                  })}
                {availableModels.filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
                  .length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      fontSize: 12,
                      color: "var(--fg-3)",
                      textAlign: "center",
                    }}
                  >
                    No models match "{modelSearch}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section 3: Settings (always visible) ── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          Generation settings
        </div>
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            padding: "16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-1)" }}>
                  Temperature
                </span>
                <span style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 8 }}>
                  Controls randomness of output
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: settings.temperature !== null ? "var(--fg-0)" : "var(--fg-3)",
                    minWidth: 32,
                    textAlign: "right",
                  }}
                >
                  {settings.temperature ?? "0.7"}
                </span>
                {settings.temperature !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettings((s) => ({ ...s, temperature: null }));
                    }}
                    style={{
                      fontSize: 10,
                      color: "var(--fg-3)",
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      cursor: "pointer",
                      padding: "2px 6px",
                    }}
                    title="Reset"
                  >
                    reset
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={settings.temperature ?? 0.7}
              onChange={(e) => {
                setSettings((s) => ({ ...s, temperature: parseFloat(e.target.value) }));
              }}
              style={{ width: "100%", accentColor: providerColor, height: 4 }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--fg-3)",
              }}
            >
              <span>0 — Deterministic</span>
              <span>0.7 — Default</span>
              <span>2 — Creative</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-1)" }}>Reasoning</span>
              <button
                type="button"
                onClick={() => {
                  setSettings((s) => {
                    if (isReasoningOn) {
                      return { ...s, reasoningBudget: null, reasoningEffort: null };
                    }
                    return s.reasoningMode === "effort"
                      ? { ...s, reasoningEffort: "medium" }
                      : { ...s, reasoningBudget: 8000 };
                  });
                }}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${isReasoningOn ? "var(--c-critical)" : "var(--border)"}`,
                  background: isReasoningOn
                    ? "color-mix(in oklch, var(--c-critical) 12%, var(--bg-2))"
                    : "var(--bg-2)",
                  color: isReasoningOn ? "var(--c-critical)" : "var(--fg-2)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {isReasoningOn ? "On" : "Off"}
              </button>
            </div>

            {isReasoningOn && (
              <>
                {/* Mode tabs: Budget / Effort */}
                <div style={{ display: "flex", gap: 4 }}>
                  {(["budget", "effort"] as ReasoningMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSettings((s) => {
                          if (m === "budget") {
                            return {
                              ...s,
                              reasoningMode: "budget",
                              reasoningBudget: s.reasoningBudget ?? 8000,
                              reasoningEffort: null,
                            };
                          }
                          return {
                            ...s,
                            reasoningMode: "effort",
                            reasoningEffort: s.reasoningEffort ?? "medium",
                            reasoningBudget: null,
                          };
                        });
                      }}
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: `1px solid ${settings.reasoningMode === m ? "var(--c-critical)" : "var(--border)"}`,
                        background:
                          settings.reasoningMode === m
                            ? "color-mix(in oklch, var(--c-critical) 10%, var(--bg-0))"
                            : "var(--bg-2)",
                        color: settings.reasoningMode === m ? "var(--c-critical)" : "var(--fg-2)",
                        cursor: "pointer",
                        fontWeight: settings.reasoningMode === m ? 600 : 400,
                        textTransform: "capitalize",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Budget slider */}
                {settings.reasoningMode === "budget" && settings.reasoningBudget !== null && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="range"
                        min="1000"
                        max="32000"
                        step="1000"
                        value={settings.reasoningBudget}
                        onChange={(e) => {
                          setSettings((s) => ({ ...s, reasoningBudget: parseInt(e.target.value) }));
                        }}
                        style={{ flex: 1, accentColor: "var(--c-critical)", height: 4 }}
                      />
                      <span
                        className="mono"
                        style={{ fontSize: 12, color: "var(--fg-1)", flexShrink: 0 }}
                      >
                        {settings.reasoningBudget.toLocaleString()} tok
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 10,
                        color: "var(--fg-3)",
                      }}
                    >
                      <span>1k — Fast</span>
                      <span>32k — Deep</span>
                    </div>
                  </>
                )}

                {/* Effort buttons */}
                {settings.reasoningMode === "effort" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["low", "medium", "high"] as ReasoningEffort[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setSettings((s) => ({ ...s, reasoningEffort: lvl }));
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          borderRadius: 6,
                          border: `1px solid ${settings.reasoningEffort === lvl ? "var(--c-critical)" : "var(--border)"}`,
                          background:
                            settings.reasoningEffort === lvl
                              ? "color-mix(in oklch, var(--c-critical) 10%, var(--bg-0))"
                              : "var(--bg-2)",
                          color:
                            settings.reasoningEffort === lvl ? "var(--c-critical)" : "var(--fg-2)",
                          fontSize: 12,
                          fontWeight: settings.reasoningEffort === lvl ? 600 : 400,
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 4: Dispatch button ── */}
      {existingCommentsCount > 0 && status === "idle" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 6,
            marginBottom: 8,
            background: "color-mix(in oklch, var(--c-warn, #e6a817) 12%, var(--bg-1))",
            border: "1px solid color-mix(in oklch, var(--c-warn, #e6a817) 35%, transparent)",
            fontSize: 11,
            color: "var(--fg-1)",
          }}
        >
          <span style={{ color: "var(--c-warn, #e6a817)", flexShrink: 0 }}>⚠</span>
          {existingCommentsCount} existing comment
          {existingCommentsCount !== 1 ? "s" : ""} will be replaced on generation
        </div>
      )}
      <div style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            void handleDispatch();
          }}
          disabled={isStreaming || !selectedProviderId}
          style={{
            flex: 1,
            padding: "14px 20px",
            borderRadius: 10,
            border: `1.5px solid ${!isStreaming && selectedProviderId ? providerColor : "var(--border)"}`,
            background:
              !isStreaming && selectedProviderId
                ? `color-mix(in oklch, ${providerColor} 90%, transparent)`
                : "var(--bg-2)",
            color: !isStreaming && selectedProviderId ? "white" : "var(--fg-3)",
            fontSize: 14,
            fontWeight: 600,
            cursor: isStreaming || !selectedProviderId ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all 0.12s",
            boxShadow:
              !isStreaming && selectedProviderId
                ? `0 4px 20px color-mix(in oklch, ${providerColor} 30%, transparent)`
                : "none",
            opacity: !selectedProviderId ? 0.4 : 1,
          }}
        >
          {isStreaming ? (
            <>
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                }}
                className="animate-spin"
              />
              Generating review comments…
            </>
          ) : (
            <>
              {selectedProvider && (
                <span style={{ opacity: 0.9, display: "flex" }}>
                  <ProviderIcon type={selectedProvider.type} size={16} />
                </span>
              )}
              {isDone
                ? `Run again with ${selectedProvider?.name ?? "AI"}`
                : `Generate with ${selectedProvider?.name ?? "AI"}`}
              {selectedModel && (
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.75,
                    fontWeight: 400,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {selectedModel}
                </span>
              )}
            </>
          )}
        </button>

        {isStreaming && (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setStatus("idle");
            }}
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              border: "1.5px solid color-mix(in oklch, var(--c-critical) 50%, transparent)",
              background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-1))",
              color: "var(--c-critical)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              transition: "all 0.1s",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            Stop
          </button>
        )}
      </div>

      {/* ── Section 5: Stream output ── */}
      {(isStreaming || isDone || status === "error") && accumulated && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--border)",
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
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
                  background: providerColor,
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
            {selectedModel && (
              <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                {selectedModel}
              </span>
            )}
            <span className="chip" style={{ fontSize: 10 }}>
              {parsedComments.length > 0
                ? `${String(parsedComments.length)} comment${parsedComments.length !== 1 ? "s" : ""}${isStreaming ? "…" : ""}`
                : isStreaming
                  ? "parsing…"
                  : "0 comments"}
            </span>
          </div>

          {isStreaming && (
            <div ref={scrollRef} style={{ maxHeight: 260, overflowY: "auto" }}>
              {parsedComments.length === 0 ? (
                <div
                  style={{
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "var(--fg-3)",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: providerColor,
                      flexShrink: 0,
                      animation: "pulse-ring 1.2s ease-out infinite",
                    }}
                  />
                  Analyzing…
                  <span style={{ animation: "pulse 1s step-end infinite", color: providerColor }}>
                    ▌
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {parsedComments.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 14px",
                        borderBottom: "1px solid var(--border)",
                        background: i % 2 === 0 ? "var(--bg-0)" : "var(--bg-1)",
                        animation: "fadeSlideIn 0.18s ease both",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
                      >
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
                          <span style={{ fontSize: 10.5, color: "var(--fg-3)" }}>general</span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--fg-1)",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {c.body}
                      </div>
                    </div>
                  ))}
                  <div
                    style={{
                      padding: "8px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "var(--fg-3)",
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: providerColor,
                        flexShrink: 0,
                        animation: "pulse-ring 1.2s ease-out infinite",
                      }}
                    />
                    <span style={{ animation: "pulse 1s step-end infinite", color: providerColor }}>
                      ▌
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isDone && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {parsedComments.length === 0 ? (
                <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--fg-3)" }}>
                  {commentCount > 0
                    ? `${String(commentCount)} comment${commentCount !== 1 ? "s" : ""} saved.`
                    : "No comments parsed from response."}
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

      {isDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
            {commentCount} comment{commentCount !== 1 ? "s" : ""} saved
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
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review } = useReview(activeReviewId);
  const { data: providers = [] } = useAIProviders();
  const [mode, setMode] = useState<Mode>("auto");

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

  const { data: promptText, isLoading: isPromptLoading } = useQuery({
    queryKey: ["review-prompt", activeReviewId, activeIterationId, promptConfig],
    queryFn: () =>
      reviewApi.getPrompt(activeReviewId ?? "", promptConfig, activeIterationId ?? undefined),
    enabled:
      activeReviewId !== null && !diffSize.isLoading && !contextSize.isLoading && review != null,
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
      {/* Mode switch */}
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
          padding: "24px 20px",
          maxWidth: 660,
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
            excludeContext={excludeContext}
            existingCommentsCount={existingCommentsCount}
          />
        ) : (
          <AutoDispatch
            activeReviewId={activeReviewId}
            providers={providers}
            onDone={() => {
              /* handled internally */
            }}
            existingCommentsCount={existingCommentsCount}
          />
        )}
      </div>
    </div>
  );
};
