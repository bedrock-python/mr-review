import { ChoiceLabel } from "./ChoiceLabel";
import { useChoiceIds } from "./useChoiceIds";

export type SwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "role"
> & {
  label: React.ReactNode;
  description?: React.ReactNode;
  isLabelHidden?: boolean;
  /** Called with the new state; `onChange` still gets the event. */
  onCheckedChange?: (checked: boolean) => void;
  ref?: React.Ref<HTMLInputElement>;
};

/**
 * An on/off setting that applies at once. A checkbox with role="switch": it works in forms
 * and with `register`, and is read as "on" / "off".
 */
export const Switch = ({
  label,
  description,
  isLabelHidden = false,
  onCheckedChange,
  onChange,
  className,
  style,
  ref,
  ...rest
}: SwitchProps): React.ReactElement => {
  const ids = useChoiceIds(description, rest["aria-labelledby"], rest["aria-describedby"]);

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
      <span className="ui-choice__control ui-switch__control">
        <input
          {...rest}
          {...ids.aria}
          ref={ref}
          type="checkbox"
          role="switch"
          onChange={handleChange}
        />
        <span className="ui-switch__thumb" aria-hidden="true" />
      </span>
    </ChoiceLabel>
  );
};
