import { ArrowRight, History, Pin, Plus, Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import type { ButtonSize, ButtonVariant } from "./buttonClassName";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Button> = {
  title: "shared/Button",
  component: Button,
  parameters: { layout: "padded" },
  args: { children: "Continue", variant: "primary", size: "md" },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Playground: Story = {};

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

export const Matrix: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      {SIZES.map((size) => (
        <div key={size} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {variant}
            </Button>
          ))}
          <Button size={size} icon={<Plus size={14} aria-hidden="true" />}>
            With icon
          </Button>
          <Button
            size={size}
            variant="primary"
            iconRight={<ArrowRight size={14} aria-hidden="true" />}
          >
            Continue to Post
          </Button>
          <Button size={size} variant="primary" isLoading>
            Posting…
          </Button>
          <Button size={size} disabled>
            Disabled
          </Button>
        </div>
      ))}
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <IconButton label="Close" shortcut="Esc" icon={<X size={16} aria-hidden="true" />} />
      <IconButton label="History" icon={<History size={16} aria-hidden="true" />} />
      <IconButton
        label="Pin comment"
        isPressed
        icon={<Pin size={16} aria-hidden="true" />}
        variant="secondary"
      />
      <IconButton
        label="Delete"
        variant="danger"
        size="sm"
        icon={<Trash2 size={14} aria-hidden="true" />}
      />
      <IconButton label="Unavailable" disabled icon={<X size={16} aria-hidden="true" />} />
    </div>
  ),
};
