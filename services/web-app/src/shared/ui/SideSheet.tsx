import * as Dialog from "@radix-ui/react-dialog";
import { useReturnFocus } from "@shared/lib";

export type SideSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Next to the title, before the close button (a count, a filter). */
  headerExtra?: React.ReactNode;
  width?: number;
  /** Focused on open instead of the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
};

const DEFAULT_WIDTH_PX = 340;

const CloseIcon = (): React.ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * A modal panel sliding in from the right. Its content exists only while it is open, so
 * nothing in it is tab-focusable or announced as a dialog when closed; Escape closes it,
 * focus stays inside while open and returns to where it was on close.
 */
export const SideSheet = ({
  isOpen,
  onClose,
  title,
  headerExtra,
  width = DEFAULT_WIDTH_PX,
  initialFocusRef,
  children,
}: SideSheetProps): React.ReactElement => {
  // Opened from a store flag, not a Dialog.Trigger: focus goes back to what had it.
  const handleCloseAutoFocus = useReturnFocus(isOpen);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="side-sheet-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.35)" }}
        />
        <Dialog.Content
          className="side-sheet"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            width,
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-1)",
            borderLeft: "1px solid var(--border)",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
            outline: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 14px",
              height: 48,
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <Dialog.Title
              style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", flex: 1, margin: 0 }}
            >
              {title}
            </Dialog.Title>
            {headerExtra}
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close">
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
