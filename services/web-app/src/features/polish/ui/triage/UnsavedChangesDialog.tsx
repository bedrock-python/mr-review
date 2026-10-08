import { PolishDialog } from "./PolishDialog";

export type UnsavedChoice = "keep-editing" | "discard" | "save";

type UnsavedChangesDialogProps = {
  isOpen: boolean;
  onChoose: (choice: UnsavedChoice) => void;
};

export const UnsavedChangesDialog = ({
  isOpen,
  onChoose,
}: UnsavedChangesDialogProps): React.ReactElement => (
  <PolishDialog
    isOpen={isOpen}
    onClose={() => {
      onChoose("keep-editing");
    }}
    title="Unsaved changes"
    description="The comment you are editing has changes that are not saved yet."
    // Focus goes back to the editor or the next card, never to whatever was clicked.
    shouldRestoreFocus={false}
  >
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          onChoose("keep-editing");
        }}
      >
        Keep editing
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          onChoose("discard");
        }}
      >
        Discard
      </button>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          onChoose("save");
        }}
      >
        Save
      </button>
    </div>
  </PolishDialog>
);
