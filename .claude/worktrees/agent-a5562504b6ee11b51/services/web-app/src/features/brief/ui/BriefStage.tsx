import { useEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "@app/providers";
import { useStageBarStore } from "@widgets/stage-bar";
import { useReview, useUpdateReview } from "@entities/review";
import { Spinner } from "@shared/ui";
import { cn } from "@shared/lib";
import type { BriefConfig, BriefPreset } from "@entities/review";

const DEFAULT_CONFIG: BriefConfig = {
  preset: "thorough",
  include_diff: true,
  include_description: true,
  include_full_files: false,
  include_test_context: false,
  include_related_code: false,
  include_commit_history: false,
  custom_instructions: "",
};

type PresetMeta = {
  id: BriefPreset;
  label: string;
  description: string;
};

const PRESETS: PresetMeta[] = [
  { id: "thorough", label: "THOROUGH", description: "Complete review, bugs, logic, naming" },
  { id: "security", label: "SECURITY", description: "Injections, auth, crypto, exposure" },
  { id: "style", label: "STYLE", description: "Naming, readability, conventions" },
  { id: "performance", label: "PERFORMANCE", description: "Complexity, queries, allocations" },
];

type ContextToggle = {
  key: keyof Pick<
    BriefConfig,
    | "include_diff"
    | "include_description"
    | "include_full_files"
    | "include_test_context"
    | "include_related_code"
    | "include_commit_history"
  >;
  label: string;
};

const CONTEXT_TOGGLES: ContextToggle[] = [
  { key: "include_diff", label: "Full diff" },
  { key: "include_description", label: "MR description" },
  { key: "include_full_files", label: "Full file contents" },
  { key: "include_test_context", label: "Test context" },
  { key: "include_related_code", label: "Related code" },
  { key: "include_commit_history", label: "Commit history" },
];

const DEBOUNCE_MS = 500;

export const BriefStage = (): React.ReactElement => {
  const { activeReviewId } = useAppStore();
  const setStage = useStageBarStore((s) => s.setStage);
  const { data: review, isLoading } = useReview(activeReviewId);
  const updateReview = useUpdateReview(activeReviewId ?? "");

  const [config, setConfig] = useState<BriefConfig>(DEFAULT_CONFIG);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // Seed local state from loaded review once
  useEffect(() => {
    if (review && !initializedRef.current) {
      setConfig(review.brief_config);
      initializedRef.current = true;
    }
  }, [review]);

  // Debounced auto-save on config changes
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
    [config, activeReviewId, updateReview],
  );

  if (!activeReviewId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No active review session. Go back to PICK and start a review.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-text-muted">
        <Spinner size="md" />
        <span className="text-sm">Loading review…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full flex-1">
        {/* Preset cards */}
        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
            Review Intent
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((preset) => {
              const isSelected = config.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleConfigChange({ preset: preset.id })}
                  className={cn(
                    "flex flex-col gap-1 p-3 rounded-lg border text-left transition-all",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-border bg-surface text-text-muted hover:border-text-muted/40 hover:text-text",
                  )}
                >
                  <span className="text-[10px] font-mono font-bold tracking-widest">
                    {preset.label}
                  </span>
                  <span className="text-[11px] leading-snug">{preset.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Context toggles */}
        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
            Context
          </h2>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {CONTEXT_TOGGLES.map((toggle) => {
              const checked = config[toggle.key];
              return (
                <label
                  key={toggle.key}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleConfigChange({ [toggle.key]: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border border-border bg-surface-2 accent-[var(--accent)] cursor-pointer"
                  />
                  <span
                    className={cn(
                      "text-sm transition-colors",
                      checked ? "text-text" : "text-text-muted group-hover:text-text",
                    )}
                  >
                    {toggle.label}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Additional instructions */}
        <section>
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
            Additional instructions
          </h2>
          <textarea
            value={config.custom_instructions}
            onChange={(e) => handleConfigChange({ custom_instructions: e.target.value })}
            placeholder="Focus on performance bottlenecks in the data layer…"
            rows={4}
            className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
          />
        </section>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-border bg-surface px-6 py-3 flex justify-end flex-shrink-0">
        <button
          type="button"
          onClick={() => setStage("dispatch")}
          className={cn(
            "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all",
            "bg-[var(--accent)] text-[rgb(var(--accent-fg))]",
            "hover:opacity-90",
          )}
        >
          → Dispatch
        </button>
      </div>
    </div>
  );
};
