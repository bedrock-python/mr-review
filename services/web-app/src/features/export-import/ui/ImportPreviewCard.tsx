import { FileJson } from "lucide-react";

import { Callout, Card, ICON_SIZE } from "@shared/ui";

import { describeCounts, plural } from "../lib/importSummary";
import type { ImportPreview } from "@shared/api/export-import.api";

type ImportPreviewCardProps = {
  fileName: string;
  preview: ImportPreview;
};

const SECRETS_LABELS: Record<ImportPreview["secrets"], string> = {
  encrypted: "encrypted with a passphrase",
  plain: "in plain text",
  omitted: "not included",
};

const headStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-2)",
};

const fileNameStyle: React.CSSProperties = {
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--fg-0)",
  overflowWrap: "anywhere",
};

const metaStyle: React.CSSProperties = {
  marginTop: "var(--space-1)",
  fontSize: "var(--fs-meta)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-2)",
};

const countsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "var(--space-1) var(--space-4)",
  margin: 0,
  padding: 0,
  listStyle: "none",
  fontSize: "var(--fs-control)",
  color: "var(--fg-1)",
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export const ImportPreviewCard = ({
  fileName,
  preview,
}: ImportPreviewCardProps): React.ReactElement => (
  <Card
    surface="sunken"
    padding="sm"
    role="group"
    aria-label="Import file summary"
    style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
  >
    <div style={headStyle}>
      <FileJson
        size={ICON_SIZE.button}
        aria-hidden="true"
        style={{ flexShrink: 0, color: "var(--fg-2)" }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={fileNameStyle}>{fileName}</div>
        <div style={metaStyle}>
          Exported {formatTimestamp(preview.exported_at)} · format {preview.version} · tokens and
          API keys {SECRETS_LABELS[preview.secrets]}
        </div>
      </div>
    </div>
    <ul style={countsStyle}>
      <li>{describeCounts(preview.hosts, "host", "hosts")}</li>
      <li>{describeCounts(preview.ai_providers, "AI provider", "AI providers")}</li>
      <li>{describeCounts(preview.review_presets, "review preset", "review presets")}</li>
      <li>{describeCounts(preview.reviews, "review", "reviews")}</li>
    </ul>
    {preview.secrets === "plain" && (
      <Callout tone="warn" size="sm">
        This file holds tokens and API keys in plain text. Delete it once it is imported.
      </Callout>
    )}
    {preview.secrets === "omitted" && preview.hosts.total + preview.ai_providers.total > 0 && (
      <Callout tone="warn" size="sm">
        This file has no tokens or API keys. New hosts and providers are added without them;
        existing ones keep theirs.
      </Callout>
    )}
    {preview.reviews_without_host > 0 && (
      <Callout tone="warn" size="sm">
        {plural(preview.reviews_without_host, "review refers", "reviews refer")} to a host that is
        neither here nor in this file. They are imported, but cannot reach their merge requests
        until that host is added.
      </Callout>
    )}
    {preview.reviews_without_preset > 0 && (
      <Callout tone="warn" size="sm">
        {plural(preview.reviews_without_preset, "review uses", "reviews use")} a saved review preset
        that is neither here nor in this file; their briefs fall back to the built-in preset.
      </Callout>
    )}
  </Card>
);
