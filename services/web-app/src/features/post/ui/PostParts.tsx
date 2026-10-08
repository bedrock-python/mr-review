import { useId } from "react";
import { Card, Field, SectionHeader, Select, Switch } from "@shared/ui";
import { SECTION } from "./postStyles";
import type { SeverityLabel } from "@entities/review";

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  padding: "var(--space-1) 0",
  fontSize: "var(--fs-control)",
};

const VALUE: React.CSSProperties = {
  margin: 0,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-mono)",
  color: "var(--fg-0)",
};

export type SummaryItem = { label: string; value: React.ReactNode };

/** Label and value pairs in a card: the target, the host, the counts. */
export const SummaryList = ({
  items,
  "aria-label": ariaLabel,
}: {
  items: SummaryItem[];
  "aria-label": string;
}): React.ReactElement => (
  <Card padding="sm">
    <dl aria-label={ariaLabel} style={{ margin: 0 }}>
      {items.map((item) => (
        <div key={item.label} style={ROW}>
          <dt style={{ flexShrink: 0, color: "var(--fg-2)" }}>{item.label}</dt>
          <dd style={VALUE}>{item.value}</dd>
        </div>
      ))}
    </dl>
  </Card>
);

const SEVERITY_LABEL_OPTIONS: { value: SeverityLabel; text: string }[] = [
  { value: "bold", text: "Bold — **Major** · …" },
  { value: "tag", text: "Tag — [major] …" },
  { value: "off", text: "No label" },
];

export type PostOptionsProps = {
  fallbackToGeneralNote: boolean;
  onFallbackChange: (value: boolean) => void;
  severityLabel: SeverityLabel;
  onSeverityLabelChange: (value: SeverityLabel) => void;
};

/** How the comments are sent: the inline fallback and the severity label. */
export const PostOptions = ({
  fallbackToGeneralNote,
  onFallbackChange,
  severityLabel,
  onSeverityLabelChange,
}: PostOptionsProps): React.ReactElement => {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} style={SECTION}>
      <SectionHeader id={titleId} title="Options" />
      <Switch
        label="Fall back to a general note"
        description="If a comment can't be anchored to its line, post it on the MR instead."
        checked={fallbackToGeneralNote}
        onCheckedChange={onFallbackChange}
      />
      <Field label="Severity label" hint="How each comment shows its severity on the MR.">
        <Select
          value={severityLabel}
          onChange={(event) => {
            const option = SEVERITY_LABEL_OPTIONS.find((o) => o.value === event.target.value);
            if (option) onSeverityLabelChange(option.value);
          }}
        >
          {SEVERITY_LABEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.text}
            </option>
          ))}
        </Select>
      </Field>
    </section>
  );
};
