import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn, useReturnFocus } from "@shared/lib";
import { IconButton } from "../button";
import { ICON_SIZE } from "../ICON_SIZE";

const DEFAULT_WIDTH_PX = 360;

export type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Next to the title, before the close button: a CountBadge, a filter. */
  headerExtra?: React.ReactNode;
  width?: number;
  side?: "right" | "left";
  /** Focused on open instead of the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** A bar under the content: actions on the whole list. */
  footer?: React.ReactNode;
  /** The body; it fills the height and scrolls itself. */
  children: React.ReactNode;
};

/**
 * A modal panel sliding in from the side (history, iterations). Its content exists only
 * while open, so nothing in it is focusable or announced when closed; Esc and the overlay
 * close it, focus is trapped inside and goes back on close.
 */
export const Drawer = ({
  isOpen,
  onClose,
  title,
  headerExtra,
  width = DEFAULT_WIDTH_PX,
  side = "right",
  initialFocusRef,
  footer,
  children,
}: DrawerProps): React.ReactElement => {
  // Opened from a store flag, not a Dialog.Trigger: focus goes back to what had it.
  const handleCloseAutoFocus = useReturnFocus(isOpen);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay ui-overlay--drawer" />
        <DialogPrimitive.Content
          className={cn("ui-drawer", `ui-drawer--${side}`)}
          style={{ width }}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className="ui-drawer__header">
            <DialogPrimitive.Title className="ui-drawer__title">{title}</DialogPrimitive.Title>
            {headerExtra}
            <DialogPrimitive.Close asChild>
              <IconButton
                label="Close"
                shortcut="Esc"
                tooltipSide="left"
                icon={<X size={ICON_SIZE.button} aria-hidden="true" />}
              />
            </DialogPrimitive.Close>
          </div>
          <div className="ui-drawer__body">{children}</div>
          {footer !== undefined && <div className="ui-drawer__footer">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
