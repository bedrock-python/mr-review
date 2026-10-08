import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button, Dialog, ICON_SIZE } from "@shared/ui";

import { focusTargetAfterRow } from "../lib/focusTargets";

export type RowActionsProps = {
  /** The record's name, for the buttons' accessible names and the confirmation. */
  name: string;
  /** "host", "provider": completes "Remove host". */
  kind: string;
  /** What removing deletes and what stays, said before it happens. */
  consequence: string;
  isRemoving: boolean;
  /** The Edit button, for the row to focus when its edit form closes. */
  editRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  /** Deletes the record; `onRemoved` is called once the server has. */
  onRemove: (onRemoved: () => void) => void;
};

/** Edit and Remove for a settings row; Remove asks first. */
export const RowActions = ({
  name,
  kind,
  consequence,
  isRemoving,
  editRef,
  onEdit,
  onRemove,
}: RowActionsProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  // Gone on the server, still listed until the list refetches: nothing here may act on it.
  const [isRemoved, setIsRemoved] = useState(false);
  const focusAfterRemoval = useRef<HTMLElement | null>(null);

  const close = (): void => {
    if (!isRemoving) setIsConfirming(false);
  };

  const handleRemoved = (): void => {
    focusAfterRemoval.current = focusTargetAfterRow(editRef.current);
    setIsRemoved(true);
    setIsConfirming(false);
  };

  useEffect(() => {
    if (!isRemoved) return;
    // After the dialog's focus trap has let go, which happens as it unmounts.
    window.setTimeout(() => {
      focusAfterRemoval.current?.focus();
    }, 0);
  }, [isRemoved]);

  return (
    <>
      <Button
        ref={editRef}
        data-row-edit=""
        variant="ghost"
        size="sm"
        icon={<Pencil size={ICON_SIZE.inline} aria-hidden="true" />}
        aria-label={`Edit ${name}`}
        disabled={isRemoved}
        onClick={onEdit}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 size={ICON_SIZE.inline} aria-hidden="true" />}
        aria-label={`Remove ${name}`}
        style={{ color: "var(--c-danger-fg)" }}
        disabled={isRemoved}
        onClick={() => {
          setIsConfirming(true);
        }}
      >
        Remove
      </Button>
      <Dialog
        isOpen={isConfirming}
        onClose={close}
        size="sm"
        title={`Remove ${name}?`}
        description={consequence}
        shouldRestoreFocus={!isRemoved}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isRemoving}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isRemoving}
              disabled={isRemoved}
              onClick={() => {
                onRemove(handleRemoved);
              }}
            >
              Remove {kind}
            </Button>
          </>
        }
      />
    </>
  );
};
