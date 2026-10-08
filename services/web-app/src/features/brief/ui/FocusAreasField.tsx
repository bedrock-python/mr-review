import { useId, useState } from "react";
import { HINT_STYLE, SECTION_STYLE, SECTION_TITLE_STYLE, toggleChipStyle } from "./styles";

const SUGGESTED_FOCUS_AREAS = [
  "Error handling",
  "Concurrency and race conditions",
  "Input validation",
  "Test coverage",
  "Backward compatibility",
  "Database migrations",
  "Logging and observability",
  "Documentation",
  "Accessibility",
  "Localisation",
];

const MAX_FOCUS_AREA_CHARS = 200;

export type FocusAreasFieldProps = {
  value: string[];
  onChange: (areas: string[]) => void;
};

export const FocusAreasField = ({ value, onChange }: FocusAreasFieldProps): React.ReactElement => {
  const id = useId();
  const [draft, setDraft] = useState("");
  const selected = new Set(value);
  const custom = value.filter((area) => !SUGGESTED_FOCUS_AREAS.includes(area));

  const toggle = (area: string): void => {
    onChange(selected.has(area) ? value.filter((a) => a !== area) : [...value, area]);
  };

  const addDraft = (): void => {
    const area = draft.split(/\s+/).join(" ").trim();
    if (area && !selected.has(area)) onChange([...value, area]);
    setDraft("");
  };

  return (
    <section style={SECTION_STYLE} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={SECTION_TITLE_STYLE}>
        Focus Areas
      </h2>
      <div style={{ ...HINT_STYLE, marginBottom: 8 }}>
        Things the model must check explicitly, on top of the review intent.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {[...SUGGESTED_FOCUS_AREAS, ...custom].map((area) => {
          const isOn = selected.has(area);
          return (
            <button
              key={area}
              type="button"
              aria-pressed={isOn}
              onClick={() => {
                toggle(area);
              }}
              style={toggleChipStyle(isOn)}
            >
              {area}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <label htmlFor={`${id}-new`} className="sr-only">
          Add a focus area
        </label>
        <input
          id={`${id}-new`}
          className="field"
          value={draft}
          maxLength={MAX_FOCUS_AREA_CHARS}
          placeholder="Add your own, e.g. Feature flags cleaned up"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addDraft();
            }
          }}
        />
        <button
          type="button"
          className="btn"
          style={{ padding: "4px 10px" }}
          disabled={!draft.trim()}
          onClick={addDraft}
        >
          Add
        </button>
      </div>
    </section>
  );
};
