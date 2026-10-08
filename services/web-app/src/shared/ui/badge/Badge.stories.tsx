import { useState } from "react";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { CountBadge } from "./CountBadge";
import { StatusBadge } from "./StatusBadge";
import { Tag } from "./Tag";
import type { Tone } from "./tone";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Badges and chips",
  parameters: { layout: "padded" },
};

export default meta;

const TONES: Tone[] = [
  "neutral",
  "accent",
  "critical",
  "major",
  "minor",
  "suggestion",
  "success",
  "info",
];

export const Badges: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TONES.map((tone) => (
          <Badge key={tone} tone={tone} hasDot>
            {tone}
          </Badge>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TONES.map((tone) => (
          <Badge key={tone} tone={tone} variant="outline">
            {tone}
          </Badge>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <StatusBadge status="neutral" label="Draft" />
        <StatusBadge status="neutral" label="Opened" />
        <StatusBadge status="active" label="Running" isLive />
        <StatusBadge status="success" label="Posted" />
        <StatusBadge status="warning" label="Partly posted" />
        <StatusBadge status="danger" label="Failed" />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--fg-1)" }}>
        History <CountBadge count={3} label="3 reviews" />
        Comments <CountBadge count={12} tone="accent" />
        Errors <CountBadge count={140} tone="danger" />
      </div>
    </div>
  ),
};

const ChipsDemo = (): React.ReactElement => {
  const [selected, setSelected] = useState<string[]>(["Assigned", "critical"]);
  const toggle = (name: string, isOn: boolean): void => {
    setSelected((previous) =>
      isOn ? [...previous, name] : previous.filter((value) => value !== name)
    );
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {["Review requested", "Assigned", "Authored"].map((name) => (
          <Chip
            key={name}
            isSelected={selected.includes(name)}
            onSelectedChange={(isOn) => {
              toggle(name, isOn);
            }}
          >
            {name}
          </Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["critical", "major", "minor", "suggestion"] as const).map((name, index) => (
          <Chip
            key={name}
            tone={name}
            hasDot
            count={index + 1}
            isSelected={selected.includes(name)}
            onSelectedChange={(isOn) => {
              toggle(name, isOn);
            }}
          >
            {name}
          </Chip>
        ))}
        <Chip disabled>Disabled</Chip>
      </div>
    </div>
  );
};

/** Identifiers keep their case: model ids, file paths. */
export const Tags: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 320 }}>
      <Tag>claude-opus-5-5</Tag>
      <Tag>gpt-5-mini</Tag>
      <Tag>Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8</Tag>
    </div>
  ),
};

export const Chips: StoryObj = {
  render: () => <ChipsDemo />,
};
