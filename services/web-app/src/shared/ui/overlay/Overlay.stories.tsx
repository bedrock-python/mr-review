import { Check, ListFilter, X } from "lucide-react";
import { Button } from "../button";
import { IconButton } from "../button";
import { Radio, RadioGroup } from "../choice";
import { Menu, MenuGroup, MenuItem, MenuSeparator } from "./Menu";
import { Popover } from "./Popover";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Menu and Popover",
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj;

export const BulkMenu: Story = {
  render: () => (
    <Menu aria-label="Bulk actions" trigger={<Button size="sm">Bulk</Button>}>
      <MenuGroup label="All 9 comments">
        <MenuItem icon={<Check size={14} />} shortcut="a" onSelect={() => undefined}>
          Keep all
        </MenuItem>
        <MenuItem icon={<X size={14} />} onSelect={() => undefined}>
          Dismiss all
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuItem isDisabled onSelect={() => undefined}>
        Nothing to undo
      </MenuItem>
    </Menu>
  ),
};

export const FilterPopover: Story = {
  render: () => (
    <Popover
      aria-label="Filter merge requests"
      align="end"
      trigger={
        <IconButton
          variant="secondary"
          label="Filter merge requests"
          hasIndicator
          icon={<ListFilter size={16} aria-hidden="true" />}
        />
      }
    >
      <RadioGroup legend="Show" value="draft" onValueChange={() => undefined}>
        <Radio value="any" label="All merge requests" />
        <Radio value="draft" label="Drafts only" />
        <Radio value="ready" label="Ready for review" />
      </RadioGroup>
    </Popover>
  ),
};
