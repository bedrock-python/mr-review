import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@shared/lib";
import { Button, Kbd, Markdown, SegmentedControl } from "@shared/ui";
import { useAutosizeTextarea } from "../../lib";
import { SEVERITY_OPTIONS } from "../severityOptions";
import { AnchorFields } from "./AnchorFields";
import { useCommentDraft } from "./useCommentDraft";
import type { CommentDraft, CommentDraftChanges } from "../../model";
import type { RegisterEditor } from "./triageContext";

type EditorTab = "write" | "preview";

type CommentEditorProps = {
  /** The comment as saved (or a new comment's defaults); untouched fields keep following it. */
  saved: CommentDraft;
  mode: "edit" | "create";
  isSubmitting?: boolean;
  onSave: (draft: CommentDraft, changes: CommentDraftChanges) => void;
  /** The Cancel button: an explicit choice, so the draft goes without asking. */
  onCancel: () => void;
  /** Esc: easy to hit by accident, so a changed draft is confirmed first. */
  onRequestCancel: () => void;
  onRegister: RegisterEditor;
};

const TABS: { id: EditorTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "preview", label: "Preview" },
];

export const CommentEditor = ({
  saved,
  mode,
  isSubmitting = false,
  onSave,
  onCancel,
  onRequestCancel,
  onRegister,
}: CommentEditorProps): React.ReactElement => {
  const state = useCommentDraft(saved, mode === "create");
  const { draft, changes, isDirty, isValid } = state;
  const [tab, setTab] = useState<EditorTab>("write");
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const severityLabelId = useId();
  const bodyErrorId = useId();
  useAutosizeTextarea(textareaRef, state.body, tab === "write");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const save = useCallback((): boolean => {
    // Already on its way: a second save must not send it twice.
    if (isSubmitting) return true;
    setHasTriedSave(true);
    if (!isValid) return false;
    if (mode === "edit" && !isDirty) onCancel();
    else onSave(draft, changes);
    return true;
  }, [isSubmitting, isValid, mode, isDirty, onCancel, onSave, draft, changes]);

  const focus = useCallback((): void => {
    setTab("write");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(
    () => onRegister({ isDirty: () => isDirty, save, focus }),
    [onRegister, isDirty, save, focus]
  );

  // Handled here rather than by the global hotkeys: these must work while typing.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // Esc and Enter also end an IME composition; that keystroke belongs to the input method.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onRequestCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  };

  const bodyError = hasTriedSave ? state.bodyError : null;
  const createLabel = isSubmitting ? "Adding…" : "Add comment";
  const saveLabel = mode === "create" ? createLabel : "Save";

  return (
    <div
      role="group"
      aria-label={mode === "create" ? "New comment" : "Edit comment"}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-(--space-3)"
    >
      <div className="flex flex-wrap items-start gap-x-(--space-4) gap-y-(--space-2)">
        <div className="ui-field">
          <span id={severityLabelId} className="ui-eyebrow">
            Severity
          </span>
          <SegmentedControl
            size="sm"
            aria-labelledby={severityLabelId}
            options={SEVERITY_OPTIONS}
            value={state.severity}
            onValueChange={state.setSeverity}
          />
        </div>
        <AnchorFields
          file={state.file}
          lineText={state.lineText}
          lineError={state.lineError}
          onFileChange={state.setFile}
          onLineChange={state.setLineText}
        />
      </div>

      <div className="border-border-control bg-bg-2 ui-focus-within overflow-hidden rounded-(--radius-control) border">
        <div
          role="tablist"
          aria-label="Write or preview"
          className="border-border flex gap-(--space-1) border-b px-(--space-2)"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
              }}
              className={cn(
                "h-(--control-sm) px-(--space-2) text-(length:--fs-control) transition-colors",
                "focus-visible:-outline-offset-2",
                tab === id
                  ? "text-fg-0 shadow-[inset_0_-2px_0_var(--accent-fg)]"
                  : "text-fg-2 hover:text-fg-0"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          hidden={tab !== "write"}
          value={state.body}
          onChange={(event) => {
            state.setBody(event.target.value);
          }}
          aria-label="Comment body"
          aria-invalid={bodyError !== null}
          aria-describedby={bodyError === null ? undefined : bodyErrorId}
          placeholder="Markdown supported"
          rows={4}
          className="text-fg-0 block min-h-[96px] w-full resize-none bg-transparent px-(--space-3) py-(--space-2) text-(length:--fs-body) leading-(--lh-body)"
        />
        {tab === "preview" && (
          <div
            role="tabpanel"
            aria-label="Preview"
            className="min-h-[96px] px-(--space-3) py-(--space-2)"
          >
            {state.body.trim().length > 0 ? (
              <Markdown>{state.body}</Markdown>
            ) : (
              <p className="text-fg-2 text-(length:--fs-control)">Nothing to preview.</p>
            )}
          </div>
        )}
      </div>
      {bodyError !== null && (
        <p id={bodyErrorId} role="alert" className="text-(length:--fs-meta) text-(--c-critical-fg)">
          {bodyError}
        </p>
      )}

      <div className="flex items-center justify-end gap-(--space-2)">
        <span className="text-fg-2 mr-auto flex items-center gap-(--space-1) text-(length:--fs-meta)">
          <Kbd>⌘/Ctrl ↵</Kbd> save · <Kbd>Esc</Kbd> cancel
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          isLoading={isSubmitting}
          onClick={() => {
            save();
          }}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
};
