import { useState } from "react";

import { Button, Tag } from "@shared/ui";

// A row of tags stays one or two lines; the rest are a click away.
const MODEL_PREVIEW_LIMIT = 5;

const listStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-1)",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const emptyStyle: React.CSSProperties = { fontSize: "var(--fs-meta)", color: "var(--fg-2)" };

/** The provider's models under its name: the first few, and the rest on request. */
export const ModelTags = ({ models }: { models: string[] }): React.ReactElement => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (models.length === 0) {
    return <span style={emptyStyle}>No models configured</span>;
  }

  const visible = isExpanded ? models : models.slice(0, MODEL_PREVIEW_LIMIT);
  const hiddenCount = models.length - MODEL_PREVIEW_LIMIT;

  return (
    <ul aria-label="Models" style={listStyle}>
      {visible.map((model) => (
        <li key={model} style={{ minWidth: 0, maxWidth: "100%" }}>
          <Tag className="block">{model}</Tag>
        </li>
      ))}
      {hiddenCount > 0 && (
        <li>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            onClick={() => {
              setIsExpanded((expanded) => !expanded);
            }}
          >
            {isExpanded ? "Show less" : `+${String(hiddenCount)} more`}
          </Button>
        </li>
      )}
    </ul>
  );
};
