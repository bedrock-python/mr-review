import { useId } from "react";
import { COMMIT_HISTORY_FILE_LIMIT, formatDiffSize } from "@entities/review";
import type { BriefConfig, DiffSizeInfo } from "@entities/review";
import {
  CHECKBOX_STYLE,
  HINT_STYLE,
  SECTION_STYLE,
  SECTION_TITLE_STYLE,
  noticeStyle,
} from "./styles";

type ToggleKey =
  | "include_diff"
  | "include_description"
  | "include_full_files"
  | "include_test_context"
  | "include_related_code"
  | "include_commit_history";

const CONTEXT_TOGGLES: { key: ToggleKey; label: string; hint?: string }[] = [
  { key: "include_diff", label: "Full diff" },
  { key: "include_description", label: "MR description" },
  {
    key: "include_full_files",
    label: "Full file contents",
    hint: "The first 15 changed files that were not deleted, up to 50 KB each. Binary content is skipped; the prompt budget trims what does not fit.",
  },
  {
    key: "include_test_context",
    label: "Test context",
    hint: "Up to 20 test files next to the changed files, those named after a changed file first. Costs a directory listing per changed directory.",
  },
  {
    key: "include_related_code",
    label: "Related code",
    hint: "Up to 20 files the changed Python and JS/TS files import (relative imports only). Reads up to 30 changed files to find the imports.",
  },
  { key: "include_commit_history", label: "Commit history" },
];

const BADGE_STYLE: React.CSSProperties = {
  fontSize: 10,
  borderRadius: "var(--radius-1)",
  padding: "1px 5px",
};

const badgeStyle = (warnColor: string | null): React.CSSProperties => ({
  ...BADGE_STYLE,
  color: warnColor ?? "var(--fg-2)",
  background: warnColor ? `color-mix(in oklch, ${warnColor} 12%, var(--bg-2))` : "var(--bg-3)",
  border: `1px solid ${warnColor ? `color-mix(in oklch, ${warnColor} 35%, transparent)` : "var(--border)"}`,
});

export type ContextSectionProps = {
  config: BriefConfig;
  diffSize: DiffSizeInfo;
  onChange: (patch: Partial<BriefConfig>) => void;
};

export const ContextSection = ({
  config,
  diffSize,
  onChange,
}: ContextSectionProps): React.ReactElement => {
  const id = useId();
  const diffWarnColor = diffSize.level === "large" ? "var(--c-critical)" : "var(--c-major)";
  const commitFilesOverLimit =
    !diffSize.isLoading && diffSize.fileCount > COMMIT_HISTORY_FILE_LIMIT;

  return (
    <section style={SECTION_STYLE} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={SECTION_TITLE_STYLE}>
        Context
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CONTEXT_TOGGLES.map((toggle) => {
          const isChecked = config[toggle.key];
          const isDiff = toggle.key === "include_diff";
          const isCommitHistory = toggle.key === "include_commit_history";
          return (
            <div key={toggle.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => {
                    onChange({ [toggle.key]: event.target.checked });
                  }}
                  style={CHECKBOX_STYLE}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: isChecked ? "var(--fg-0)" : "var(--fg-2)",
                    flex: 1,
                  }}
                >
                  {toggle.label}
                </span>
                {isDiff && !diffSize.isLoading && diffSize.chars > 0 && (
                  <span
                    className="mono"
                    style={badgeStyle(diffSize.level === "ok" ? null : diffWarnColor)}
                  >
                    {formatDiffSize(diffSize.chars)} · ~{diffSize.tokens.toLocaleString()} tokens
                  </span>
                )}
                {isCommitHistory && !diffSize.isLoading && diffSize.fileCount > 0 && (
                  <span
                    className="mono"
                    style={badgeStyle(commitFilesOverLimit ? "var(--c-major)" : null)}
                  >
                    {diffSize.fileCount} files
                  </span>
                )}
              </label>
              {isDiff && isChecked && diffSize.level !== "ok" && (
                <div style={{ ...noticeStyle(diffWarnColor), marginLeft: 23 }}>
                  {diffSize.level === "large"
                    ? "Diff exceeds ~100k tokens — the prompt budget will cut it. Narrow it with path filters under Advanced, or raise the budget for a larger model."
                    : "Diff is large (~40k+ tokens) and leaves less room for the rest of the prompt."}
                </div>
              )}
              {isCommitHistory && isChecked && commitFilesOverLimit && (
                <div style={{ ...noticeStyle("var(--c-major)"), marginLeft: 23 }}>
                  {`MR has ${String(diffSize.fileCount)} changed files — commit history will be fetched for the first ${String(COMMIT_HISTORY_FILE_LIMIT)} only.`}
                </div>
              )}
              {toggle.hint && isChecked && (
                <div style={{ ...HINT_STYLE, marginLeft: 23 }}>{toggle.hint}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
