import { useState } from "react";
import { Field } from "../field";
import { Combobox } from "./Combobox";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Combobox> = {
  title: "shared/Combobox",
  component: Combobox,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Combobox>;

const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5", "gpt-5", "gpt-5-mini"];

const Demo = ({ allowsCustomValue }: { allowsCustomValue: boolean }): React.ReactElement => {
  const [value, setValue] = useState("claude-sonnet-5-5");
  return (
    <div style={{ maxWidth: 360 }}>
      <Field label="Model" hint="Search the list, or type any id the endpoint accepts.">
        <Combobox
          options={MODELS}
          value={value}
          onValueChange={setValue}
          allowsCustomValue={allowsCustomValue}
          listLabel="Models"
          placeholder="Search or type a model id…"
          isMono
        />
      </Field>
    </div>
  );
};

export const PickOrType: Story = { render: () => <Demo allowsCustomValue /> };
export const ListOnly: Story = { render: () => <Demo allowsCustomValue={false} /> };
