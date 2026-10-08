import { cn } from "@shared/lib";

export type CheckboxGroupProps = {
  /** What the checkboxes choose between, drawn as the eyebrow (a fieldset legend). */
  legend: React.ReactNode;
  isLegendHidden?: boolean;
  /** vertical: one per line; horizontal: a row that wraps. */
  orientation?: "vertical" | "horizontal";
  isDisabled?: boolean;
  className?: string;
  /** Checkbox elements, each with its own state. */
  children: React.ReactNode;
};

/**
 * Checkboxes that answer one question ("Include: hosts, providers, reviews"): a fieldset whose
 * legend names them as a group, laid out like RadioGroup.
 */
export const CheckboxGroup = ({
  legend,
  isLegendHidden = false,
  orientation = "vertical",
  isDisabled = false,
  className,
  children,
}: CheckboxGroupProps): React.ReactElement => (
  <fieldset
    className={cn(
      "ui-radio-group",
      orientation === "horizontal" && "ui-radio-group--row",
      className
    )}
    disabled={isDisabled}
  >
    <legend className={cn("ui-eyebrow", isLegendHidden && "ui-visually-hidden")}>{legend}</legend>
    {children}
  </fieldset>
);
