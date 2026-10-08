import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useNav } from "@app/navigation";
import { useAIProviders, useModelCapabilities } from "@entities/ai-provider";
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
import type { DispatchResult, ImportResponseResult, Review } from "@entities/review";
import { Skeleton } from "@shared/ui";
import { useStageBarStore } from "@widgets/stage-bar";

import { createDispatchSession } from "../model/dispatchSession";
import {
  buildDispatchRequest,
  loadProviderSettings,
  pickInitialProviderId,
  saveLastProviderId,
  saveProviderSettings,
} from "../model/dispatchSettings";
import { waitForSavedRun } from "../model/waitForSavedRun";
import { DispatchOutcome } from "./DispatchOutcome";
import { DispatchStreamPanel } from "./DispatchStreamPanel";
import { GenerationSettings } from "./GenerationSettings";
import { ImportReport } from "./ImportReport";
import { ModelPicker } from "./ModelPicker";

import type { ProviderDispatchSettings } from "../model/dispatchSettings";
import type { DispatchRunInfo, DispatchRunStatus } from "./DispatchStreamPanel";

type Mode = "auto" | "manual";
type DispatchStatus = "idle" | DispatchRunStatus;

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
  claude: "Claude models with adaptive thinking",
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

/* ── Manual dispatch ────────────────────────────────────────── */
type DropState = "idle" | "over" | "done";
type ImportStatus = "idle" | "loading" | "done" | "error";

type ManualDispatchProps = {
  promptText: string | undefined;
  isLoading: boolean;
  /** Why the prompt could not be built, e.g. every changed file is excluded by the brief. */
  promptError: string | null;
  reviewId: string;
  excludeDiff: boolean;
  excludeContext: boolean;
  existingCommentsCount: number;
  /** Pre-fills the response to import, e.g. model output that wasn't valid JSON. */
  initialResponseText: string | null;
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
  promptError,
  reviewId,
  excludeDiff,
  excludeContext,
  existingCommentsCount,
  initialResponseText,
}: ManualDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [dropState, setDropState] = useState<DropState>(initialResponseText ? "done" : "idle");
  const [jsonText, setJsonText] = useState(initialResponseText ?? "");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importResult, setImportResult] = useState<ImportResponseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
            <span style={{ fontSize: 12, color: "var(--fg-2)" }}>Generating prompt…</span>
          </div>
        ) : promptError !== null ? (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid color-mix(in oklch, var(--c-critical) 35%, transparent)",
              background: "color-mix(in oklch, var(--c-critical) 8%, var(--bg-2))",
              fontSize: 12,
              color: "var(--c-critical)",
              lineHeight: 1.5,
            }}
          >
            {`The prompt could not be built: ${promptError}`}
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
            color: "var(--fg-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
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
              color: "var(--fg-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            3
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", flex: 1 }}>
            Import JSON response
          </span>
          {hasJson && importStatus === "idle" && (
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-2)" }}>
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
            <div style={{ marginBottom: 8, color: "var(--fg-2)" }}>
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
              <span style={{ fontSize: 11, color: "var(--fg-2)" }}>or</span>
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
                  background: "color-mix(in oklch, var(--c-warn) 12%, var(--bg-1))",
                  border: "1px solid color-mix(in oklch, var(--c-warn) 35%, transparent)",
                  fontSize: 11,
                  color: "var(--fg-1)",
                }}
              >
                <span style={{ color: "var(--c-warn)", flexShrink: 0 }}>⚠</span>
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

        {importStatus === "done" && importResult && (
          <ImportReport
            result={importResult}
            onEdit={() => {
              setImportStatus("idle");
              setImportResult(null);
            }}
            onContinue={() => {
              setStage("polish");
            }}
          />
        )}
      </div>
    </div>
  );
};

/* ── AutoDispatch ───────────────────────────────────────────── */
const ProvidersSkeleton = (): React.ReactElement => (
  <div role="status" aria-label="Loading AI providers">
    <Skeleton style={{ width: 72, height: 11, marginBottom: 12 }} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} style={{ height: 96, borderRadius: 10 }} />
      ))}
    </div>
    <Skeleton style={{ height: 48, borderRadius: 10, marginTop: 24 }} />
  </div>
);

type AutoDispatchProps = {
  activeReviewId: string;
  providers: AIProvider[];
  onDone: (count: number) => void;
  /** Opens Copy & paste mode with `rawText` ready to fix and re-import. */
  onEditInManual: (rawText: string) => void;
  /** Told whether a generation is streaming, so the screen can keep it from being cut short. */
  onRunningChange: (isRunning: boolean) => void;
  existingCommentsCount: number;
};

const AutoDispatch = ({
  activeReviewId,
  providers,
  onDone,
  onEditInManual,
  onRunningChange,
  existingCommentsCount,
}: AutoDispatchProps): React.ReactElement => {
  const setStage = useStageBarStore((s) => s.setStage);
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const qc = useQueryClient();

  // `providers` has loaded by the time this mounts, so the saved choice can be restored.
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() =>
    pickInitialProviderId(providers)
  );
  // The model and generation settings last used with the selected provider.
  const [settings, setSettings] = useState<ProviderDispatchSettings>(() =>
    loadProviderSettings(providers.find((p) => p.id === selectedProviderId))
  );

  // Streamed output lives in this store, not in state: tokens must not re-render
  // this component, only the panel parts subscribed to the store.
  const [session] = useState(createDispatchSession);
  const [status, setStatus] = useState<DispatchStatus>("idle");
  const [run, setRun] = useState<DispatchRunInfo | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? providers[0];
  const availableModels = selectedProvider?.models ?? [];
  const selectedModel = settings.model;
  const { data: capabilities } = useModelCapabilities(selectedProviderId, selectedModel);

  useEffect(() => {
    if (selectedProviderId) saveLastProviderId(selectedProviderId);
  }, [selectedProviderId]);
  useEffect(() => {
    if (selectedProviderId) saveProviderSettings(selectedProviderId, settings);
  }, [selectedProviderId, settings]);

  // Leaving the screen ends the run: release the connection instead of streaming
  // into a component that is gone.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    onRunningChange(status === "streaming");
  }, [status, onRunningChange]);
  useEffect(
    () => () => {
      onRunningChange(false);
    },
    [onRunningChange]
  );

  const handleProviderChange = (id: string): void => {
    setSelectedProviderId(id);
    setSettings(loadProviderSettings(providers.find((x) => x.id === id)));
  };

  const handleSettingsChange = useCallback((patch: Partial<ProviderDispatchSettings>): void => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const handleDispatch = useCallback(async (): Promise<void> => {
    if (!selectedProviderId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const runId = ++runIdRef.current;
    const provider = providers.find((p) => p.id === selectedProviderId);

    session.reset();
    setRun({
      providerName: provider?.name ?? "AI",
      model: selectedModel,
      accentColor: provider ? PROVIDER_COLOR[provider.type] : "var(--accent)",
    });
    setResult(null);
    setError(null);
    setStatus("streaming");

    let outcome: DispatchResult | null = null;
    let failure: string | null = null;
    try {
      for await (const event of reviewApi.dispatchStream(
        activeReviewId,
        buildDispatchRequest(selectedProviderId, settings, capabilities, activeIterationId),
        ctrl.signal
      )) {
        if (event.type === "chunk") session.appendText(event.text);
        else if (event.type === "comment") session.addComment(event.comment);
        else if (event.type === "done") outcome = event.result;
        else failure = event.message;
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : "Dispatch failed";
    }
    session.flush();

    if (outcome) {
      // `done` arrives after the iteration is written: one refetch shows what was saved.
      await qc.invalidateQueries({ queryKey: reviewKeys.detail(activeReviewId) });
      if (runId !== runIdRef.current) return;
      if (!outcome.kept_previous) {
        // The saved comments, not the previews: the final parse can drop a draft the
        // stream already showed, or read a comment the preview could not.
        const iterationId = outcome.iteration_id;
        const saved = qc
          .getQueryData<Review>(reviewKeys.detail(activeReviewId))
          ?.iterations.find((it) => it.id === iterationId)?.comments;
        if (saved) {
          session.replaceComments(
            saved.map(({ file, line, severity, body }, index) => ({
              index,
              file,
              line,
              severity,
              body,
            }))
          );
        }
      }
      setResult(outcome);
      setStatus("done");
      onDone(outcome.comments);
      return;
    }
    if (runId !== runIdRef.current) return;
    // Without `done` the server writes what it kept once it notices the stream ended, which
    // can be after this point: wait for that write, so no screen shows the run as still going.
    const saved = waitForSavedRun(qc, activeReviewId);
    if (ctrl.signal.aborted) {
      setStatus("stopped");
    } else {
      setError(failure ?? "Dispatch failed");
      setStatus("error");
    }
    await saved;
  }, [
    activeReviewId,
    activeIterationId,
    providers,
    selectedProviderId,
    selectedModel,
    settings,
    capabilities,
    session,
    qc,
    onDone,
  ]);

  const handleStop = (): void => {
    abortRef.current?.abort();
  };

  const handleContinue = useCallback((): void => {
    setStage("polish");
  }, [setStage]);

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
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)" }}>
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
  const isPristine = status === "idle";
  const providerColor = selectedProvider ? PROVIDER_COLOR[selectedProvider.type] : "var(--accent)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Section 1: Provider cards ── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-2)",
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
                    style={{ fontSize: 10, color: "var(--fg-2)", lineHeight: 1.4, marginBottom: 4 }}
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
                        : "var(--fg-2)",
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

      {/* ── Section 2: Model — the provider's list or any typed id ── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-2)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          Model
        </div>
        <ModelPicker
          models={availableModels}
          value={selectedModel}
          onChange={(model) => {
            handleSettingsChange({ model });
          }}
          isDisabled={isStreaming}
          accentColor={providerColor}
        />
      </div>

      {/* ── Section 3: Generation settings, as far as the model accepts them ── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-2)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          Generation settings
        </div>
        <GenerationSettings
          settings={settings}
          capabilities={capabilities}
          onChange={handleSettingsChange}
          accentColor={providerColor}
          isDisabled={isStreaming}
        />
      </div>

      {/* ── Section 4: Dispatch button ── */}
      {existingCommentsCount > 0 && !isStreaming && status !== "done" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 6,
            marginBottom: 8,
            background: "color-mix(in oklch, var(--c-warn) 12%, var(--bg-1))",
            border: "1px solid color-mix(in oklch, var(--c-warn) 35%, transparent)",
            fontSize: 11,
            color: "var(--fg-1)",
          }}
        >
          <span style={{ color: "var(--c-warn)", flexShrink: 0 }}>⚠</span>
          {existingCommentsCount} existing comment
          {existingCommentsCount !== 1 ? "s" : ""} will be replaced once a complete answer is saved
          — a failed or unreadable run keeps them
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
              {isPristine
                ? `Generate with ${selectedProvider?.name ?? "AI"}`
                : `Run again with ${selectedProvider?.name ?? "AI"}`}
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
            onClick={handleStop}
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
      {status !== "idle" && run && (
        <DispatchStreamPanel
          store={session.store}
          status={status}
          run={run}
          isOutputUnsaved={status === "done" && result?.kept_previous === true}
        />
      )}

      {status === "done" && result && (
        <DispatchOutcome
          reviewId={activeReviewId}
          result={result}
          store={session.store}
          onEditInManual={onEditInManual}
          onContinue={handleContinue}
        />
      )}

      {error && (
        <div
          role="alert"
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
const NO_PROVIDERS: AIProvider[] = [];

export const DispatchStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const activeIterationId = useStageBarStore((s) => s.activeIterationId);
  const { data: review } = useReview(activeReviewId);
  const { data: providers = NO_PROVIDERS, isPending: isProvidersPending } = useAIProviders();
  const [mode, setMode] = useState<Mode>("auto");
  const [manualDraft, setManualDraft] = useState<string | null>(null);
  // Switching modes unmounts the generator and would cut a running generation short.
  const [isGenerating, setIsGenerating] = useState(false);

  const handleEditInManual = useCallback((rawText: string): void => {
    setManualDraft(rawText);
    setMode("manual");
  }, []);

  const handleDispatchDone = useCallback((): void => {
    // The finished run is reported inside AutoDispatch; nothing else reacts to it.
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
          color: "var(--fg-2)",
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
          color: "var(--fg-2)",
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
          {(["manual", "auto"] as const).map((m) => {
            const isLocked = isGenerating && mode !== m;
            return (
              <button
                key={m}
                type="button"
                disabled={isLocked}
                title={isLocked ? "Stop the generation to switch modes" : undefined}
                onClick={() => {
                  setMode(m);
                  setManualDraft(null);
                }}
                style={{
                  padding: "5px 16px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? "var(--bg-0)" : "transparent",
                  color: mode === m ? "var(--fg-0)" : "var(--fg-2)",
                  border: mode === m ? "1px solid var(--border)" : "1px solid transparent",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.5 : 1,
                  transition: "all 0.1s",
                }}
              >
                {m === "manual" ? "Copy & paste" : "Run in app"}
              </button>
            );
          })}
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
        {mode === "manual" && (
          <ManualDispatch
            promptText={promptText}
            isLoading={isPromptLoading}
            promptError={promptError ? promptError.message : null}
            reviewId={activeReviewId}
            excludeDiff={excludeDiff}
            excludeContext={excludeContext}
            existingCommentsCount={existingCommentsCount}
            initialResponseText={manualDraft}
          />
        )}
        {/* AutoDispatch restores the saved provider and model when it mounts, so it
            must not mount before the provider list is known. */}
        {mode === "auto" && isProvidersPending && <ProvidersSkeleton />}
        {mode === "auto" && !isProvidersPending && (
          <AutoDispatch
            activeReviewId={activeReviewId}
            providers={providers}
            onDone={handleDispatchDone}
            onEditInManual={handleEditInManual}
            onRunningChange={setIsGenerating}
            existingCommentsCount={existingCommentsCount}
          />
        )}
      </div>
    </div>
  );
};
