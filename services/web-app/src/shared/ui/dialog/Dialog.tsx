import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useReturnFocus } from "@shared/lib";
import { IconButton } from "../button";
import { ICON_SIZE } from "../ICON_SIZE";
import { focusFirstIn } from "./focusFirst";

const WIDTH_PX = { sm: 400, md: 480, lg: 580 } as const;

export type DialogProps = {
  isOpen: boolean;
  /** Esc, the overlay, the close button: every way out calls this. */
  onClose: () => void;
  title: React.ReactNode;
  /** One or two sentences under the title; it becomes the dialog's description. */
  description?: React.ReactNode;
  /** 400, 480 or 580px; `width` overrides. */
  size?: keyof typeof WIDTH_PX;
  width?: number;
  /** The action row at the bottom, right-aligned: Cancel, then the primary action. */
  footer?: React.ReactNode;
  hasCloseButton?: boolean;
  /** Off when the caller moves focus itself after closing. */
  shouldRestoreFocus?: boolean;
  /** Focused on open; otherwise the first control of the body, then of the footer. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
};

/**
 * A modal dialog on Radix: focus trapped inside, Esc and the overlay close it, focus goes
 * back to where it was. Open it from state; no trigger element is needed.
 */
export const Dialog = ({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  width,
  footer,
  hasCloseButton = true,
  shouldRestoreFocus = true,
  initialFocusRef,
  children,
}: DialogProps): React.ReactElement => {
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const returnFocus = useReturnFocus(isOpen);
  const hasDescription = description !== undefined && description !== null;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay" />
        <DialogPrimitive.Content
          ref={contentRef}
          className="ui-dialog"
          style={{ width: width ?? WIDTH_PX[size] }}
          {...(hasDescription ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (initialFocusRef?.current) {
              initialFocusRef.current.focus();
              return;
            }
            if (!focusFirstIn(bodyRef.current, footerRef.current)) contentRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (shouldRestoreFocus) returnFocus(event);
            else event.preventDefault();
          }}
        >
          <div className="ui-dialog__header">
            <div className="ui-dialog__titles">
              <DialogPrimitive.Title className="ui-dialog__title">{title}</DialogPrimitive.Title>
              {hasDescription && (
                <DialogPrimitive.Description className="ui-dialog__description">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {hasCloseButton && (
              <DialogPrimitive.Close asChild>
                <IconButton
                  label="Close"
                  shortcut="Esc"
                  size="sm"
                  icon={<X size={ICON_SIZE.inline} aria-hidden="true" />}
                />
              </DialogPrimitive.Close>
            )}
          </div>
          {children !== undefined && (
            <div ref={bodyRef} className="ui-dialog__body">
              {children}
            </div>
          )}
          {footer !== undefined && (
            <div ref={footerRef} className="ui-dialog__footer">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
