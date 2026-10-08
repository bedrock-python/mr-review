import { useId, useMemo } from "react";
import { cn, joinIds } from "@shared/lib";
import { FieldContext } from "./fieldContext";
import type { FieldContextValue } from "./fieldContext";

export type FieldProps = {
  /** Shown as the eyebrow above the control and tied to it with htmlFor. */
  label: React.ReactNode;
  /** One line under the control: format, an example, what happens. */
  hint?: React.ReactNode;
  /** Replaces nothing: shown under the hint in the danger colour, marks the control invalid. */
  error?: React.ReactNode;
  /** Adds the required marker and `required` on the control. */
  isRequired?: boolean;
  /** The control's id when it must be known outside (otherwise generated). */
  id?: string;
  /** Right end of the label row: a link ("Create a token ↗"), a counter. */
  labelAside?: React.ReactNode;
  /** The label stays for assistive tech but is not drawn (a search box with an icon). */
  isLabelHidden?: boolean;
  /**
   * For what one `<label htmlFor>` cannot name — several controls, or one that is not a native
   * input (colour swatches, a checkbox under its own label, a list editor): the Field becomes
   * `role="group"` named by its label (`aria-labelledby`) and described by its hint and error.
   */
  isGroup?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * One control: Input, Textarea, Select or Slider. It picks up id, aria-describedby,
   * aria-invalid. With `isGroup`, any controls; each names itself.
   */
  children: React.ReactNode;
};

/** Label, control, hint and error, wired for assistive tech. */
export const Field = ({
  label,
  hint,
  error,
  isRequired = false,
  id,
  labelAside,
  isLabelHidden = false,
  isGroup = false,
  className,
  style,
  children,
}: FieldProps): React.ReactElement => {
  const generatedId = useId();
  const controlId = id ?? `${generatedId}-control`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const labelId = `${controlId}-label`;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";

  const context = useMemo(
    (): FieldContextValue => ({
      id: controlId,
      describedBy: joinIds(hasHint && hintId, hasError && errorId),
      isInvalid: hasError,
      isRequired,
    }),
    [controlId, hintId, errorId, hasHint, hasError, isRequired]
  );

  const required = isRequired && (
    <span className="ui-field__required" aria-hidden="true">
      *
    </span>
  );

  return (
    <div
      className={cn("ui-field", className)}
      style={style}
      {...(isGroup
        ? { role: "group", "aria-labelledby": labelId, "aria-describedby": context.describedBy }
        : {})}
    >
      <div className={cn("ui-field__label-row", isLabelHidden && "ui-visually-hidden")}>
        {isGroup ? (
          <span id={labelId} className="ui-eyebrow">
            {label}
            {required}
          </span>
        ) : (
          <label className="ui-eyebrow" htmlFor={controlId}>
            {label}
            {required}
          </label>
        )}
        {labelAside}
      </div>
      {isGroup ? (
        children
      ) : (
        <FieldContext.Provider value={context}>{children}</FieldContext.Provider>
      )}
      {hasHint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="ui-field__error">
          {error}
        </p>
      )}
    </div>
  );
};
