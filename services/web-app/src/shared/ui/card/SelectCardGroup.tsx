import { cn, useRovingRadioGroup } from "@shared/lib";
import { SelectCard } from "./SelectCard";
import type { RovingRadioActivation } from "@shared/lib";
import type { SelectCardOption } from "./SelectCard";

const DEFAULT_MIN_CARD_WIDTH_PX = 180;

export type SelectCardGroupProps<T extends string> = {
  options: readonly SelectCardOption<T>[];
  value: T | undefined;
  onValueChange: (value: T) => void;
  /** Name of the group; or point `aria-labelledby` at a visible heading. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Cards wrap into as many columns of at least this width as fit. */
  minCardWidth?: number;
  /**
   * A fixed number of equal columns instead, e.g. 2 for four presets that must read as a 2×2
   * block at every width (auto-fill would lay them out 3 + 1).
   */
  columns?: number;
  /** "manual" when choosing is costly or hard to undo: arrows only move, Space/Enter choose. */
  activation?: RovingRadioActivation;
  className?: string;
};

/**
 * A single choice shown as cards: presets, providers, themes. A radio group: one tab stop,
 * arrow keys move and select.
 */
export const SelectCardGroup = <T extends string>({
  options,
  value,
  onValueChange,
  minCardWidth = DEFAULT_MIN_CARD_WIDTH_PX,
  columns,
  activation = "automatic",
  className,
  ...aria
}: SelectCardGroupProps<T>): React.ReactElement => {
  // The cards wrap into a grid, so both arrow pairs move through them.
  const { getItemProps } = useRovingRadioGroup({
    items: options,
    value,
    onValueChange,
    orientation: "both",
    activation,
  });
  const style: React.CSSProperties =
    columns === undefined
      ? ({ "--select-card-min": `${String(minCardWidth)}px` } as React.CSSProperties)
      : { gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` };
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn("ui-select-card-group", className)}
      style={style}
    >
      {options.map((option) => (
        <SelectCard key={option.value} option={option} radioProps={getItemProps(option)} />
      ))}
    </div>
  );
};
