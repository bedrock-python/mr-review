import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Chip, Field, ICON_SIZE, Input } from "@shared/ui";
import { BriefSection } from "./BriefSection";

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
    <BriefSection
      title="Focus areas"
      description="Things the model must check explicitly, on top of the review intent."
    >
      <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
        {[...SUGGESTED_FOCUS_AREAS, ...custom].map((area) => (
          <Chip
            key={area}
            isSelected={selected.has(area)}
            onSelectedChange={() => {
              toggle(area);
            }}
          >
            {area}
          </Chip>
        ))}
      </div>
      <div
        className="flex items-start"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}
      >
        <Field label="Add a focus area" isLabelHidden className="flex-1">
          <Input
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
        </Field>
        <Button
          icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
          disabled={!draft.trim()}
          onClick={addDraft}
        >
          Add
        </Button>
      </div>
    </BriefSection>
  );
};
