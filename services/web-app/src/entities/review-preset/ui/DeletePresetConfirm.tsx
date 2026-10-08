import { ConfirmDialog } from "@shared/ui";
import type { ReviewPreset } from "../model";

export type DeletePresetConfirmProps = {
  /** The preset to delete; null while nothing is being asked. */
  preset: ReviewPreset | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Off once it is deleted: the caller moves focus to the next row instead. */
  shouldRestoreFocus?: boolean;
};

/** Asked before a saved preset is deleted, as hosts and providers are in Settings. */
export const DeletePresetConfirm = ({
  preset,
  isPending,
  onCancel,
  onConfirm,
  shouldRestoreFocus = true,
}: DeletePresetConfirmProps): React.ReactElement => (
  <ConfirmDialog
    isOpen={preset !== null}
    onCancel={onCancel}
    onConfirm={onConfirm}
    title={`Delete preset ${preset?.name ?? ""}?`}
    description="Briefs that use it go back to their built-in preset. This cannot be undone."
    confirmLabel="Delete preset"
    isPending={isPending}
    shouldRestoreFocus={shouldRestoreFocus}
  />
);
