import { useMemo, useRef, useState } from "react";
import { CommentEditor } from "./CommentEditor";
import type { CommentDraft, PolishActions } from "../../model";
import type { RegisterEditor } from "./triageContext";

type NewCommentPanelProps = {
  /** Pre-selected anchor file, e.g. the file the list is filtered to. */
  defaultFile: string | null;
  addComment: PolishActions["addComment"];
  onAdded: (commentId: string) => void;
  onCancel: () => void;
  onRequestCancel: () => void;
  onRegister: RegisterEditor;
};

export const NewCommentPanel = ({
  defaultFile,
  addComment,
  onAdded,
  onCancel,
  onRequestCancel,
  onRegister,
}: NewCommentPanelProps): React.ReactElement => {
  const [isAdding, setIsAdding] = useState(false);
  // State updates land after the event: two ⌘↵ in a row, or ⌘↵ plus the unsaved-changes
  // dialog's Save, would both see isAdding still false. The ref closes that window.
  const isAddingRef = useRef(false);
  // Fixed when the panel opens: changing filters afterwards must not reset the draft.
  const [initialFile] = useState(defaultFile);
  const saved = useMemo(
    (): CommentDraft => ({ body: "", severity: "minor", file: initialFile, line: null }),
    [initialFile]
  );

  const handleSave = (draft: CommentDraft): void => {
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    setIsAdding(true);
    void addComment(draft).then((created) => {
      isAddingRef.current = false;
      setIsAdding(false);
      // On failure the form stays open with the draft; the action already showed the error.
      if (created !== null) onAdded(created.id);
    });
  };

  return (
    <div className="border-border max-h-[55%] shrink-0 overflow-auto border-b px-5 py-3">
      <CommentEditor
        saved={saved}
        mode="create"
        isSubmitting={isAdding}
        onSave={handleSave}
        onCancel={onCancel}
        onRequestCancel={onRequestCancel}
        onRegister={onRegister}
      />
    </div>
  );
};
