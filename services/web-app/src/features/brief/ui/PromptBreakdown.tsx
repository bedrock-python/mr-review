import { Callout, Eyebrow, Meter } from "@shared/ui";
import type { PromptPreview, PromptSection } from "@entities/review";

const CHARS_PER_TOKEN = 4;

const formatCount = (value: number): string => value.toLocaleString();

type StatusPart = { text: string; isLoss: boolean };

/** "1 of 3 · 1 cut short · 2 left out"; the parts that lost material are flagged. */
const sectionStatus = (section: PromptSection): StatusPart[] => {
  if (section.items > 0 && section.included === 0) return [{ text: "left out", isLoss: true }];
  const parts: StatusPart[] = [];
  if (section.items > 1 || section.omitted.length > 0) {
    parts.push({ text: `${String(section.included)} of ${String(section.items)}`, isLoss: false });
  }
  if (section.truncated.length > 0) {
    parts.push({ text: `${String(section.truncated.length)} cut short`, isLoss: true });
  }
  if (section.omitted.length > 0) {
    parts.push({ text: `${String(section.omitted.length)} left out`, isLoss: true });
  }
  if (section.skipped.length > 0) {
    parts.push({ text: `${String(section.skipped.length)} binary skipped`, isLoss: false });
  }
  return parts.length > 0 ? parts : [{ text: "whole", isLoss: false }];
};

const hasLoss = (section: PromptSection): boolean =>
  section.truncated.length > 0 ||
  section.omitted.length > 0 ||
  (section.items > 0 && section.included === 0);

const CELL = "whitespace-nowrap";
const CELL_STYLE: React.CSSProperties = { padding: "var(--space-1) var(--space-2)" };

export type PromptBreakdownProps = {
  preview: PromptPreview;
};

const PERCENT = 100;

const budgetPercent = (used: number, budget: number): number =>
  budget > 0 ? Math.round(Math.min(used / budget, 1) * PERCENT) : 0;

/** What the prompt is made of, what the budget cut, and which files were left out. */
export const PromptBreakdown = ({ preview }: PromptBreakdownProps): React.ReactElement => {
  const lossy = preview.sections.filter(hasLoss);
  const skipped = preview.sections.flatMap((section) => section.skipped);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <Meter
        label="Prompt budget used"
        value={preview.total_chars}
        max={preview.budget_chars}
        caption={`${preview.total_chars.toLocaleString()} of ${preview.budget_chars.toLocaleString()} characters`}
        valueText={`${String(budgetPercent(preview.total_chars, preview.budget_chars))}% of the budget`}
        isValueShown
        // Something was cut to fit: the bar turns to the warning colour.
        tone={lossy.length > 0 ? "warn" : "accent"}
      />
      <table
        className="w-full border-collapse font-mono"
        style={{ fontSize: "var(--fs-meta)", fontVariantNumeric: "tabular-nums" }}
      >
        <caption className="ui-visually-hidden">What the prompt is made of</caption>
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className="text-left" style={CELL_STYLE}>
              <Eyebrow>Part</Eyebrow>
            </th>
            <th scope="col" className="text-right" style={CELL_STYLE}>
              <Eyebrow>≈ Tokens</Eyebrow>
            </th>
            <th scope="col" className="text-right" style={CELL_STYLE}>
              <Eyebrow>Characters</Eyebrow>
            </th>
            <th scope="col" className="text-left" style={CELL_STYLE}>
              <Eyebrow>Included</Eyebrow>
            </th>
          </tr>
        </thead>
        <tbody className="text-fg-1">
          {preview.sections.map((section) => (
            <tr key={section.key} className="border-border border-b">
              <th scope="row" className={`${CELL} text-left font-normal`} style={CELL_STYLE}>
                {section.label}
              </th>
              <td className={`${CELL} text-right`} style={CELL_STYLE}>
                {formatCount(Math.ceil(section.chars / CHARS_PER_TOKEN))}
              </td>
              <td className={`${CELL} text-fg-2 text-right`} style={CELL_STYLE}>
                {formatCount(section.chars)}
              </td>
              <td className={CELL} style={CELL_STYLE}>
                {sectionStatus(section).map((part, index) => (
                  <span key={part.text}>
                    {index > 0 && <span className="text-fg-2"> · </span>}
                    <span className={part.isLoss ? "text-c-major-fg" : "text-fg-2"}>
                      {part.text}
                    </span>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-fg-0">
          <tr>
            <th scope="row" className={`${CELL} text-left font-medium`} style={CELL_STYLE}>
              Total
            </th>
            <td className={`${CELL} text-right`} style={CELL_STYLE}>
              {formatCount(preview.estimated_tokens)}
            </td>
            <td className={`${CELL} text-fg-2 text-right`} style={CELL_STYLE}>
              {formatCount(preview.total_chars)}
            </td>
            <td style={CELL_STYLE} />
          </tr>
        </tfoot>
      </table>
      {lossy.length > 0 && (
        <Callout tone="warn" size="sm" title="Not everything fit">
          <p className="m-0">
            Some material did not fit the prompt budget and was cut or left out. Raise the budget
            under Advanced if the model has room, or narrow the review with path filters.
          </p>
          <ul
            className="m-0 list-disc space-y-1"
            style={{ paddingLeft: "var(--space-4)", marginTop: "var(--space-1)" }}
          >
            {lossy.map((section) => (
              <li key={section.key}>
                <span className="text-fg-0">{section.label}</span>
                {section.truncated.length > 0 && (
                  <span>{` — cut short: ${section.truncated.join(", ")}`}</span>
                )}
                {section.omitted.length > 0 && (
                  <span>{` — left out: ${section.omitted.join(", ")}`}</span>
                )}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {skipped.length > 0 && (
        <p className="text-fg-2 m-0" style={{ fontSize: "var(--fs-meta)" }}>
          {`Skipped as binary: ${skipped.join(", ")}.`}
        </p>
      )}
      {preview.excluded_files.length > 0 && (
        <p className="text-fg-2 m-0" style={{ fontSize: "var(--fs-meta)" }}>
          {`${String(preview.excluded_files.length)} of ${String(preview.files_total)} changed files excluded by path filters.`}
        </p>
      )}
      {preview.preset_missing && (
        <Callout tone="warn" size="sm" role="status">
          The saved preset this brief names no longer exists; the built-in preset&apos;s
          instructions were used.
        </Callout>
      )}
    </div>
  );
};
