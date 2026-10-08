import { useFieldControl } from "@shared/ui";

export type RangeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A native slider in the accent colour. Inside a Field it is named by the Field's label and
 * described by its hint, like the Field's text controls.
 */
export const RangeInput = ({ style, ...rest }: RangeInputProps): React.ReactElement => {
  const control = useFieldControl(rest, undefined);
  return (
    <input
      {...rest}
      {...control}
      type="range"
      style={{
        width: "100%",
        margin: 0,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    />
  );
};
