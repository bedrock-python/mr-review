import { useState } from "react";
import { CountBadge } from "../badge";
import { Button } from "../button";
import { Drawer } from "../drawer";
import { Field, Input } from "../field";
import { Dialog } from "./Dialog";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Dialog and Drawer",
  parameters: { layout: "padded" },
};

export default meta;

const DialogDemo = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <Button
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Add host
      </Button>
      <Dialog
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        title="Add host"
        description="Connect a GitLab or GitHub instance with a personal access token."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary">Add host</Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Name">
            <Input placeholder="e.g. Work GitLab" />
          </Field>
          <Field label="Base URL" hint="The instance root, without /api.">
            <Input isMono placeholder="https://gitlab.example.com" />
          </Field>
        </div>
      </Dialog>
    </>
  );
};

export const DialogStory: StoryObj = {
  name: "Dialog",
  render: () => <DialogDemo />,
};

const DrawerDemo = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <Button
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Review history
      </Button>
      <Drawer
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        title="Review History"
        headerExtra={<CountBadge count={3} label="3 reviews" />}
      >
        <div style={{ padding: 16, color: "var(--fg-2)" }}>Rows go here.</div>
      </Drawer>
    </>
  );
};

export const DrawerStory: StoryObj = {
  name: "Drawer",
  render: () => <DrawerDemo />,
};
