import { Button } from "../button";
import { Dialog } from "./Dialog";

export type ConfirmDialogProps = {
  isOpen: boolean;
  /** Cancel, Esc, the overlay, the close button. Ignored while the action is pending. */
  onCancel: () => void;
  onConfirm: () => void;
  /** The question: "Remove GitLab Acme?", "Delete preset Release hardening?". */
  title: React.ReactNode;
  /** What happens, and what stays: said before it happens. */
  description?: React.ReactNode;
  /** The action, as a verb and its object: "Remove host", "Delete preset". */
  confirmLabel: string;
  cancelLabel?: string;
  /** danger for what cannot be undone; primary for a confirmation that is not destructive. */
  tone?: "danger" | "primary";
  /** The action is running: the confirm button spins, nothing closes the dialog. */
  isPending?: boolean;
  /** The action is done and the subject is gone: the confirm button can no longer act. */
  isConfirmDisabled?: boolean;
  /** Off when the caller moves focus itself after the subject is gone. */
  shouldRestoreFocus?: boolean;
};

/**
 * "Are you sure?" before an action, in the same shape everywhere: a small dialog with the
 * question, its consequence, and Cancel (focused first, the safe choice) before the action.
 */
export const ConfirmDialog = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  isPending = false,
  isConfirmDisabled = false,
  shouldRestoreFocus = true,
}: ConfirmDialogProps): React.ReactElement => {
  const handleCancel = (): void => {
    if (!isPending) onCancel();
  };
  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleCancel}
      size="sm"
      title={title}
      {...(description === undefined ? {} : { description })}
      shouldRestoreFocus={shouldRestoreFocus}
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            isLoading={isPending}
            disabled={isConfirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
};
