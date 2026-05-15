import { useState, useRef, useCallback } from "react";
import { useAppStore, useAIConfigStore } from "@app/providers";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, reviewApi } from "@entities/review";
import { Spinner } from "@shared/ui";
import { cn } from "@shared/lib";
import type { AIConfig } from "@entities/review";

type DispatchStatus = "idle" | "streaming" | "done" | "error";

export const DispatchStage = (): React.ReactElement => {
  const { activeReviewId } = useAppStore();
  const { config: aiConfig, setConfig } = useAIConfigStore();
  const setStage = useStageBarStore((s) => s.setStage);
  const { data: review, refetch } = useReview(activeReviewId);

  const [status, setStatus] = useState<DispatchStatus>("idle");
  const [accumulated, setAccumulated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  const handleDispatch = useCallback(async (): Promise<void> => {
    if (!activeReviewId || !aiConfig.api_key) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("streaming");
    setAccumulated("");
    setError(null);

    try {
      for await (const chunk of reviewApi.dispatchStream(activeReviewId, aiConfig, ctrl.signal)) {
        setAccumulated((prev) => {
          const next = prev + chunk;
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
          return next;
        });
      }
      // After stream ends, refetch review — backend auto-updated to "polish" with comments
      const updated = await refetch();
      setCommentCount(updated.data?.comments.length ?? 0);
      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      setStatus("error");
    }
  }, [activeReviewId, aiConfig, refetch]);

  if (!activeReviewId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No active review session. Go back to PICK and start a review.
      </div>
    );
  }

  // Show spinner while review data loads (only on first mount)
  if (!review && status === "idle") {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-text-muted">
        <Spinner size="md" />
        <span className="text-sm">Loading review…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6 max-w-3xl mx-auto w-full">
      {/* AI Configuration */}
      <AIConfigSection config={aiConfig} onChange={setConfig} disabled={status === "streaming"} />

      {/* Dispatch button */}
      <button
        type="button"
        onClick={() => {
          void handleDispatch();
        }}
        disabled={status === "streaming" || !aiConfig.api_key}
        className={cn(
          "self-start px-6 py-2.5 rounded-lg text-sm font-semibold transition-all",
          "bg-[var(--accent)] text-[rgb(var(--accent-fg))]",
          "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
          "flex items-center gap-2",
        )}
      >
        {status === "streaming" && <Spinner size="sm" />}
        {status === "streaming" ? "Dispatching…" : "Dispatch Review →"}
      </button>

      {/* Streaming output */}
      {(status === "streaming" || accumulated) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
            {status === "streaming" && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"
                aria-hidden="true"
              />
            )}
            <span>{status === "streaming" ? "Streaming…" : "AI Response"}</span>
          </div>
          <pre
            ref={outputRef}
            className="font-mono text-xs text-text bg-surface border border-border rounded-lg p-4 overflow-auto max-h-80 whitespace-pre-wrap"
          >
            {accumulated}
            {status === "streaming" && (
              <span className="animate-pulse" aria-hidden="true">
                ▌
              </span>
            )}
          </pre>
        </div>
      )}

      {/* Done state */}
      {status === "done" && (
        <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--accent)]" aria-hidden="true">
              ✓
            </span>
            <span className="text-text">
              {commentCount} comment{commentCount !== 1 ? "s" : ""} generated
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStage("polish")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-[rgb(var(--accent-fg))] hover:opacity-90"
          >
            → Polish
          </button>
        </div>
      )}

      {/* Error state */}
      {status === "error" && error && (
        <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
};

// AI Config section sub-component
type AIConfigSectionProps = {
  config: AIConfig;
  onChange: (partial: Partial<AIConfig>) => void;
  disabled: boolean;
};

const AIConfigSection = ({ config, onChange, disabled }: AIConfigSectionProps): React.ReactElement => {
  return (
    <div className="flex flex-col gap-4 p-5 bg-surface border border-border rounded-xl">
      <h3 className="text-sm font-semibold text-text">AI Configuration</h3>

      {/* Provider tabs */}
      <div className="flex gap-2">
        {(["claude", "openai"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ provider })}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all",
              config.provider === provider
                ? "bg-[var(--accent)] text-[rgb(var(--accent-fg))]"
                : "bg-surface-2 text-text-muted hover:text-text",
            )}
          >
            {provider === "claude" ? "Claude" : "OpenAI-compat"}
          </button>
        ))}
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
          API Key
        </label>
        <input
          type="password"
          value={config.api_key}
          disabled={disabled}
          onChange={(e) => onChange({ api_key: e.target.value })}
          placeholder={config.provider === "claude" ? "sk-ant-…" : "sk-…"}
          className="px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
        />
      </div>

      {/* Model */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Model
        </label>
        <input
          type="text"
          value={config.model}
          disabled={disabled}
          onChange={(e) => onChange({ model: e.target.value })}
          placeholder={config.provider === "claude" ? "claude-sonnet-4-6" : "gpt-4o"}
          className="px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
        />
      </div>

      {/* Base URL — only for OpenAI-compat */}
      {config.provider === "openai" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Base URL
          </label>
          <input
            type="url"
            value={config.base_url}
            disabled={disabled}
            onChange={(e) => onChange({ base_url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
};
