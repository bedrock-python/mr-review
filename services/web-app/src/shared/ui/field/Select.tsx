import { ChevronDown } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE } from "../ICON_SIZE";
import { useFieldControl } from "./fieldContext";

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "md";
  isInvalid?: boolean;
  /**
   * Fills its container (the default, right in a Field). `false` in a row of controls (a
   * toolbar): as wide as its longest option.
   */
  isFullWidth?: boolean;
  /** <option> elements. A native select keeps keyboard and screen-reader behaviour for free. */
  children: React.ReactNode;
  ref?: React.Ref<HTMLSelectElement>;
};

/** A native select with the app's box and chevron. */
export const Select = ({
  size = "md",
  isInvalid,
  isFullWidth = true,
  className,
  style,
  children,
  ref,
  ...rest
}: SelectProps): React.ReactElement => {
  const control = useFieldControl(rest, isInvalid);
  return (
    <span
      className={cn("ui-select-shell", !isFullWidth && "ui-select-shell--auto", className)}
      style={style}
    >
      <select
        {...rest}
        {...control}
        ref={ref}
        className={cn("ui-select", size === "sm" && "ui-select--sm")}
      >
        {children}
      </select>
      <ChevronDown
        className="ui-select-shell__chevron"
        size={ICON_SIZE.inline}
        aria-hidden="true"
      />
    </span>
  );
};
