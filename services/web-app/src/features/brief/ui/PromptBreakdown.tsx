import type { PromptPreview, PromptSection } from "@entities/review";
import { noticeStyle } from "./styles";

const CHARS_PER_TOKEN = 4;

const formatCount = (value: number): string => value.toLocaleString();

const sectionStatus = (section: PromptSection): string => {
  const parts: string[] = [];
  if (section.items > 1 || section.omitted.length > 0) {
    parts.push(`${String(section.included)} of ${String(section.items)}`);
  }
  if (section.truncated.length > 0) parts.push(`${String(section.truncated.length)} cut short`);
  if (section.omitted.length > 0) parts.push(`${String(section.omitted.length)} left out`);
  if (section.skipped.length > 0) parts.push(`${String(section.skipped.length)} binary skipped`);
  if (section.items > 0 && section.included === 0) return "left out";
  return parts.join(" · ") || "whole";
};

const sectionTitle = (section: PromptSection): string | undefined => {
  const lines = [
    section.truncated.length > 0 ? `Cut short: ${section.truncated.join(", ")}` : "",
    section.omitted.length > 0 ? `Left out: ${section.omitted.join(", ")}` : "",
    section.skipped.length > 0 ? `Binary, skipped: ${section.skipped.join(", ")}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
};

const CELL: React.CSSProperties = { padding: "2px 6px", textAlign: "right", whiteSpace: "nowrap" };

export type PromptBreakdownProps = {
  preview: PromptPreview;
};

export const PromptBreakdown = ({ preview }: PromptBreakdownProps): React.ReactElement => {
  const isCut = preview.sections.some(
    (s) => s.truncated.length > 0 || s.omitted.length > 0 || (s.items > 0 && s.included === 0)
  );
  const usedShare = Math.min(100, Math.round((preview.total_chars / preview.budget_chars) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
      <div style={{ color: "var(--fg-2)" }}>
        {`${formatCount(preview.total_chars)} of ${formatCount(preview.budget_chars)} characters (${String(usedShare)}%) · ≈ ${formatCount(preview.estimated_tokens)} tokens, estimated at 4 characters per token`}
      </div>
      <table className="mono" style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
        <caption className="sr-only">What the prompt is made of</caption>
        <thead>
          <tr style={{ color: "var(--fg-2)" }}>
            <th scope="col" style={{ ...CELL, textAlign: "left", fontWeight: 400 }}>
              Part
            </th>
            <th scope="col" style={{ ...CELL, fontWeight: 400 }}>
              Characters
            </th>
            <th scope="col" style={{ ...CELL, fontWeight: 400 }}>
              ≈ Tokens
            </th>
            <th scope="col" style={{ ...CELL, textAlign: "left", fontWeight: 400 }}>
              Included
            </th>
          </tr>
        </thead>
        <tbody>
          {preview.sections.map((section) => (
            <tr key={section.key} title={sectionTitle(section)} style={{ color: "var(--fg-1)" }}>
              <th scope="row" style={{ ...CELL, textAlign: "left", fontWeight: 400 }}>
                {section.label}
              </th>
              <td style={CELL}>{formatCount(section.chars)}</td>
              <td style={CELL}>{formatCount(Math.ceil(section.chars / CHARS_PER_TOKEN))}</td>
              <td style={{ ...CELL, textAlign: "left" }}>{sectionStatus(section)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isCut && (
        <div role="status" style={noticeStyle("var(--c-major)")}>
          Some material did not fit the prompt budget and was cut or left out (hover a row for the
          files). Raise the budget under Advanced if the model has room, or narrow the review with
          path filters.
        </div>
      )}
      {preview.excluded_files.length > 0 && (
        <div style={{ color: "var(--fg-2)" }}>
          {`${String(preview.excluded_files.length)} of ${String(preview.files_total)} changed files excluded by path filters.`}
        </div>
      )}
      {preview.preset_missing && (
        <div role="status" style={noticeStyle("var(--c-major)")}>
          The saved preset this brief names no longer exists; the built-in preset&apos;s
          instructions were used.
        </div>
      )}
    </div>
  );
};
