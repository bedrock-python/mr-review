import { SEVERITY_ORDER } from "../lib";
import { SeverityBadge } from "./SeverityBadge";
import { SeverityCounts } from "./SeverityCounts";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "entities/review/Severity",
  parameters: { layout: "padded" },
};

export default meta;

export const Badges: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {SEVERITY_ORDER.map((severity) => (
          <SeverityBadge key={severity} severity={severity} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {SEVERITY_ORDER.map((severity) => (
          <SeverityBadge key={severity} severity={severity} variant="outline" />
        ))}
      </div>
    </div>
  ),
};

export const Counts: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <SeverityCounts counts={{ critical: 2, major: 1, minor: 0, suggestion: 3 }} />
      <SeverityCounts counts={{ critical: 2, major: 1, minor: 0, suggestion: 3 }} isCompact />
      <SeverityCounts counts={{ major: 1 }} shouldShowZero isCompact />
    </div>
  ),
};
