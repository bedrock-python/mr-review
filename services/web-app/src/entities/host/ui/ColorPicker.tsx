import { HOST_COLORS } from "../model/hostColors";
import type { HostColorId } from "../model/hostColors";

type ColorPickerProps = {
  value: HostColorId;
  onChange: (colorId: HostColorId) => void;
};

export const ColorPicker = ({ value, onChange }: ColorPickerProps): React.ReactElement => {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {HOST_COLORS.map((color) => {
        const isSelected = color.id === value;
        return (
          <button
            key={color.id}
            type="button"
            title={color.label}
            aria-label={color.label}
            aria-pressed={isSelected}
            onClick={() => {
              onChange(color.id);
            }}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: isSelected ? "2px solid var(--fg-0)" : "2px solid transparent",
              outline: isSelected ? "2px solid var(--bg-1)" : "none",
              outlineOffset: -3,
              background: color.value.startsWith("var(") ? "var(--fg-2)" : color.value,
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
              transition: "transform 0.08s, border-color 0.08s",
              transform: isSelected ? "scale(1.15)" : "scale(1)",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }
            }}
          />
        );
      })}
    </div>
  );
};
