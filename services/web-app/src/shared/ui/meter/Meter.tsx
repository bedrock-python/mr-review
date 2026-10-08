import { cn } from "@shared/lib";
import { toneAttribute } from "../badge/tone";
import type { Tone } from "../badge/tone";

const PERCENT = 100;

export type MeterProps = {
  /** Names the meter: "Prompt budget used". */
  label: string;
  value: number;
  /** The whole; the bar is full at it, and a larger value is drawn full. */
  max: number;
  /** Read instead of the number ("42% of the budget"); shown on the right when `isValueShown`. */
  valueText?: string;
  /** A line of context on the left above the bar: "12,345 of 120,000 characters". */
  caption?: React.ReactNode;
  isValueShown?: boolean;
  /** accent while things are fine; warn or danger once something gave way. */
  tone?: Extract<Tone, "accent" | "warn" | "danger" | "success" | "info">;
  className?: string;
};

/**
 * How much of a whole is used, as a thin bar (`role="meter"`), with an optional caption and
 * value above it. Not for progress over time — that is a Spinner or a progress bar.
 */
export const Meter = ({
  label,
  value,
  max,
  valueText,
  caption,
  isValueShown = false,
  tone = "accent",
  className,
}: MeterProps): React.ReactElement => {
  const share = max > 0 ? Math.min(Math.max(value, 0) / max, 1) : 0;
  const hasHead = caption !== undefined || (isValueShown && valueText !== undefined);
  return (
    <div className={cn("ui-meter", className)} data-tone={toneAttribute(tone)}>
      {hasHead && (
        <div className="ui-meter__head">
          <span className="ui-meter__caption">{caption}</span>
          {isValueShown && valueText !== undefined && (
            <span className="ui-meter__value" aria-hidden="true">
              {valueText}
            </span>
          )}
        </div>
      )}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={valueText}
        className="ui-meter__track"
      >
        <div
          className="ui-meter__bar"
          style={{
            width: value > 0 ? `max(${String(share * PERCENT)}%, var(--space-1))` : 0,
          }}
        />
      </div>
    </div>
  );
};
