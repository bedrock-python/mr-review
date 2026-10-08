import { createContext, useContext } from "react";
import { joinIds } from "@shared/lib";

export type FieldContextValue = {
  /** Id of the control: the label's htmlFor points at it. */
  id: string;
  /** Ids of the hint and error, for the control's aria-describedby. */
  describedBy: string | undefined;
  isInvalid: boolean;
  isRequired: boolean;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

export type FieldControlProps = {
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  required?: boolean | undefined;
};

/**
 * The id and ARIA wiring a control gets from the Field around it, merged with its own props
 * (its own win). Outside a Field it returns the props as they are.
 */
export const useFieldControl = (
  props: FieldControlProps,
  isInvalid: boolean | undefined
): FieldControlProps => {
  const field = useContext(FieldContext);
  const invalid = isInvalid ?? field?.isInvalid ?? false;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": joinIds(props["aria-describedby"], field?.describedBy),
    "aria-invalid": props["aria-invalid"] ?? (invalid ? true : undefined),
    required: props.required ?? (field?.isRequired === true ? true : undefined),
  };
};
