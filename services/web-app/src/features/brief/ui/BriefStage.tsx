import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNav } from "@app/navigation";
import { useStageBarStore } from "@widgets/stage-bar";
import { Markdown } from "@shared/ui";
import {
  useReview,
  useUpdateReview,
  useDiffSize,
  formatDiffSize,
  COMMIT_HISTORY_FILE_LIMIT,
  reviewApi,
} from "@entities/review";
import type { BriefConfig, BriefPreset } from "@entities/review";
import { DEFAULT_BRIEF_CONFIG, getReviewBriefConfig } from "@entities/review";

const PRESETS: { id: BriefPreset; label: string; description: string }[] = [
  { id: "thorough", label: "THOROUGH", description: "Complete review, bugs, logic, naming" },
  { id: "security", label: "SECURITY", description: "Injections, auth, crypto, exposure" },
  { id: "style", label: "STYLE", description: "Naming, readability, conventions" },
  { id: "performance", label: "PERFORMANCE", description: "Complexity, queries, allocations" },
];

const CONTEXT_TOGGLES: { key: keyof BriefConfig; label: string; hint?: string }[] = [
  { key: "include_diff", label: "Full diff" },
  { key: "include_description", label: "MR description" },
  {
    key: "include_full_files",
    label: "Full file contents",
    hint: "Fetches up to 15 changed files in full (up to 50 KB each, ~750 KB total). Useful for deeper analysis but significantly increases prompt size.",
  },
  {
    key: "include_test_context",
    label: "Test context",
    hint: "Fetches up to 20 test files adjacent to changed files (up to 50 KB each, ~1 MB total). May slow down prompt generation on large repos.",
  },
  {
    key: "include_related_code",
    label: "Related code",
    hint: "Fetches files imported by changed files (up to 20, up to 50 KB each, ~1 MB total). Requires downloading all changed files first to parse imports.",
  },
  { key: "include_commit_history", label: "Commit history" },
];

const DEBOUNCE_MS = 500;

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

export const BriefStage = (): React.ReactElement => {
  const { activeReviewId } = useNav();
  const setStage = useStageBarStore((s) => s.setStage);
  const { data: review, isLoading } = useReview(activeReviewId);
  const updateReview = useUpdateReview(activeReviewId ?? "");

  const [config, setConfig] = useState<BriefConfig>(DEFAULT_BRIEF_CONFIG);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (review && !initializedRef.current) {
      setConfig(getReviewBriefConfig(review));
      initializedRef.current = true;
    }
  }, [review]);

  const diffSize = useDiffSize(activeReviewId);

  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<BriefConfig>(DEFAULT_BRIEF_CONFIG);

  const { data: promptText, isFetching: isPromptFetching } = useQuery({
    queryKey: ["review-prompt", activeReviewId, previewConfig],
    queryFn: () => reviewApi.getPrompt(activeReviewId ?? "", previewConfig),
    enabled: activeReviewId !== null && previewRequested,
    staleTime: Infinity,
  });

  const handleConfigChange = useCallback(
    (patch: Partial<BriefConfig>): void => {
      const next = { ...config, ...patch };
      setConfig(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (activeReviewId) {
          updateReview.mutate({ brief_config: next });
        }
      }, DEBOUNCE_MS);
    },
    [config, activeReviewId, updateReview]
  );

  const handleRefreshPreview = useCallback((): void => {
    if (!activeReviewId) return;
    setPreviewConfig({ ...config });
    setPreviewRequested(true);
  }, [activeReviewId, config]);

  const handleDispatch = useCallback((): void => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const save = activeReviewId
      ? updateReview.mutateAsync({ brief_config: config })
      : Promise.resolve();
    void save.finally(() => {
      setStage("dispatch");
    });
  }, [activeReviewId, config, updateReview, setStage]);

  const tokenEstimate = promptText ? Math.ceil(promptText.length / 4) : 0;

  const handleCopy = (): void => {
    if (!promptText) return;
    void navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

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
        <span style={{ fontSize: 13 }}>Loading review…</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.05fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Left: config */}
      <div
        style={{
          overflowY: "auto",
          padding: "20px 20px 80px",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Presets 2×2 */}
        <section style={{ marginBottom: 24 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Review Intent
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PRESETS.map((preset) => {
              const isSelected = config.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    handleConfigChange({ preset: preset.id });
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    background: isSelected
                      ? "color-mix(in oklch, var(--accent) 10%, var(--bg-2))"
                      : "var(--bg-2)",
                    boxShadow: isSelected
                      ? `0 0 0 1px var(--accent), 0 2px 12px color-mix(in oklch, var(--accent) 15%, transparent)`
                      : "none",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.08s",
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: isSelected ? "var(--accent)" : "var(--fg-2)",
                    }}
                  >
                    {preset.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: isSelected ? "var(--fg-1)" : "var(--fg-3)",
                      lineHeight: 1.4,
                    }}
                  >
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Context toggles */}
        <section style={{ marginBottom: 24 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Context
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CONTEXT_TOGGLES.map((toggle) => {
              const checked = Boolean(config[toggle.key]);
              const isDiff = toggle.key === "include_diff";
              const isCommitHistory = toggle.key === "include_commit_history";
              const hasHint = Boolean(toggle.hint);
              const diffLevel = isDiff ? diffSize.level : "ok";
              const diffWarnColor = diffLevel === "large" ? "var(--c-critical)" : "var(--c-major)";
              const commitFilesOverLimit =
                isCommitHistory &&
                !diffSize.isLoading &&
                diffSize.fileCount > COMMIT_HISTORY_FILE_LIMIT;
              const commitWarnColor = "var(--c-major)";

              return (
                <div key={toggle.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        handleConfigChange({ [toggle.key]: e.target.checked });
                      }}
                      style={{
                        accentColor: "var(--accent)",
                        width: 13,
                        height: 13,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: checked ? "var(--fg-0)" : "var(--fg-2)",
                        flex: 1,
                      }}
                    >
                      {toggle.label}
                    </span>
                    {isDiff && !diffSize.isLoading && diffSize.chars > 0 && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: diffLevel === "ok" ? "var(--fg-3)" : diffWarnColor,
                          background:
                            diffLevel === "ok"
                              ? "var(--bg-3)"
                              : `color-mix(in oklch, ${diffWarnColor} 12%, var(--bg-2))`,
                          border: `1px solid ${diffLevel === "ok" ? "var(--border)" : `color-mix(in oklch, ${diffWarnColor} 35%, transparent)`}`,
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        {formatDiffSize(diffSize.chars)} · ~{diffSize.tokens.toLocaleString()}{" "}
                        tokens
                      </span>
                    )}
                    {isCommitHistory && !diffSize.isLoading && diffSize.fileCount > 0 && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: commitFilesOverLimit ? commitWarnColor : "var(--fg-3)",
                          background: commitFilesOverLimit
                            ? `color-mix(in oklch, ${commitWarnColor} 12%, var(--bg-2))`
                            : "var(--bg-3)",
                          border: `1px solid ${commitFilesOverLimit ? `color-mix(in oklch, ${commitWarnColor} 35%, transparent)` : "var(--border)"}`,
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        {diffSize.fileCount} files
                      </span>
                    )}
                  </label>
                  {isDiff && checked && diffLevel !== "ok" && (
                    <div
                      style={{
                        marginLeft: 23,
                        padding: "6px 10px",
                        borderRadius: 5,
                        border: `1px solid color-mix(in oklch, ${diffWarnColor} 35%, transparent)`,
                        background: `color-mix(in oklch, ${diffWarnColor} 8%, var(--bg-2))`,
                        fontSize: 11,
                        color: diffWarnColor,
                        lineHeight: 1.5,
                      }}
                    >
                      {diffLevel === "large"
                        ? "Diff exceeds ~100k tokens — most models will struggle or reject this. Consider disabling and attaching the diff separately."
                        : "Diff is large (~40k+ tokens). Some models may have limited context for the rest of the prompt. Consider attaching the diff as a separate file."}
                    </div>
                  )}
                  {isCommitHistory && checked && commitFilesOverLimit && (
                    <div
                      style={{
                        marginLeft: 23,
                        padding: "6px 10px",
                        borderRadius: 5,
                        border: `1px solid color-mix(in oklch, ${commitWarnColor} 35%, transparent)`,
                        background: `color-mix(in oklch, ${commitWarnColor} 8%, var(--bg-2))`,
                        fontSize: 11,
                        color: commitWarnColor,
                        lineHeight: 1.5,
                      }}
                    >
                      {`MR has ${String(diffSize.fileCount)} changed files — commit history will be fetched for the first ${String(COMMIT_HISTORY_FILE_LIMIT)} only.`}
                    </div>
                  )}
                  {hasHint && checked && (
                    <div
                      style={{
                        marginLeft: 23,
                        fontSize: 11,
                        color: "var(--fg-3)",
                        lineHeight: 1.5,
                      }}
                    >
                      {toggle.hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Custom instructions */}
        <section style={{ marginBottom: 24 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Custom Instructions
          </div>
          <textarea
            value={config.custom_instructions}
            onChange={(e) => {
              handleConfigChange({ custom_instructions: e.target.value });
            }}
            placeholder="Focus on performance bottlenecks in the data layer…"
            rows={4}
            style={{
              width: "100%",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 13,
              color: "var(--fg-0)",
              resize: "vertical",
              outline: "none",
              fontFamily: "var(--font-sans)",
            }}
          />
        </section>

        {/* Context files */}
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--fg-3)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Context Files
            </div>
            <button
              type="button"
              onClick={() => {
                handleConfigChange({ include_context: !config.include_context });
              }}
              style={{
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 999,
                border: `1px solid ${config.include_context ? "var(--accent)" : "var(--border)"}`,
                background: config.include_context
                  ? "color-mix(in oklch, var(--accent) 12%, var(--bg-2))"
                  : "var(--bg-2)",
                color: config.include_context ? "var(--accent)" : "var(--fg-3)",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {config.include_context ? "On" : "Off"}
            </button>
          </div>
          {config.include_context && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8, lineHeight: 1.5 }}>
                Paths to include as project context (one per line). Leave empty to auto-detect{" "}
                <span className="mono" style={{ fontSize: 10 }}>
                  .claude/CLAUDE.md
                </span>
                ,{" "}
                <span className="mono" style={{ fontSize: 10 }}>
                  CONTRIBUTING.md
                </span>
                ,{" "}
                <span className="mono" style={{ fontSize: 10 }}>
                  README.md
                </span>{" "}
                and more.
              </div>
              <textarea
                value={config.context_files.join("\n")}
                onChange={(e) => {
                  const lines = e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean);
                  handleConfigChange({ context_files: lines });
                }}
                placeholder={".claude/rules\nCONTRIBUTING.md\ndocs/"}
                rows={3}
                style={{
                  width: "100%",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "var(--fg-0)",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </>
          )}
        </section>
      </div>

      {/* Right: prompt preview */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-0)",
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--fg-2)", fontWeight: 500 }}>
              Prompt Preview
            </span>
            {isPromptFetching && (
              <div
                style={{
                  width: 10,
                  height: 10,
                  border: "1.5px solid var(--border)",
                  borderTopColor: "var(--accent)",
                  borderRadius: "50%",
                }}
                className="animate-spin"
              />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {tokenEstimate > 0 && (
              <span className="chip mono" style={{ fontSize: 10 }}>
                ~{tokenEstimate.toLocaleString()} tokens
              </span>
            )}
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px", gap: 5 }}
              onClick={handleRefreshPreview}
              disabled={isPromptFetching}
            >
              {previewRequested ? "Refresh" : "Preview"}
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px", gap: 5 }}
              onClick={handleCopy}
              disabled={!promptText}
            >
              <CopyIcon />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            position: "relative",
            opacity: isPromptFetching ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {!promptText && !isPromptFetching ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 16,
                color: "var(--fg-3)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {previewRequested ? (
                "No prompt content returned"
              ) : (
                <>
                  <span style={{ lineHeight: 1.5, maxWidth: 220 }}>
                    Configure settings on the left, then preview the generated prompt
                  </span>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ gap: 6 }}
                    onClick={handleRefreshPreview}
                  >
                    Preview prompt
                  </button>
                </>
              )}
            </div>
          ) : (
            <Markdown>{promptText ?? ""}</Markdown>
          )}
        </div>

        {/* Continue bar */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button type="button" className="btn primary" onClick={handleDispatch} style={{ gap: 8 }}>
            Dispatch
            <span style={{ fontSize: 11, opacity: 0.7 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
