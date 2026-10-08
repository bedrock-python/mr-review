import { Kbd } from "./Kbd";
import { Tooltip } from "./Tooltip";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Tooltip> = {
  title: "shared/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
};

export default meta;

export const OnFocus: StoryObj<typeof Tooltip> = {
  render: () => (
    <div style={{ display: "flex", gap: 24, padding: 48 }}>
      <Tooltip content="Finish Polish first">
        <button type="button" className="ui-btn ui-btn--secondary">
          Post (locked)
        </button>
      </Tooltip>
      <Tooltip content="Keyboard shortcuts" shortcut="?" side="bottom">
        <button type="button" className="ui-btn ui-btn--ghost">
          Help
        </button>
      </Tooltip>
      <span style={{ display: "flex", gap: 4, alignItems: "center", color: "var(--fg-2)" }}>
        <Kbd>⌘</Kbd>
        <Kbd>↵</Kbd> to save
      </span>
    </div>
  ),
};
