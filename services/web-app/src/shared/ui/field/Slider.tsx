import { cn } from "@shared/lib";
import { useFieldControl } from "./fieldContext";

export type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /**
   * No value is set (the default applies): the thumb sits where it is told, but the slider is
   * drawn neutral instead of in the accent, so it does not read as a chosen value.
   */
  isUnset?: boolean;
  ref?: React.Ref<HTMLInputElement>;
};

/**
 * A native range input in the accent colour. Inside a Field it is named by the Field's label
 * and described by its hint, like the text controls; put the current value in `labelAside`.
 */
export const Slider = ({
  isUnset = false,
  className,
  ref,
  ...rest
}: SliderProps): React.ReactElement => {
  const control = useFieldControl(rest, undefined);
  return (
    <input
      {...rest}
      {...control}
      ref={ref}
      type="range"
      data-unset={isUnset || undefined}
      className={cn("ui-slider", className)}
    />
  );
};
