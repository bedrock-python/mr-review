import { useId } from "react";

import { cn } from "@shared/lib";
import { Eyebrow } from "@shared/ui";

export type FieldGroupProps = {
  /** Drawn like a Field label; it names the group. */
  label: React.ReactNode;
  /** Right end of the label row, e.g. a count. */
  labelAside?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Several controls, or one that is not a native input (colour swatches, a list editor). */
  children: React.ReactNode;
};

const labelRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

/**
 * A Field for what a single `<label htmlFor>` cannot name: the same label, hint and spacing,
 * with the label naming the controls as a group.
 */
export const FieldGroup = ({
  label,
  labelAside,
  hint,
  className,
  style,
  children,
}: FieldGroupProps): React.ReactElement => {
  const labelId = useId();
  const hintId = `${labelId}-hint`;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hasHint ? hintId : undefined}
      className={cn("ui-field", className)}
      style={style}
    >
      <div style={labelRowStyle}>
        <Eyebrow id={labelId}>{label}</Eyebrow>
        {labelAside}
      </div>
      {children}
      {hasHint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
};
