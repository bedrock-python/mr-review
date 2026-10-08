import { useId } from "react";
import { MAX_COMMENTS_LIMIT } from "@entities/review";
import { Eyebrow, Field, Input, SegmentedControl } from "@shared/ui";
import { BriefSection } from "./BriefSection";
import type { BriefConfig, CommentSeverity } from "@entities/review";

const LANGUAGE_SUGGESTIONS = [
  "English",
  "Russian",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Italian",
  "Ukrainian",
  "Polish",
  "Turkish",
  "Chinese (Simplified)",
  "Japanese",
  "Korean",
];

const MAX_LANGUAGE_CHARS = 64;

const SEVERITY_FLOORS: { value: CommentSeverity; label: string }[] = [
  { value: "suggestion", label: "Everything" },
  { value: "minor", label: "Minor and up" },
  { value: "major", label: "Major and up" },
  { value: "critical", label: "Critical only" },
];

export type OutputSectionProps = {
  config: BriefConfig;
  onChange: (patch: Partial<BriefConfig>) => void;
};

export const OutputSection = ({ config, onChange }: OutputSectionProps): React.ReactElement => {
  const id = useId();

  return (
    <BriefSection title="Output" description="How the comments come back, and how many.">
      <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <Eyebrow as="div" id={`${id}-severity`}>
            Minimum severity
          </Eyebrow>
          <SegmentedControl
            aria-labelledby={`${id}-severity`}
            options={SEVERITY_FLOORS}
            value={config.min_severity}
            onValueChange={(min_severity) => {
              onChange({ min_severity });
            }}
            className="self-start"
          />
          <p className="text-fg-2 m-0" style={{ fontSize: "var(--fs-meta)" }}>
            Comments under it are dropped, even when the model sends them.
          </p>
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: "var(--space-4)",
          }}
        >
          <Field label="Comment language" hint="Empty: the language of the code and the MR.">
            <Input
              list={`${id}-languages`}
              maxLength={MAX_LANGUAGE_CHARS}
              value={config.output_language}
              placeholder="e.g. English"
              onChange={(event) => {
                onChange({ output_language: event.target.value });
              }}
            />
          </Field>
          <Field
            label="Maximum comments"
            hint="Empty: no limit. Past it, the most severe are kept."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COMMENTS_LIMIT}
              value={config.max_comments ?? ""}
              placeholder="e.g. 20"
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                onChange({
                  max_comments: Number.isNaN(parsed)
                    ? null
                    : Math.min(Math.max(parsed, 1), MAX_COMMENTS_LIMIT),
                });
              }}
            />
          </Field>
        </div>
        <datalist id={`${id}-languages`}>
          {LANGUAGE_SUGGESTIONS.map((language) => (
            <option key={language} value={language} />
          ))}
        </datalist>
      </div>
    </BriefSection>
  );
};
