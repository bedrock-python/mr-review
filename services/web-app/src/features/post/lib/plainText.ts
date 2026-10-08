/**
 * A comment body as running text for a two-line excerpt: code fences, inline code ticks,
 * bold marks, link targets and heading or quote marks are dropped, whitespace is folded.
 * Single `*` and `_` stay: in code identifiers they are not emphasis.
 */
export const toPlainText = (markdown: string): string =>
  markdown
    .replace(/```[^\n]*\n?/g, "")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^[ \t]{0,3}(?:#{1,6}|>)[ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
