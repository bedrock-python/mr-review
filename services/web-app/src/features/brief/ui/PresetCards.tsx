import type { BriefPreset } from "@entities/review";
import type { ReviewPreset } from "@entities/review-preset";
import { BUILTIN_PRESET_CARDS } from "../lib";

const cardStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
  background: isSelected ? "color-mix(in oklch, var(--accent) 10%, var(--bg-2))" : "var(--bg-2)",
  boxShadow: isSelected
    ? "0 0 0 1px var(--accent), 0 2px 12px color-mix(in oklch, var(--accent) 15%, transparent)"
    : "none",
  textAlign: "left",
  cursor: "pointer",
  transition: "all 0.08s",
});

type PresetCardProps = {
  label: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
};

const PresetCard = ({
  label,
  description,
  isSelected,
  onSelect,
}: PresetCardProps): React.ReactElement => (
  <button type="button" aria-pressed={isSelected} onClick={onSelect} style={cardStyle(isSelected)}>
    <span
      className="mono"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: isSelected ? "var(--accent)" : "var(--fg-2)",
      }}
    >
      {label}
    </span>
    {description && (
      <span
        style={{ fontSize: 11, color: isSelected ? "var(--fg-1)" : "var(--fg-3)", lineHeight: 1.4 }}
      >
        {description}
      </span>
    )}
  </button>
);

export type BuiltinPresetGridProps = {
  selected: BriefPreset | null;
  onSelect: (preset: BriefPreset) => void;
};

export const BuiltinPresetGrid = ({
  selected,
  onSelect,
}: BuiltinPresetGridProps): React.ReactElement => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    {BUILTIN_PRESET_CARDS.map((card) => (
      <PresetCard
        key={card.id}
        label={card.label}
        description={card.description}
        isSelected={selected === card.id}
        onSelect={() => {
          onSelect(card.id);
        }}
      />
    ))}
  </div>
);

export type SavedPresetListProps = {
  presets: ReviewPreset[];
  selectedId: string | null;
  confirmingDeleteId: string | null;
  onSelect: (preset: ReviewPreset) => void;
  onEdit: (preset: ReviewPreset) => void;
  onDelete: (preset: ReviewPreset) => void;
};

export const SavedPresetList = ({
  presets,
  selectedId,
  confirmingDeleteId,
  onSelect,
  onEdit,
  onDelete,
}: SavedPresetListProps): React.ReactElement => (
  <ul
    style={{
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    {presets.map((preset) => (
      <li key={preset.id} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PresetCard
            label={preset.name.toUpperCase()}
            description={preset.description}
            isSelected={selectedId === preset.id}
            onSelect={() => {
              onSelect(preset);
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "3px 8px", fontSize: 11 }}
            aria-label={`Edit preset ${preset.name}`}
            onClick={() => {
              onEdit(preset);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{
              padding: "3px 8px",
              fontSize: 11,
              color: confirmingDeleteId === preset.id ? "var(--c-critical)" : undefined,
            }}
            aria-label={
              confirmingDeleteId === preset.id
                ? `Confirm deleting preset ${preset.name}`
                : `Delete preset ${preset.name}`
            }
            onClick={() => {
              onDelete(preset);
            }}
          >
            {confirmingDeleteId === preset.id ? "Confirm" : "Delete"}
          </button>
        </div>
      </li>
    ))}
  </ul>
);
