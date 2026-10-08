import { useState } from "react";
import { Badge } from "../badge";
import { SectionHeader } from "../section-header";
import { Card } from "./Card";
import { SelectCardGroup } from "./SelectCardGroup";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Cards and sections",
  parameters: { layout: "padded" },
};

export default meta;

export const Cards: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 12, width: 480 }}>
      <Card>
        <SectionHeader
          title="Configured models"
          count={6}
          countLabel="6 models"
          description="Offered in Dispatch, in this order."
          actions={
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm">
              Edit
            </button>
          }
        />
      </Card>
      <Card surface="raised" padding="sm">
        Raised, small padding
      </Card>
      <Card surface="sunken" padding="lg">
        Sunken, large padding
      </Card>
    </div>
  ),
};

type Preset = "quick" | "thorough" | "security" | "custom";

const SelectCardsDemo = (): React.ReactElement => {
  const [preset, setPreset] = useState<Preset>("thorough");
  return (
    <div style={{ width: 640, display: "grid", gap: 8 }}>
      <SectionHeader as="h3" id="preset-title" title="Preset" />
      <SelectCardGroup<Preset>
        aria-labelledby="preset-title"
        value={preset}
        onValueChange={setPreset}
        options={[
          { value: "quick", title: "Quick", description: "Obvious bugs only, few comments." },
          {
            value: "thorough",
            title: "Thorough",
            description: "Everything worth saying.",
            aside: <Badge tone="accent">default</Badge>,
          },
          { value: "security", title: "Security", description: "Auth, input, secrets." },
          { value: "custom", title: "Custom", description: "Not configured", isDisabled: true },
        ]}
      />
    </div>
  );
};

export const SelectCards: StoryObj = {
  render: () => <SelectCardsDemo />,
};
