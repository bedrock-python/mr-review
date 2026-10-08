import { Checkbox, Field, Textarea } from "@shared/ui";
import { useLinesField } from "../lib";
import { BriefSection } from "./BriefSection";
import { ExcludedFilesList } from "./ExcludedFilesList";
import type { BriefConfig, ExcludedFiles } from "@entities/review";

const PATTERN_ROWS = 3;

const Code = ({ children }: { children: string }): React.ReactElement => (
  <code className="text-fg-1 font-mono">{children}</code>
);

export type PathFiltersProps = {
  config: BriefConfig;
  excluded: ExcludedFiles | undefined;
  isChecking: boolean;
  onChange: (patch: Partial<BriefConfig>) => void;
  /** The include-patterns field, for "Edit path filters" to focus. */
  includeFieldRef: React.Ref<HTMLTextAreaElement>;
};

export const PathFilters = ({
  config,
  excluded,
  isChecking,
  onChange,
  includeFieldRef,
}: PathFiltersProps): React.ReactElement => {
  const include = useLinesField(config.include_paths, (lines) => {
    onChange({ include_paths: lines });
  });
  const exclude = useLinesField(config.exclude_paths, (lines) => {
    onChange({ exclude_paths: lines });
  });
  const files = excluded?.excluded ?? [];

  return (
    <BriefSection
      as="h3"
      title="Path filters"
      description="Glob patterns over changed-file paths, one per line, as in .gitignore. Excluded files are left out of the diff and of context gathering."
    >
      <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-3)" }}
        >
          <Field label="Include only" hint="Empty: every changed file.">
            <Textarea
              ref={includeFieldRef}
              isMono
              rows={PATTERN_ROWS}
              placeholder="e.g. src/**"
              value={include.value}
              onChange={include.onChange}
              onBlur={include.onBlur}
            />
          </Field>
          <Field label="Exclude" hint="A leading ! takes a file back in.">
            <Textarea
              isMono
              rows={PATTERN_ROWS}
              placeholder={"e.g. *.snap\n!/go.sum"}
              value={exclude.value}
              onChange={exclude.onChange}
              onBlur={exclude.onBlur}
            />
          </Field>
        </div>
        <p
          className="text-fg-2 m-0"
          style={{ fontSize: "var(--fs-meta)", lineHeight: "var(--lh-body)" }}
        >
          <Code>*.snap</Code> or <Code>docs</Code> match at any depth, a directory with everything
          in it; <Code>src/generated</Code> and <Code>src/**/*.py</Code> are paths from the root;{" "}
          <Code>\</Code> escapes <Code>* ? [</Code>. Your patterns are case-sensitive, the built-in
          defaults are not.
        </p>
        <Checkbox
          label="Skip generated and vendored files"
          description="Lockfiles, minified bundles, source maps, generated and vendored code, binary assets."
          checked={config.use_default_excludes}
          onCheckedChange={(use_default_excludes) => {
            onChange({ use_default_excludes });
          }}
        />
        <div aria-live="polite" className="text-fg-2" style={{ fontSize: "var(--fs-meta)" }}>
          {isChecking && !excluded ? "Checking which files are excluded…" : null}
          {excluded &&
            files.length === 0 &&
            `All ${String(excluded.total)} changed files are reviewed.`}
        </div>
        {excluded && files.length > 0 && (
          <ExcludedFilesList
            excluded={excluded}
            onReviewAnyway={(pattern) => {
              onChange({ exclude_paths: [...config.exclude_paths, pattern] });
            }}
          />
        )}
      </div>
    </BriefSection>
  );
};
