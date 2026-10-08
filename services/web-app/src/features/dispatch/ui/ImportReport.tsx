import type { ImportResponseResult } from "@entities/review";

const SKIPPED_LIST_MAX_HEIGHT_PX = 280;
const SKIPPED_RAW_MAX_HEIGHT_PX = 80;

const pluralize = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count !== 1 ? "s" : ""}`;

type Tone = "success" | "warning" | "failure";

const TONE_COLOR: Record<Tone, string> = {
  success: "var(--accent)",
  warning: "var(--c-major)",
  failure: "var(--c-critical)",
};

const TONE_ICON: Record<Tone, string> = {
  success: "✓",
  warning: "!",
  failure: "✗",
};

type Summary = { tone: Tone; title: string; detail: string | null };

const summarize = ({ imported, errors, json_error }: ImportResponseResult): Summary => {
  if (json_error !== null) {
    return {
      tone: imported > 0 ? "warning" : "failure",
      title: "The response isn't valid JSON",
      detail:
        imported > 0
          ? `It was saved as ${imported === 1 ? "one general comment" : pluralize(imported, "comment")} with the raw text. Fix the JSON and import again to get individual comments.`
          : "Nothing was imported. Fix the JSON and import again.",
    };
  }
  if (imported === 0) {
    return {
      tone: "failure",
      title: "No comments were imported",
      detail:
        errors.length > 0
          ? `All ${pluralize(errors.length, "item")} were rejected — see why below.`
          : "The response contained no comments.",
    };
  }
  if (errors.length > 0) {
    return {
      tone: "warning",
      title: `${pluralize(imported, "comment")} imported, ${pluralize(errors.length, "item")} skipped`,
      detail: "Skipped items are listed below. Fix them and import again to include them.",
    };
  }
  return { tone: "success", title: `${pluralize(imported, "comment")} imported`, detail: null };
};

export type ImportReportProps = {
  result: ImportResponseResult;
  onEdit: () => void;
  /** Offers "Polish comments →" when given; omit it where the screen already has one. */
  onContinue?: () => void;
};

/** Outcome of importing a pasted AI response, including why anything was rejected. */
export const ImportReport = ({
  result,
  onEdit,
  onContinue,
}: ImportReportProps): React.ReactElement => {
  const { tone, title, detail } = summarize(result);
  const color = TONE_COLOR[tone];
  const hasImported = result.imported > 0;
  // Polishing is the natural next step only when the comments were really parsed;
  // after a JSON error the saved comment is just the raw text, so editing comes first.
  const shouldPolish = hasImported && result.json_error === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        role={tone === "success" ? "status" : "alert"}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 6,
          border: `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
          background: `color-mix(in oklch, ${color} 8%, var(--bg-2))`,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: "20px", color, fontWeight: 700 }}>
          {TONE_ICON[tone]}
        </span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: tone === "success" ? "var(--fg-0)" : color,
            }}
          >
            {title}
          </span>
          {detail && (
            <span style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5 }}>{detail}</span>
          )}
          {result.json_error !== null && (
            <span
              className="mono"
              style={{
                marginTop: 2,
                fontSize: 11,
                color: "var(--fg-2)",
                padding: "6px 8px",
                borderRadius: 4,
                background: "var(--bg-1)",
                wordBreak: "break-word",
              }}
            >
              {result.json_error}
            </span>
          )}
        </div>
      </div>

      {result.errors.length > 0 && (
        <section
          aria-label="Skipped items"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Skipped items ({result.errors.length})
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: SKIPPED_LIST_MAX_HEIGHT_PX,
              overflowY: "auto",
            }}
          >
            {result.errors.map((err) => (
              <li
                key={err.index}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                    item #{err.index + 1}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--c-major)", fontWeight: 500 }}>
                    {err.reason}
                  </span>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 10,
                    color: "var(--fg-3)",
                    fontFamily: "var(--font-mono)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    maxHeight: SKIPPED_RAW_MAX_HEIGHT_PX,
                    overflowY: "auto",
                  }}
                >
                  {err.raw}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {tone !== "success" && (
          <button
            type="button"
            className={shouldPolish ? "btn" : "btn primary"}
            style={{ fontSize: 12 }}
            onClick={onEdit}
          >
            Edit &amp; re-import
          </button>
        )}
        {hasImported && onContinue && (
          <button
            type="button"
            className={shouldPolish ? "btn primary" : "btn"}
            style={{ gap: 6, fontSize: 12 }}
            onClick={onContinue}
          >
            Polish comments →
          </button>
        )}
      </div>
    </div>
  );
};
