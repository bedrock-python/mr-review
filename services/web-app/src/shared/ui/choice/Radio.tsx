import { useContext } from "react";
import { ChoiceLabel } from "./ChoiceLabel";
import { RadioGroupContext } from "./radioGroupContext";
import { useChoiceIds } from "./useChoiceIds";

export type RadioProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "value"
> & {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  isLabelHidden?: boolean;
  ref?: React.Ref<HTMLInputElement>;
};

/**
 * A native radio. Inside a RadioGroup it takes the group's name, checked state and change
 * handler; arrow keys move between radios of a name, as the browser does.
 */
export const Radio = ({
  value,
  label,
  description,
  isLabelHidden = false,
  onChange,
  className,
  style,
  ref,
  ...rest
}: RadioProps): React.ReactElement => {
  const group = useContext(RadioGroupContext);
  const ids = useChoiceIds(description, rest["aria-labelledby"], rest["aria-describedby"]);
  const isDisabled = rest.disabled === true || group?.isDisabled === true;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange?.(event);
    if (event.target.checked) group?.onValueChange?.(value);
  };

  return (
    <ChoiceLabel
      label={label}
      labelId={ids.labelId}
      description={ids.hasDescription ? description : undefined}
      descriptionId={ids.descriptionId}
      isLabelHidden={isLabelHidden}
      isDisabled={isDisabled}
      className={className}
      style={style}
    >
      <span className="ui-choice__control">
        <input
          {...(group === null
            ? {}
            : { name: group.name, checked: group.value === value, disabled: isDisabled })}
          {...rest}
          {...ids.aria}
          ref={ref}
          type="radio"
          value={value}
          onChange={handleChange}
        />
        <span className="ui-choice__mark" aria-hidden="true">
          <span className="ui-choice__dot" />
        </span>
      </span>
    </ChoiceLabel>
  );
};
