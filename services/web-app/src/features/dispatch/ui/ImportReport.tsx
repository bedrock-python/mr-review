import { ArrowRight, Pencil } from "lucide-react";

import { Button, Callout, ICON_SIZE, SectionHeader } from "@shared/ui";

import { pluralize } from "../model/runOutcome";
import { JsonErrorDetail } from "./JsonErrorDetail";

import type { ImportResponseResult } from "@entities/review";
import type { CalloutTone } from "@shared/ui";

const SKIPPED_LIST_MAX_HEIGHT_PX = 280;
const SKIPPED_RAW_MAX_HEIGHT_PX = 80;

type Summary = { tone: CalloutTone; title: string; detail: string | null };

const summarize = ({ imported, errors, json_error }: ImportResponseResult): Summary => {
  if (json_error !== null) {
    return {
      tone: imported > 0 ? "warn" : "danger",
      title: "The response isn't valid JSON",
      detail:
        imported > 0
          ? `It was saved as ${imported === 1 ? "one general comment" : pluralize(imported, "comment")} with the raw text. Fix the JSON and import again to get individual comments.`
          : "Nothing was imported. Fix the JSON and import again.",
    };
  }
  if (imported === 0) {
    return {
      tone: "danger",
      title: "No comments were imported",
      detail:
        errors.length > 0
          ? `All ${pluralize(errors.length, "item")} were rejected — see why below.`
          : "The response contained no comments.",
    };
  }
  if (errors.length > 0) {
    return {
      tone: "warn",
      title: `${pluralize(imported, "comment")} imported, ${pluralize(errors.length, "item")} skipped`,
      detail: "Skipped items are listed below. Fix them and import again to include them.",
    };
  }
  return { tone: "success", title: `${pluralize(imported, "comment")} imported`, detail: null };
};

const SkippedItems = ({
  errors,
}: {
  errors: ImportResponseResult["errors"];
}): React.ReactElement => (
  <section
    aria-label="Skipped items"
    style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
  >
    <SectionHeader title="Skipped items" as="h4" count={errors.length} />
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        maxHeight: SKIPPED_LIST_MAX_HEIGHT_PX,
        overflowY: "auto",
      }}
    >
      {errors.map((err) => (
        <li
          key={err.index}
          style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--border)",
            background: "var(--bg-2)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-meta)",
                color: "var(--fg-2)",
              }}
            >
              item #{err.index + 1}
            </span>
            <span
              style={{
                fontSize: "var(--fs-control)",
                fontWeight: "var(--fw-medium)",
                color: "var(--c-warn-fg)",
              }}
            >
              {err.reason}
            </span>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: "var(--fs-meta)",
              color: "var(--fg-2)",
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
);

export type ImportReportProps = {
  result: ImportResponseResult;
  onEdit: () => void;
  /** Offers "Polish N comments" when given; omit it where the screen already has one. */
  onContinue?: () => void;
};

/** Outcome of importing a pasted AI response, including why anything was rejected. */
export const ImportReport = ({
  result,
  onEdit,
  onContinue,
}: ImportReportProps): React.ReactElement => {
  const { tone, title, detail } = summarize(result);
  const hasImported = result.imported > 0;
  // Polishing is the natural next step only when the comments were really parsed;
  // after a JSON error the saved comment is just the raw text, so editing comes first.
  const shouldPolish = hasImported && result.json_error === null;
  const isEditShown = tone !== "success";
  const isPolishShown = hasImported && onContinue !== undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Callout tone={tone} role={tone === "success" ? "status" : "alert"} title={title}>
        {detail}
        {result.json_error !== null && <JsonErrorDetail message={result.json_error} />}
      </Callout>

      {result.errors.length > 0 && <SkippedItems errors={result.errors} />}

      {(isEditShown || isPolishShown) && (
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          {isEditShown && (
            <Button
              variant={shouldPolish ? "secondary" : "primary"}
              icon={<Pencil size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={onEdit}
            >
              Edit &amp; re-import
            </Button>
          )}
          {isPolishShown && (
            <Button
              variant={shouldPolish ? "primary" : "secondary"}
              iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={onContinue}
            >
              Polish {pluralize(result.imported, "comment")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
