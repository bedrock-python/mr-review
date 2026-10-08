import { useState } from "react";
import { Search } from "lucide-react";
import { Checkbox, Radio, RadioGroup, Switch } from "../choice";
import { Field } from "./Field";
import { Input } from "./Input";
import { Select } from "./Select";
import { Slider } from "./Slider";
import { Textarea } from "./Textarea";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Form controls",
  parameters: { layout: "padded" },
};

export default meta;

export const Fields: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 16, width: 420 }}>
      <Field label="Name" isRequired>
        <Input placeholder="e.g. Work GitLab" />
      </Field>
      <Field
        label="Base URL"
        hint="The instance root, without /api."
        labelAside={
          <a href="#token" style={{ color: "var(--accent-fg)", fontSize: 11 }}>
            Create a token ↗
          </a>
        }
      >
        <Input isMono placeholder="https://gitlab.example.com" />
      </Field>
      <Field label="Access Token" error="The token was refused (401).">
        <Input type="password" isMono defaultValue="glpat-xxxx" />
      </Field>
      <Field label="Search" isLabelHidden>
        <Input type="search" placeholder="Search models…" leadingIcon={<Search size={13} />} />
      </Field>
      <Field label="Sort by">
        <Select defaultValue="updated">
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
        </Select>
      </Field>
      <Field label="System prompt" hint="Sent before the brief.">
        <Textarea isMono rows={3} placeholder="e.g. You are a careful reviewer…" />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Input size="sm" aria-label="Small input" placeholder="sm" />
        <Select size="sm" aria-label="Small select">
          <option>sm</option>
        </Select>
        <Input aria-label="Disabled" disabled placeholder="disabled" />
      </div>
    </div>
  ),
};

const ChoicesDemo = (): React.ReactElement => {
  const [scope, setScope] = useState("all");
  const [isReasoning, setIsReasoning] = useState(true);
  return (
    <div style={{ display: "grid", gap: 16, width: 420 }}>
      <Checkbox label="Include diff" description="The full patch, up to the prompt budget." />
      <Checkbox label="Line numbers" defaultChecked />
      <Checkbox label="Some files" isIndeterminate />
      <Checkbox label="Locked" disabled />
      <Switch
        label="Reasoning"
        description="Lets the model think before it answers."
        checked={isReasoning}
        onCheckedChange={setIsReasoning}
      />
      <RadioGroup legend="Export" value={scope} onValueChange={setScope}>
        <Radio value="all" label="Everything" />
        <Radio value="hosts" label="Hosts only" description="Tokens are never exported." />
        <Radio value="reviews" label="Reviews only" />
      </RadioGroup>
      <RadioGroup
        legend="Layout"
        orientation="horizontal"
        value="list"
        onValueChange={() => undefined}
      >
        <Radio value="list" label="List" />
        <Radio value="tree" label="Tree" />
      </RadioGroup>
    </div>
  );
};

export const Sliders: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 360 }}>
      <Field label="Temperature" labelAside={<span>0.7</span>}>
        <Slider min={0} max={2} step={0.05} defaultValue={0.7} />
      </Field>
      <Field label="Temperature (unset)" hint="Unset — the model's default">
        <Slider min={0} max={2} step={0.05} defaultValue={1} isUnset />
      </Field>
      <Field label="Disabled">
        <Slider min={0} max={2} defaultValue={1} disabled />
      </Field>
    </div>
  ),
};

export const Choices: StoryObj = {
  render: () => <ChoicesDemo />,
};
