import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { ChoiceLabel } from "./ChoiceLabel";
import { assignRef } from "./assignRef";
import { useChoiceIds } from "./useChoiceIds";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label: React.ReactNode;
  /** A second line under the label, tied to the box with aria-describedby. */
  description?: React.ReactNode;
  /** The label is read but not drawn. */
  isLabelHidden?: boolean;
  /** "Some of them": a dash, read as mixed. */
  isIndeterminate?: boolean;
  isInvalid?: boolean;
  /** Called with the new state; `onChange` still gets the event. */
  onCheckedChange?: (checked: boolean) => void;
  ref?: React.Ref<HTMLInputElement>;
};

/** A native checkbox, drawn in the theme, with its label. */
export const Checkbox = ({
  label,
  description,
  isLabelHidden = false,
  isIndeterminate = false,
  isInvalid,
  onCheckedChange,
  onChange,
  className,
  style,
  ref,
  ...rest
}: CheckboxProps): React.ReactElement => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ids = useChoiceIds(description, rest["aria-labelledby"], rest["aria-describedby"]);

  // `indeterminate` exists only as a DOM property.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };

  return (
    <ChoiceLabel
      label={label}
      labelId={ids.labelId}
      description={ids.hasDescription ? description : undefined}
      descriptionId={ids.descriptionId}
      isLabelHidden={isLabelHidden}
      isDisabled={rest.disabled === true}
      className={className}
      style={style}
    >
      <span className="ui-choice__control">
        <input
          {...rest}
          {...ids.aria}
          ref={(node) => {
            inputRef.current = node;
            assignRef(ref, node);
          }}
          type="checkbox"
          aria-invalid={isInvalid === true ? true : undefined}
          onChange={handleChange}
        />
        <span className="ui-choice__mark" aria-hidden="true">
          {isIndeterminate ? (
            <Minus size={12} strokeWidth={3} />
          ) : (
            <Check size={12} strokeWidth={3} />
          )}
        </span>
      </span>
    </ChoiceLabel>
  );
};
