const DIGITS_RE = /^\d+$/;

/** A 1-based line number typed by the user, or null when the text is not one. */
export const parseLineNumber = (text: string): number | null => {
  const trimmed = text.trim();
  if (!DIGITS_RE.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
};
