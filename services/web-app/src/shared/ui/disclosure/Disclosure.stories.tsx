import { Badge } from "../badge";
import { Disclosure } from "./Disclosure";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Disclosure> = {
  title: "shared/Disclosure",
  component: Disclosure,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Disclosure>;

/** A part of a stage: rule above, eyebrow title, a summary on the right while closed. */
export const Section: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <Disclosure title="Advanced" summary="2 of 7 files excluded">
        <p style={{ margin: 0, color: "var(--fg-1)" }}>Path filters and the prompt budget.</p>
      </Disclosure>
    </div>
  ),
};

/** Inside a card or under a list: a compact chevron link, here with a badge as its summary. */
export const Inline: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <Disclosure
        variant="inline"
        headingLevel="none"
        title="Advanced"
        summary={<Badge tone="accent">2 changed</Badge>}
      >
        <p style={{ margin: 0, color: "var(--fg-1)" }}>Max output tokens, system prompt.</p>
      </Disclosure>
      <Disclosure variant="inline" headingLevel="none" title="Built-in presets" defaultIsOpen>
        <p style={{ margin: 0, color: "var(--fg-1)" }}>Thorough · Security · Style</p>
      </Disclosure>
    </div>
  ),
};
