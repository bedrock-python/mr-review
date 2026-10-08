import { cn, useRovingRadioGroup } from "@shared/lib";
import type { RovingRadioActivation } from "@shared/lib";

export type SegmentedOption<T extends string> = {
  value: T;
  /** The visible label; may be omitted for an icon-only option that has an `aria-label`. */
  label?: React.ReactNode;
  /** The option's name when it shows only an icon ("Tree view"); also its tooltip. */
  "aria-label"?: string;
  /** A 14px icon before the label. */
  icon?: React.ReactNode;
  /** A count after the label, in mono. */
  count?: number;
  isDisabled?: boolean;
  /** Why it is disabled, or what it means. */
  title?: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Name of the choice ("View", "Status"); or `aria-labelledby` a visible label. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** A hint for the whole group: what the choice changes. */
  "aria-describedby"?: string;
  /** 24px (sm) or 30px (md). */
  size?: "sm" | "md";
  /** Spans its row, one equal part per option. */
  isFullWidth?: boolean;
  /** "manual" when choosing is costly or hard to undo: arrows only move, Space/Enter choose. */
  activation?: RovingRadioActivation;
  className?: string;
};

/**
 * Two to five mutually exclusive views or filters in one pill: List / Pinned / Thread,
 * Kept / Dismissed / All. A horizontal radio group: one tab stop, ← → (and Home/End) move and
 * select. ↑ ↓ are left to the page, so a list's own keys still work from here.
 */
export const SegmentedControl = <T extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  isFullWidth = false,
  activation = "automatic",
  className,
  ...aria
}: SegmentedControlProps<T>): React.ReactElement => {
  const { getItemProps } = useRovingRadioGroup({
    items: options,
    value,
    onValueChange,
    orientation: "horizontal",
    activation,
  });
  return (
    <div
      role="radiogroup"
      aria-orientation="horizontal"
      {...aria}
      className={cn(
        "ui-segmented",
        size === "sm" && "ui-segmented--sm",
        isFullWidth && "ui-segmented--full",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          {...getItemProps(option)}
          aria-label={option["aria-label"]}
          title={option.title ?? (option.label === undefined ? option["aria-label"] : undefined)}
          className="ui-segmented__item"
        >
          {option.icon}
          {option.label}
          {/* The space is for the accessible name ("Kept 9"); flex layout drops it. */}
          {option.count !== undefined && " "}
          {option.count !== undefined && (
            <span className="ui-segmented__count">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
};
