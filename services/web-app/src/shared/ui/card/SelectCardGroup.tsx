import { cn, useRovingRadioGroup } from "@shared/lib";
import { SelectCard } from "./SelectCard";
import type { SelectCardOption } from "./SelectCard";

const DEFAULT_MIN_CARD_WIDTH_PX = 180;

export type SelectCardGroupProps<T extends string> = {
  options: readonly SelectCardOption<T>[];
  value: T | undefined;
  onValueChange: (value: T) => void;
  /** Name of the group; or point `aria-labelledby` at a visible heading. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Cards wrap into as many columns of at least this width as fit. */
  minCardWidth?: number;
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
  className,
  ...aria
}: SelectCardGroupProps<T>): React.ReactElement => {
  const { getItemProps } = useRovingRadioGroup({ items: options, value, onValueChange });
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn("ui-select-card-group", className)}
      style={{ "--select-card-min": `${String(minCardWidth)}px` } as React.CSSProperties}
    >
      {options.map((option) => (
        <SelectCard key={option.value} option={option} radioProps={getItemProps(option)} />
      ))}
    </div>
  );
};
