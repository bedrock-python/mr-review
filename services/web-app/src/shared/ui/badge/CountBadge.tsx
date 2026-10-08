import { cn } from "@shared/lib";
import { toneAttribute } from "./tone";
import type { Tone } from "./tone";

const DEFAULT_MAX = 99;

export type CountBadgeProps = {
  count: number;
  /** Above this, shows "99+". */
  max?: number;
  tone?: Tone;
  /** What is counted, read instead of the bare number: "3 iterations". */
  label?: string;
  className?: string;
};

/** A number in a pill, next to a title or a tab. */
export const CountBadge = ({
  count,
  max = DEFAULT_MAX,
  tone = "neutral",
  label,
  className,
}: CountBadgeProps): React.ReactElement => {
  const shown = count > max ? `${String(max)}+` : String(count);
  return (
    <span className={cn("ui-count", className)} data-tone={toneAttribute(tone)}>
      {label === undefined ? (
        shown
      ) : (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="ui-visually-hidden">{label}</span>
        </>
      )}
    </span>
  );
};
