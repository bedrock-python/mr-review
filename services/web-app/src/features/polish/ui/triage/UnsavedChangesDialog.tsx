import { Button, Dialog } from "@shared/ui";

export type UnsavedChoice = "keep-editing" | "discard" | "save";

type UnsavedChangesDialogProps = {
  isOpen: boolean;
  onChoose: (choice: UnsavedChoice) => void;
};

export const UnsavedChangesDialog = ({
  isOpen,
  onChoose,
}: UnsavedChangesDialogProps): React.ReactElement => (
  <Dialog
    isOpen={isOpen}
    onClose={() => {
      onChoose("keep-editing");
    }}
    size="sm"
    title="Unsaved changes"
    description="The comment you are editing has changes that are not saved yet."
    // Focus goes back to the editor or the next card, never to whatever was clicked.
    shouldRestoreFocus={false}
    footer={
      <>
        <Button
          variant="ghost"
          onClick={() => {
            onChoose("keep-editing");
          }}
        >
          Keep editing
        </Button>
        <Button
          onClick={() => {
            onChoose("discard");
          }}
        >
          Discard
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onChoose("save");
          }}
        >
          Save
        </Button>
      </>
    }
  />
);
