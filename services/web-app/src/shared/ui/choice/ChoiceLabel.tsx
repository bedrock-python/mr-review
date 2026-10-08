import { cn } from "@shared/lib";

export type ChoiceLabelProps = {
  label: React.ReactNode;
  labelId: string;
  description: React.ReactNode;
  descriptionId: string;
  isLabelHidden: boolean;
  isDisabled: boolean;
  className: string | undefined;
  style: React.CSSProperties | undefined;
  /** The control: the input and its drawn mark. */
  children: React.ReactNode;
};

/**
 * The <label> around a checkbox, radio or switch: clicking the text toggles the control.
 * The control is named by the label text alone (aria-labelledby) and described by the
 * description, so the description is not read twice.
 */
export const ChoiceLabel = ({
  label,
  labelId,
  description,
  descriptionId,
  isLabelHidden,
  isDisabled,
  className,
  style,
  children,
}: ChoiceLabelProps): React.ReactElement => (
  <label
    className={cn("ui-choice", className)}
    data-disabled={isDisabled || undefined}
    style={style}
  >
    {children}
    <span className={cn("ui-choice__text", isLabelHidden && "ui-visually-hidden")}>
      <span id={labelId} className="ui-choice__label">
        {label}
      </span>
      {description !== undefined && (
        <span id={descriptionId} className="ui-choice__description">
          {description}
        </span>
      )}
    </span>
  </label>
);
