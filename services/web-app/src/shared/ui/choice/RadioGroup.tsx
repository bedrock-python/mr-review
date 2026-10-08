import { useId, useMemo } from "react";
import { cn } from "@shared/lib";
import { RadioGroupContext } from "./radioGroupContext";
import type { RadioGroupContextValue } from "./radioGroupContext";

export type RadioGroupProps = {
  /** The question the radios answer, drawn as the eyebrow (a fieldset legend). */
  legend: React.ReactNode;
  isLegendHidden?: boolean;
  /** Shared `name` of the radios; generated when omitted. */
  name?: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  orientation?: "vertical" | "horizontal";
  isDisabled?: boolean;
  className?: string;
  /** Radio elements. */
  children: React.ReactNode;
};

/** A fieldset of native radios: one name, one value, a legend that names the group. */
export const RadioGroup = ({
  legend,
  isLegendHidden = false,
  name,
  value,
  onValueChange,
  orientation = "vertical",
  isDisabled = false,
  className,
  children,
}: RadioGroupProps): React.ReactElement => {
  const generatedName = useId();
  const context = useMemo(
    (): RadioGroupContextValue => ({
      name: name ?? generatedName,
      value,
      onValueChange,
      isDisabled,
    }),
    [name, generatedName, value, onValueChange, isDisabled]
  );

  return (
    <fieldset
      className={cn(
        "ui-radio-group",
        orientation === "horizontal" && "ui-radio-group--row",
        className
      )}
      disabled={isDisabled}
    >
      <legend className={cn("ui-eyebrow", isLegendHidden && "ui-visually-hidden")}>{legend}</legend>
      <RadioGroupContext.Provider value={context}>{children}</RadioGroupContext.Provider>
    </fieldset>
  );
};
