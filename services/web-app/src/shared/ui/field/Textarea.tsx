import { cn } from "@shared/lib";
import { useFieldControl } from "./fieldContext";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Monospace, for JSON, prompts, code. */
  isMono?: boolean;
  isInvalid?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
};

/** A multi-line text control, resizable vertically. */
export const Textarea = ({
  isMono = false,
  isInvalid,
  className,
  rows = 4,
  ref,
  ...rest
}: TextareaProps): React.ReactElement => {
  const control = useFieldControl(rest, isInvalid);
  return (
    <textarea
      {...rest}
      {...control}
      ref={ref}
      rows={rows}
      className={cn("ui-textarea", isMono && "ui-textarea--mono", className)}
    />
  );
};
