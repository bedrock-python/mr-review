import { cn } from "@shared/lib";
import { toneAttribute } from "./tone";
import type { Tone } from "./tone";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** On/off state: sets aria-pressed. Leave undefined for a chip that is just a button. */
  isSelected?: boolean;
  /** Called with the next state on click. `onClick` still runs. */
  onSelectedChange?: (isSelected: boolean) => void;
  /** Colour of the dot and of the selected state; accent when omitted. */
  tone?: Tone;
  hasDot?: boolean;
  /** A count after the label, in mono. */
  count?: number;
  icon?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
};

/** A pill-shaped toggle for filters: "Assigned", "critical 3", "Draft". */
export const Chip = ({
  isSelected,
  onSelectedChange,
  tone = "neutral",
  hasDot = false,
  count,
  icon,
  className,
  children,
  onClick,
  ref,
  ...rest
}: ChipProps): React.ReactElement => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);
    if (isSelected !== undefined) onSelectedChange?.(!isSelected);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-pressed={isSelected}
      className={cn("ui-chip", className)}
      data-tone={toneAttribute(tone)}
      onClick={handleClick}
    >
      {icon}
      {icon === undefined && hasDot && <span className="ui-chip__dot" aria-hidden="true" />}
      {children}
      {/* The space is for the accessible name ("critical 3"); flex layout drops it. */}
      {count !== undefined && " "}
      {count !== undefined && <span className="ui-chip__count">{count}</span>}
    </button>
  );
};
