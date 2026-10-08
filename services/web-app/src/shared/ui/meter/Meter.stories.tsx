import { Meter } from "./Meter";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Meter> = {
  title: "shared/Meter",
  component: Meter,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Meter>;

export const States: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 420 }}>
      <Meter
        label="Prompt budget used"
        value={30_000}
        max={120_000}
        caption="30,000 of 120,000 characters"
        valueText="25% of the budget"
        isValueShown
      />
      <Meter
        label="Prompt budget used"
        value={120_000}
        max={120_000}
        tone="warn"
        caption="120,000 of 120,000 characters"
        valueText="100% of the budget"
        isValueShown
      />
      <Meter label="Bare" value={60} max={100} />
    </div>
  ),
};
