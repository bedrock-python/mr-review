import * as Dialog from "@radix-ui/react-dialog";

type PolishDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  width?: number;
  /** Off when the caller moves focus itself after closing. */
  shouldRestoreFocus?: boolean;
  children: React.ReactNode;
};

const DEFAULT_WIDTH_PX = 440;

/** Modal shell shared by the Polish dialogs, styled like the app's other modals. */
export const PolishDialog = ({
  isOpen,
  onClose,
  title,
  description,
  width = DEFAULT_WIDTH_PX,
  shouldRestoreFocus = true,
  children,
}: PolishDialogProps): React.ReactElement => (
  <Dialog.Root
    open={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/55" />
      <Dialog.Content
        className="border-border bg-bg-1 fixed top-1/2 left-1/2 z-[201] flex max-h-[80vh] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border"
        style={{ width }}
        onCloseAutoFocus={(event) => {
          if (!shouldRestoreFocus) event.preventDefault();
        }}
      >
        <div className="border-border border-b px-5 pt-4 pb-3">
          <Dialog.Title className="text-fg-0 m-0 text-[15px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-fg-2 m-0 mt-1 text-[12px]">
            {description}
          </Dialog.Description>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
