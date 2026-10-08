import { Gauge, ListChecks, PenLine, ShieldCheck } from "lucide-react";
import { ICON_SIZE, SelectCardGroup } from "@shared/ui";
import { BUILTIN_PRESET_CARDS } from "../lib";
import type { BriefPreset } from "@entities/review";
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

export type PresetPickerProps = {
  /** The built-in preset in use, or null while a saved one is. */
  selected: BriefPreset | null;
  onSelect: (preset: BriefPreset) => void;
};

/**
 * The built-in presets as cards. Picking one only changes the instructions, nothing else in
 * the brief, so the arrow keys may move the choice (a radio group).
 */
export const PresetPicker = ({ selected, onSelect }: PresetPickerProps): React.ReactElement => (
  <SelectCardGroup
    aria-label="Built-in presets"
    options={BUILTIN_OPTIONS}
    value={selected ?? undefined}
    onValueChange={onSelect}
    // Two cards a row: four presets read as a 2×2 block at every stage width.
    className="grid-cols-2"
  />
);
