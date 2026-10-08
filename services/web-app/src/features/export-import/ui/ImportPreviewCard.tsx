import { describeCounts, plural } from "../lib/importSummary";
import { cardStyle, warningStyle } from "./styles";
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

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export const ImportPreviewCard = ({
  fileName,
  preview,
}: ImportPreviewCardProps): React.ReactElement => (
  <div style={cardStyle} aria-label="Import file summary">
    <div style={{ fontWeight: 600, color: "var(--fg-0)", wordBreak: "break-all" }}>{fileName}</div>
    <div style={{ color: "var(--fg-3)", fontSize: 11, margin: "2px 0 8px" }}>
      Exported {formatTimestamp(preview.exported_at)} · format {preview.version} · tokens and API
      keys {SECRETS_LABELS[preview.secrets]}
    </div>
    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
      <li>{describeCounts(preview.hosts, "host", "hosts")}</li>
      <li>{describeCounts(preview.ai_providers, "AI provider", "AI providers")}</li>
      <li>{describeCounts(preview.review_presets, "review preset", "review presets")}</li>
      <li>{describeCounts(preview.reviews, "review", "reviews")}</li>
    </ul>
    {preview.secrets === "plain" && (
      <p style={warningStyle}>
        This file holds tokens and API keys in plain text. Delete it once it is imported.
      </p>
    )}
    {preview.secrets === "omitted" && preview.hosts.total + preview.ai_providers.total > 0 && (
      <p style={warningStyle}>
        This file has no tokens or API keys. New hosts and providers are added without them;
        existing ones keep theirs.
      </p>
    )}
    {preview.reviews_without_host > 0 && (
      <p style={warningStyle}>
        {plural(preview.reviews_without_host, "review refers", "reviews refer")} to a host that is
        neither here nor in this file. They are imported, but cannot reach their merge requests
        until that host is added.
      </p>
    )}
    {preview.reviews_without_preset > 0 && (
      <p style={warningStyle}>
        {plural(preview.reviews_without_preset, "review uses", "reviews use")} a saved review preset
        that is neither here nor in this file; their briefs fall back to the built-in preset.
      </p>
    )}
  </div>
);
