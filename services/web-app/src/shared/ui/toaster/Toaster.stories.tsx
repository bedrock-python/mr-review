import { toast } from "sonner";
import { Button } from "../button";
import { Toaster } from "./Toaster";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Toaster",
  parameters: { layout: "padded" },
};

export default meta;

export const Types: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Toaster />
      <Button
        onClick={() => {
          toast("Comment dismissed", { action: { label: "Undo", onClick: () => undefined } });
        }}
      >
        Default with Undo
      </Button>
      <Button
        onClick={() => {
          toast.success("3 comments posted");
        }}
      >
        Success
      </Button>
      <Button
        onClick={() => {
          toast.warning("Posted 2 of 3 comments", {
            description: "One line is no longer in the diff.",
          });
        }}
      >
        Warning
      </Button>
      <Button
        onClick={() => {
          toast.error("Failed to save comments");
        }}
      >
        Error
      </Button>
      <Button
        onClick={() => {
          toast.info("A new version is available");
        }}
      >
        Info
      </Button>
    </div>
  ),
};
