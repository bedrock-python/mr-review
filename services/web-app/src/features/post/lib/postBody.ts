import type { Comment, SeverityLabel } from "@entities/review";

// The client copy of the server's post_body.format_post_body: the dry run shows exactly what
// is posted. Keep the two in step.

// A body opening with a block (fence, heading, quote, list, table) would break if the label were
// glued in front of it on the same line.
const BLOCK_START_RE = /^(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)/;
const BACKTICK_RUN_RE = /`+/g;
const SEPARATOR = " · ";

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

export const formatSeverityLabel = (severity: string, style: SeverityLabel): string => {
  if (style === "off") return "";
  if (style === "tag") return `[${severity}]`;
  return `**${capitalize(severity)}**`;
};

/** `text` as inline code, whatever backticks it holds. */
const codeSpan = (text: string): string => {
  const longestRun = Math.max(0, ...(text.match(BACKTICK_RUN_RE) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
};

/**
 * Where a comment goes: inline at its line, or as a general note. A note about a file (a path
 * but no line) is headed with the path.
 */
export const noteLocation = (comment: Comment): string | null =>
  comment.file !== null && comment.line === null ? comment.file : null;

/**
 * The text posted for `comment`. `location` (`path` or `path:line`) heads a note that is not
 * anchored to that place in the diff.
 */
export const formatPostBody = (
  comment: Pick<Comment, "severity" | "body">,
  style: SeverityLabel,
  location: string | null = null
): string => {
  const label = formatSeverityLabel(comment.severity, style);
  const joiner = style === "tag" ? " " : SEPARATOR;
  if (location !== null) {
    const header = [label, codeSpan(location)].filter((part) => part !== "").join(joiner);
    return `${header}\n\n${comment.body}`;
  }
  if (label === "") return comment.body;
  if (BLOCK_START_RE.test(comment.body)) return `${label}\n\n${comment.body}`;
  return `${label}${joiner}${comment.body}`;
};
