import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib";
import { Markdown } from "@shared/ui";
import { SEVERITY_ORDER, SEV_COLOR, useAutosizeTextarea } from "../../lib";
import { AnchorFields } from "./AnchorFields";
import { useCommentDraft } from "./useCommentDraft";
import type { CommentDraft } from "../../model";
import type { RegisterEditor } from "./triageContext";

type EditorTab = "write" | "preview";

type CommentEditorProps = {
  initial: CommentDraft;
  mode: "edit" | "create";
  isSubmitting?: boolean;
  onSave: (draft: CommentDraft) => void;
  onCancel: () => void;
  onRegister: RegisterEditor;
};

const TABS: { id: EditorTab; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "preview", label: "Preview" },
];

export const CommentEditor = ({
  initial,
  mode,
  isSubmitting = false,
  onSave,
  onCancel,
  onRegister,
}: CommentEditorProps): React.ReactElement => {
  const state = useCommentDraft(initial);
  const { draft, isDirty } = state;
  const [tab, setTab] = useState<EditorTab>("write");
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(textareaRef, state.body, tab === "write");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const save = useCallback((): boolean => {
    setHasTriedSave(true);
    if (draft === null) return false;
    if (mode === "edit" && !isDirty) onCancel();
    else onSave(draft);
    return true;
  }, [draft, isDirty, mode, onCancel, onSave]);

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
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  };

  const bodyError = hasTriedSave ? state.bodyError : null;
  const lineError = hasTriedSave || state.lineText.length > 0 ? state.lineError : null;
  const createLabel = isSubmitting ? "Adding…" : "Add comment";
  const saveLabel = mode === "create" ? createLabel : "Save";

  return (
    <div
      role="group"
      aria-label={mode === "create" ? "New comment" : "Edit comment"}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Severity">
        {SEVERITY_ORDER.map((severity) => (
          <button
            key={severity}
            type="button"
            aria-pressed={state.severity === severity}
            onClick={() => {
              state.setSeverity(severity);
            }}
            className={cn("sev cursor-pointer", severity)}
            style={{
              opacity: state.severity === severity ? 1 : 0.4,
              background:
                state.severity === severity
                  ? `color-mix(in oklch, ${SEV_COLOR[severity]} 12%, transparent)`
                  : undefined,
            }}
          >
            <span className="dot" />
            {severity}
          </button>
        ))}
      </div>

      <AnchorFields
        file={state.file}
        lineText={state.lineText}
        lineError={lineError}
        onFileChange={state.setFile}
        onLineChange={state.setLineText}
      />

      <div className="border-border overflow-hidden rounded-lg border">
        <div role="tablist" className="border-border bg-bg-2 flex gap-1 border-b px-1.5 pt-1.5">
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
                "rounded-t-md px-3 py-1 font-mono text-[11px]",
                tab === id ? "bg-bg-0 text-fg-0" : "text-fg-2 hover:text-fg-0"
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
          placeholder="Markdown supported"
          rows={4}
          className="bg-bg-0 text-fg-0 block min-h-[96px] w-full resize-none px-3 py-2.5 text-[12.5px] leading-[1.55] outline-none"
        />
        {tab === "preview" && (
          <div role="tabpanel" aria-label="Preview" className="bg-bg-0 min-h-[96px] px-3 py-2.5">
            {state.body.trim().length > 0 ? (
              <Markdown>{state.body}</Markdown>
            ) : (
              <p className="text-fg-3 text-[12px]">Nothing to preview.</p>
            )}
          </div>
        )}
      </div>
      {bodyError !== null && (
        <p role="alert" className="text-[11px] text-[var(--c-critical)]">
          {bodyError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-fg-3 mr-auto text-[11px]">
          <span className="kbd">⌘/Ctrl ↵</span> save · <span className="kbd">Esc</span> cancel
        </span>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            onCancel();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={isSubmitting}
          onClick={() => {
            save();
          }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
};
