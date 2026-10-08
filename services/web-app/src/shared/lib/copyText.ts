export const COPY_BLOCKED_MESSAGE =
  "The browser blocked copying. Select the text and copy it with Ctrl+C (⌘C on a Mac).";

/** Copies through a hidden textarea — the only way left on plain-http origins, where the
 * Clipboard API does not exist. */
const copyWithSelection = (text: string): boolean => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(textarea);
  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    active?.focus();
  }
};

/**
 * Copies `text` to the clipboard: the Clipboard API where the page may use it (HTTPS or
 * localhost), else a selection-based copy. Rejects with `COPY_BLOCKED_MESSAGE` when both fail.
 */
export const copyText = async (text: string): Promise<void> => {
  // `navigator.clipboard` is undefined on insecure origins, whatever the DOM typings say.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard && window.isSecureContext) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Denied permission or no focus: the selection copy below may still work.
    }
  }
  if (!copyWithSelection(text)) throw new Error(COPY_BLOCKED_MESSAGE);
};
