import { useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@shared/lib";

const SIDE_OFFSET_PX = 4;
const COLLISION_PADDING_PX = 8;

export type PopoverProps = {
  /** The button that opens it; it receives the trigger props and the ref. */
  trigger: React.ReactElement;
  /** Names the panel (it is a non-modal dialog). */
  "aria-label": string;
  /** Controlled; leave both out for a popover that keeps its own state. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  align?: "start" | "center" | "end";
  /**
   * What gets focus when it opens: its first control by default, or the element this returns
   * (the checked radio of a filter, so the arrow keys work at once).
   */
  getInitialFocus?: (panel: HTMLElement) => HTMLElement | null;
  className?: string;
  children: React.ReactNode;
};

/**
 * A small non-modal panel under its trigger, for a few controls that do not fit in a row.
 * Focus moves in when it opens and back to the trigger when it closes; Esc, a press outside
 * and Tab away close it.
 */
export const Popover = ({
  trigger,
  "aria-label": ariaLabel,
  isOpen,
  onOpenChange,
  align = "start",
  getInitialFocus,
  className,
  children,
}: PopoverProps): React.ReactElement => {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <PopoverPrimitive.Root
      {...(isOpen === undefined ? {} : { open: isOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={panelRef}
          align={align}
          sideOffset={SIDE_OFFSET_PX}
          collisionPadding={COLLISION_PADDING_PX}
          aria-label={ariaLabel}
          onOpenAutoFocus={(event) => {
            const panel = panelRef.current;
            const target = panel && getInitialFocus ? getInitialFocus(panel) : null;
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
          className={cn("ui-popover", className)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
