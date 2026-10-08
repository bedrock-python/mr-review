import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@shared/lib";

const SIDE_OFFSET_PX = 4;
const COLLISION_PADDING_PX = 8;

export type PopoverProps = {
  /** The button that opens it; it receives the trigger props and the ref. */
  trigger: React.ReactElement;
  /** Names the panel (it is a non-modal dialog). */
  "aria-label": string;
  align?: "start" | "center" | "end";
  className?: string;
  children: React.ReactNode;
};

/**
 * A small non-modal panel under its trigger, for a few controls that do not fit in a row.
 * Focus moves in when it opens and back to the trigger when it closes; Esc and a click
 * outside close it.
 */
export const Popover = ({
  trigger,
  "aria-label": ariaLabel,
  align = "start",
  className,
  children,
}: PopoverProps): React.ReactElement => (
  <PopoverPrimitive.Root>
    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={SIDE_OFFSET_PX}
        collisionPadding={COLLISION_PADDING_PX}
        aria-label={ariaLabel}
        className={cn(
          "z-(--z-popover) flex flex-col gap-3 p-3",
          "border-border-strong bg-bg-1 rounded-(--radius-card) border",
          "shadow-(--shadow-pop)",
          "data-[state=open]:animate-[ui-fade-in_var(--dur-base)_var(--ease-out)]",
          className
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
);
