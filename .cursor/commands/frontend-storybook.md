# Command: Storybook

Start Storybook for component development and documentation.

## Usage

```bash
# Start Storybook dev server
pnpm storybook

# Build static Storybook
pnpm build-storybook
```

## What Is Storybook

Storybook is a tool for:
- **Developing** UI components in isolation
- **Documenting** components with examples
- **Testing** visual states
- **Sharing** component library with team

## Starting Storybook

```bash
pnpm storybook
```

Opens at: http://localhost:6006

## Creating Stories

### Basic Story

```typescript
// shared/ui/button/Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Button",
  },
};
```

### With Controls

```typescript
const meta = {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Button>;
```

### With Actions

```typescript
import { fn } from "@storybook/test";

export const Interactive: Story = {
  args: {
    onClick: fn(), // Logs clicks in Actions panel
    children: "Click me",
  },
};
```

### Dark Theme Story

```typescript
export const Dark: Story = {
  parameters: {
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
  args: {
    children: "Dark Mode Button",
  },
};
```

## Story Organization

```
src/
├── shared/ui/
│   ├── button/
│   │   ├── Button.tsx
│   │   └── Button.stories.tsx
│   └── input/
│       ├── Input.tsx
│       └── Input.stories.tsx
├── entities/user/ui/
│   ├── UserCard.tsx
│   └── UserCard.stories.tsx
└── features/auth/ui/
    ├── LoginForm.tsx
    └── LoginForm.stories.tsx
```

## Story Categories

### UI Components (shared/ui)
```typescript
title: "UI/Button"
title: "UI/Input"
title: "UI/Card"
```

### Entity Components (entities/*/ui)
```typescript
title: "Entities/User/UserCard"
title: "Entities/Order/OrderCard"
```

### Feature Components (features/*/ui)
```typescript
title: "Features/Auth/LoginForm"
title: "Features/CreateUser/CreateUserForm"
```

## Storybook Addons

### Essential (included)
- **Docs**: Auto-generate documentation
- **Controls**: Interactive props editor
- **Actions**: Log event handlers
- **Viewport**: Test responsive designs
- **Backgrounds**: Test on different backgrounds

### Interactions (included)
```typescript
import { userEvent, within } from "@storybook/test";

export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText("Email"), "test@example.com");
    await userEvent.click(canvas.getByRole("button", { name: /submit/i }));
  },
};
```

## Building Storybook

### Static Build

```bash
pnpm build-storybook
```

Outputs to `storybook-static/` directory.

### Deploy Static Build

```bash
# Build
pnpm build-storybook

# Deploy to static host
# - Netlify
# - Vercel
# - S3
# - GitHub Pages
```

### Chromatic (Visual Testing)

```bash
# Install Chromatic
pnpm add -D chromatic

# Publish to Chromatic
pnpm chromatic --project-token=<token>
```

## Development Workflow

### 1. Create Component

```typescript
// Button.tsx
export const Button = (props: ButtonProps) => { ... };
```

### 2. Create Story

```typescript
// Button.stories.tsx
export default { title: "UI/Button", component: Button };
export const Primary = { args: { variant: "primary" } };
```

### 3. Develop in Storybook

```bash
pnpm storybook
```

- Edit component
- See changes instantly (HMR)
- Test different props
- Check dark/light themes
- Test responsive

### 4. Document

```typescript
/**
 * Primary UI button component.
 *
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Click me
 * </Button>
 */
export const Button = (props: ButtonProps) => { ... };
```

## Storybook Configuration

### Main Config

```typescript
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
```

### Preview Config

```typescript
// .storybook/preview.tsx
import type { Preview } from "@storybook/react";
import { ThemeProvider } from "next-themes";
import "../src/app/styles/index.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class">
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
```

## Troubleshooting

### Storybook won't start
```bash
# Clear cache
rm -rf node_modules/.cache/storybook
pnpm storybook
```

### Stories not showing
- Check file pattern: `*.stories.tsx`
- Check `stories` glob in `.storybook/main.ts`
- Restart Storybook

### Type errors in stories
```bash
# Check TypeScript
pnpm typecheck
```

## Quick Reference

```bash
# Development
pnpm storybook          # Start dev server (localhost:6006)

# Build
pnpm build-storybook    # Static build → storybook-static/

# Story file naming
ComponentName.stories.tsx
```

**URL**: http://localhost:6006

**Purpose**: Develop, document, test UI components in isolation.
