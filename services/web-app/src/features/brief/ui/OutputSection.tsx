import { useId } from "react";
import { MAX_COMMENTS_LIMIT } from "@entities/review";
import type { BriefConfig, CommentSeverity } from "@entities/review";
import { HINT_STYLE, SECTION_STYLE, SECTION_TITLE_STYLE, toggleChipStyle } from "./styles";

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
    <section style={SECTION_STYLE} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={SECTION_TITLE_STYLE}>
        Output
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="field-label" htmlFor={`${id}-language`}>
            Comment language
          </label>
          <input
            id={`${id}-language`}
            className="field"
            list={`${id}-languages`}
            maxLength={MAX_LANGUAGE_CHARS}
            value={config.output_language}
            placeholder="Same as the code and the MR"
            onChange={(event) => {
              onChange({ output_language: event.target.value });
            }}
          />
          <datalist id={`${id}-languages`}>
            {LANGUAGE_SUGGESTIONS.map((language) => (
              <option key={language} value={language} />
            ))}
          </datalist>
        </div>
        <div role="group" aria-labelledby={`${id}-severity`}>
          <div id={`${id}-severity`} className="field-label">
            Minimum severity
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SEVERITY_FLOORS.map((floor) => {
              const isOn = config.min_severity === floor.value;
              return (
                <button
                  key={floor.value}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => {
                    onChange({ min_severity: floor.value });
                  }}
                  style={toggleChipStyle(isOn)}
                >
                  {floor.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-max`}>
            Maximum comments
          </label>
          <input
            id={`${id}-max`}
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COMMENTS_LIMIT}
            value={config.max_comments ?? ""}
            placeholder="No limit"
            aria-describedby={`${id}-max-hint`}
            style={{ width: 140 }}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onChange({
                max_comments: Number.isNaN(parsed)
                  ? null
                  : Math.min(Math.max(parsed, 1), MAX_COMMENTS_LIMIT),
              });
            }}
          />
          <div id={`${id}-max-hint`} style={{ ...HINT_STYLE, marginTop: 4 }}>
            The model is asked for at most this many; when more come back, the most severe are kept.
            Comments under the minimum severity are dropped too.
          </div>
        </div>
      </div>
    </section>
  );
};
