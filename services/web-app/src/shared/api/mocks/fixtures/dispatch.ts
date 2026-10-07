// ── Dispatch stream fixtures ─────────────────────────────────────────────────
// The bodies deliberately contain braces, quotes, newlines and a fenced code
// block: the cases a naive streaming parser gets wrong.

export const DISPATCH_MOCK_ITERATION_ID = "44444444-4444-4444-8444-000000000001";

export type DispatchMockComment = {
  file: string | null;
  line: number | null;
  severity: "critical" | "major" | "minor" | "suggestion";
  body: string;
};

export const DISPATCH_MOCK_COMMENTS: readonly DispatchMockComment[] = [
  {
    file: "src/main.py",
    line: 2,
    severity: "minor",
    body: 'Prefer `logging` over `print` so the output can be filtered:\n\n```python\nlogger.info("Hello, world!")\n```',
  },
  {
    file: "src/main.py",
    line: 3,
    severity: "major",
    body: "Dropping `pass` makes `hello()` return `None` implicitly — should it return `{}` like the other handlers?",
  },
  {
    file: null,
    line: null,
    severity: "suggestion",
    body: "Consider a unit test for `hello()` that captures stdout.",
  },
];

const indent = (text: string): string =>
  text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

const RAW_PREFIX = "```json\n[\n";
const RAW_SEPARATOR = ",\n";
const RAW_SUFFIX = "\n]\n```";

const rawObjects = DISPATCH_MOCK_COMMENTS.map((comment) =>
  indent(JSON.stringify(comment, null, 2))
);

/** The model output the mock streams: a fenced, pretty-printed JSON array. */
export const DISPATCH_MOCK_RAW_RESPONSE = RAW_PREFIX + rawObjects.join(RAW_SEPARATOR) + RAW_SUFFIX;

/** Offset in the raw response right after each comment object's closing brace. */
export const DISPATCH_MOCK_COMMENT_END_OFFSETS: readonly number[] = rawObjects.map(
  (_, i) =>
    RAW_PREFIX.length +
    rawObjects.slice(0, i + 1).reduce((total, raw) => total + raw.length, 0) +
    RAW_SEPARATOR.length * i
);
