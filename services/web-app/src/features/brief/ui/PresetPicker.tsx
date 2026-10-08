import { Bookmark, Gauge, ListChecks, PenLine, ShieldCheck } from "lucide-react";
import { ICON_SIZE, SelectCardGroup } from "@shared/ui";
import { BUILTIN_PRESET_CARDS } from "../lib";
import type { BriefPreset } from "@entities/review";
import type { ReviewPreset } from "@entities/review-preset";
import type { SelectCardOption } from "@shared/ui";

const iconProps = { size: ICON_SIZE.inline, "aria-hidden": true, className: "text-fg-2" } as const;

const BUILTIN_ICONS: Record<BriefPreset, React.ReactNode> = {
  thorough: <ListChecks {...iconProps} />,
  security: <ShieldCheck {...iconProps} />,
  style: <PenLine {...iconProps} />,
  performance: <Gauge {...iconProps} />,
};

const BUILTIN_OPTIONS: SelectCardOption<BriefPreset>[] = BUILTIN_PRESET_CARDS.map((card) => ({
  value: card.id,
  title: card.label,
  description: card.description,
  icon: BUILTIN_ICONS[card.id],
}));

// Two cards a row: four built-in presets read as a 2×2 block at every stage width.
const GRID_CLASS = "grid-cols-2";

export type PresetPickerProps = {
  presets: ReviewPreset[] | undefined;
  /** The built-in preset in use, or null while a saved one is. */
  builtinSelected: BriefPreset | null;
  savedSelectedId: string | null;
  onSelectBuiltin: (preset: BriefPreset) => void;
  onSelectSaved: (preset: ReviewPreset) => void;
};

/** The built-in presets and the saved ones, as two groups of cards sharing one choice. */
export const PresetPicker = ({
  presets,
  builtinSelected,
  savedSelectedId,
  onSelectBuiltin,
  onSelectSaved,
}: PresetPickerProps): React.ReactElement => {
  const saved = presets ?? [];
  const savedOptions: SelectCardOption<string>[] = saved.map((preset) => ({
    value: preset.id,
    title: preset.name,
    description: preset.description || "No description",
    icon: <Bookmark {...iconProps} />,
  }));

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <SelectCardGroup
        aria-label="Built-in presets"
        options={BUILTIN_OPTIONS}
        value={builtinSelected ?? undefined}
        onValueChange={onSelectBuiltin}
        className={GRID_CLASS}
      />
      {saved.length > 0 && (
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <span className="text-fg-2" style={{ fontSize: "var(--fs-meta)" }}>
            Saved presets
          </span>
          <SelectCardGroup
            aria-label="Saved presets"
            options={savedOptions}
            value={savedSelectedId ?? undefined}
            onValueChange={(id) => {
              const preset = saved.find((candidate) => candidate.id === id);
              if (preset) onSelectSaved(preset);
            }}
            className={GRID_CLASS}
          />
        </div>
      )}
    </div>
  );
};
