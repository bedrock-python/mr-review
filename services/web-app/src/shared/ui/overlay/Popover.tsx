import { useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@shared/lib";
import { nextTabbableAfter, tabbablesIn } from "./tabbable";

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

/** Where focus goes once the panel closes. */
type CloseFocus = "trigger" | "after-trigger";

/**
 * A small non-modal panel under its trigger, for a few controls that do not fit in a row.
 * Focus moves in when it opens and back to the trigger when it closes; Esc and a press outside
 * close it. Tab moves through its controls and, past the last one, closes it and goes on to
 * what follows the trigger — as if the panel sat right after it in the page (it is portalled
 * to the end of the body). Shift+Tab before the first one closes it onto the trigger.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeFocusRef = useRef<CloseFocus>("trigger");
  const [ownIsOpen, setOwnIsOpen] = useState(false);
  const open = isOpen ?? ownIsOpen;

  const setOpen = (next: boolean): void => {
    if (next) closeFocusRef.current = "trigger";
    if (isOpen === undefined) setOwnIsOpen(next);
    onOpenChange?.(next);
  };

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const panel = panelRef.current;
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !panel) return;
    const stops = tabbablesIn(panel);
    const index = stops.findIndex((stop) => stop.contains(document.activeElement));
    const isLeaving = event.shiftKey ? index <= 0 : index === -1 || index === stops.length - 1;
    if (!isLeaving) return;
    event.preventDefault();
    event.stopPropagation();
    closeFocusRef.current = event.shiftKey ? "trigger" : "after-trigger";
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild ref={triggerRef}>
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={panelRef}
          align={align}
          sideOffset={SIDE_OFFSET_PX}
          collisionPadding={COLLISION_PADDING_PX}
          aria-label={ariaLabel}
          onKeyDownCapture={handleKeyDownCapture}
          onOpenAutoFocus={(event) => {
            const panel = panelRef.current;
            const target = panel && getInitialFocus ? getInitialFocus(panel) : null;
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
          onCloseAutoFocus={(event) => {
            const trigger = triggerRef.current;
            if (closeFocusRef.current !== "after-trigger" || trigger === null) return;
            closeFocusRef.current = "trigger";
            const next = nextTabbableAfter(trigger, panelRef.current);
            if (next === null) return;
            event.preventDefault();
            next.focus();
          }}
          className={cn("ui-popover", className)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
