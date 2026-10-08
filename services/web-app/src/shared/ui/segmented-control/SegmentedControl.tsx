import { cn, useRovingRadioGroup } from "@shared/lib";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
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
  /** 24px (sm) or 30px (md). */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Two to five mutually exclusive views or filters in one pill: List / Pinned / Thread,
 * Kept / Dismissed / All. A radio group: one tab stop, arrows move and select.
 */
export const SegmentedControl = <T extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  className,
  ...aria
}: SegmentedControlProps<T>): React.ReactElement => {
  const { getItemProps } = useRovingRadioGroup({ items: options, value, onValueChange });
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn("ui-segmented", size === "sm" && "ui-segmented--sm", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          {...getItemProps(option)}
          title={option.title}
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
