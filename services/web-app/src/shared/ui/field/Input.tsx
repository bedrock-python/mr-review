import { cn } from "@shared/lib";
import { useFieldControl } from "./fieldContext";

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** 24px (sm) or 30px (md). */
  size?: "sm" | "md";
  /** Monospace, for URLs, tokens, model ids, paths. */
  isMono?: boolean;
  /** Marks the control invalid outside a Field (inside one, the Field's error does it). */
  isInvalid?: boolean;
  /** An icon at the start (a search glass); the box then draws the border and focus. */
  leadingIcon?: React.ReactNode;
  /** Content at the end inside the box: a spinner, a clear button, a unit. */
  trailing?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
};

/** A single-line text control. Inside a Field it is labelled and described automatically. */
export const Input = ({
  size = "md",
  isMono = false,
  isInvalid,
  leadingIcon,
  trailing,
  className,
  style,
  ref,
  ...rest
}: InputProps): React.ReactElement => {
  const control = useFieldControl(rest, isInvalid);
  const hasShell = leadingIcon !== undefined || trailing !== undefined;

  if (!hasShell) {
    return (
      <input
        {...rest}
        {...control}
        ref={ref}
        className={cn(
          "ui-input",
          size === "sm" && "ui-input--sm",
          isMono && "ui-input--mono",
          className
        )}
        style={style}
      />
    );
  }

  return (
    <span
      className={cn("ui-input-shell", size === "sm" && "ui-input-shell--sm", className)}
      data-invalid={control["aria-invalid"] === true || undefined}
      data-disabled={rest.disabled === true || undefined}
      style={style}
    >
      {leadingIcon !== undefined && (
        <span className="ui-input-shell__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input
        {...rest}
        {...control}
        ref={ref}
        style={isMono ? { fontFamily: "var(--font-mono)" } : undefined}
      />
      {trailing}
    </span>
  );
};
