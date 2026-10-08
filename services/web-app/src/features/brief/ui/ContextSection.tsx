import { COMMIT_HISTORY_FILE_LIMIT, formatDiffSize } from "@entities/review";
import { Callout, Checkbox } from "@shared/ui";
import { BriefSection } from "./BriefSection";
import { ContextFilesField } from "./ContextFilesField";
import type { BriefConfig, DiffSizeInfo, DiffSizeLevel } from "@entities/review";

type ToggleKey =
  | "include_diff"
  | "include_description"
  | "include_full_files"
  | "include_test_context"
  | "include_related_code"
  | "include_commit_history"
  | "include_context";

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
  {
    key: "include_context",
    label: "Project context files",
    hint: "The repository's own conventions: CLAUDE.md, CONTRIBUTING.md, README.md and the like, or the paths below.",
  },
];

// The checkbox and its gap: notes and fields under a toggle line up with its label.
const INDENT = "var(--space-6)";

type MetaTone = "plain" | "warn" | "danger";

const META_COLOR: Record<MetaTone, string> = {
  plain: "var(--fg-2)",
  warn: "var(--c-warn-fg)",
  danger: "var(--c-danger-fg)",
};

const DIFF_TONE: Record<DiffSizeLevel, MetaTone> = { ok: "plain", warn: "warn", large: "danger" };

const Meta = ({ tone, children }: { tone: MetaTone; children: string }): React.ReactElement => (
  <span
    className="shrink-0 font-mono"
    style={{ fontSize: "var(--fs-meta)", color: META_COLOR[tone], paddingTop: "var(--space-1)" }}
  >
    {children}
  </span>
);

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
  const commitFilesOverLimit =
    !diffSize.isLoading && diffSize.fileCount > COMMIT_HISTORY_FILE_LIMIT;

  const meta = (key: ToggleKey): React.ReactNode => {
    if (diffSize.isLoading) return null;
    if (key === "include_diff" && diffSize.chars > 0) {
      return (
        <Meta tone={DIFF_TONE[diffSize.level]}>
          {`${formatDiffSize(diffSize.chars)} · ≈ ${diffSize.tokens.toLocaleString()} tokens`}
        </Meta>
      );
    }
    if (key === "include_commit_history" && diffSize.fileCount > 0) {
      return (
        <Meta tone={commitFilesOverLimit ? "warn" : "plain"}>
          {`${String(diffSize.fileCount)} files`}
        </Meta>
      );
    }
    return null;
  };

  const notice = (key: ToggleKey): React.ReactNode => {
    if (key === "include_diff" && diffSize.level !== "ok") {
      return (
        <Callout tone={diffSize.level === "large" ? "danger" : "warn"} size="sm" role="note">
          {diffSize.level === "large"
            ? "Diff exceeds ~100k tokens — the prompt budget will cut it. Narrow it with path filters under Advanced, or raise the budget for a larger model."
            : "Diff is large (~40k+ tokens) and leaves less room for the rest of the prompt."}
        </Callout>
      );
    }
    if (key === "include_commit_history" && commitFilesOverLimit) {
      return (
        <Callout tone="warn" size="sm">
          {`MR has ${String(diffSize.fileCount)} changed files — commit history will be fetched for the first ${String(COMMIT_HISTORY_FILE_LIMIT)} only.`}
        </Callout>
      );
    }
    return null;
  };

  return (
    <BriefSection title="Context" description="What the prompt carries besides the instructions.">
      <ul className="m-0 flex list-none flex-col p-0" style={{ gap: "var(--space-3)" }}>
        {CONTEXT_TOGGLES.map((toggle) => {
          const isChecked = config[toggle.key];
          const shownNotice = isChecked ? notice(toggle.key) : null;
          return (
            <li key={toggle.key} className="flex flex-col" style={{ gap: "var(--space-2)" }}>
              <div className="flex items-start justify-between" style={{ gap: "var(--space-3)" }}>
                <Checkbox
                  label={toggle.label}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    onChange({ [toggle.key]: checked });
                  }}
                  {...(isChecked && toggle.hint ? { description: toggle.hint } : {})}
                />
                {meta(toggle.key)}
              </div>
              {shownNotice && <div style={{ marginLeft: INDENT }}>{shownNotice}</div>}
              {toggle.key === "include_context" && isChecked && (
                <div style={{ marginLeft: INDENT }}>
                  <ContextFilesField
                    paths={config.context_files}
                    onChange={(context_files) => {
                      onChange({ context_files });
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </BriefSection>
  );
};
