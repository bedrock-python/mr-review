# Skill: Add Shared Component

How to create a reusable UI component in the shared layer.

## When to Use

Create a shared component when:
- Component is used across multiple features/pages
- Component is a UI primitive (Button, Input, Card)
- Component has NO business logic
- Component is highly reusable

Examples: Button, Input, Modal, Card, Spinner, Badge

## Structure

```
shared/ui/
└── <component-name>/      # kebab-case
    ├── ComponentName.tsx  # Main component
    ├── types.ts           # Props and types
    ├── constants.ts       # Variants, defaults
    ├── ComponentName.test.tsx    # Tests
    ├── ComponentName.stories.tsx # Storybook
    └── index.ts           # Public API
```

## Steps

### 1. Create Component Directory

```bash
mkdir -p src/shared/ui/<component-name>
```

### 2. Define Types

```typescript
// shared/ui/<component-name>/types.ts
import type { VariantProps } from "class-variance-authority";
import type { buttonVariants } from "./constants";

export type ButtonProps = {
  children: React.ReactNode;
  isLoading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>
  & VariantProps<typeof buttonVariants>;
```

### 3. Define Variants (CVA)

```typescript
// shared/ui/button/constants.ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);
```

### 4. Create Component

```typescript
// shared/ui/button/Button.tsx
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@shared/lib";
import { buttonVariants } from "./constants";
import type { ButtonProps } from "./types";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner className="mr-2 h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";
```

### 5. Create Tests

```typescript
// shared/ui/button/Button.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole("button"));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading state", () => {
    render(<Button isLoading>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies variant classes", () => {
    render(<Button variant="secondary">Click</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-secondary");
  });
});
```

### 6. Create Storybook Story

```typescript
// shared/ui/button/Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
  },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary Button",
  },
};

export const Loading: Story = {
  args: {
    variant: "primary",
    children: "Loading",
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    variant: "primary",
    children: "Disabled",
    disabled: true,
  },
};
```

### 7. Create Public API

```typescript
// shared/ui/button/index.ts
export { Button } from "./Button";
export { buttonVariants } from "./constants";
export type { ButtonProps } from "./types";
```

### 8. Update Shared UI Index

```typescript
// shared/ui/index.ts
export * from "./button";
export * from "./input";
export * from "./card";
// ... other components
```

## Component Checklist

- [ ] Component file created (PascalCase.tsx)
- [ ] Types defined (types.ts)
- [ ] Variants defined with CVA (constants.ts)
- [ ] Tests written (*.test.tsx)
- [ ] Storybook story created (*.stories.tsx)
- [ ] Public API exported (index.ts)
- [ ] Updated shared/ui/index.ts
- [ ] Documented props (JSDoc or Storybook)
- [ ] Accessibility tested (ARIA, keyboard)
- [ ] Responsive tested (mobile, tablet, desktop)
- [ ] Theme tested (light, dark)

## Common Shared Components

### Button
- Variants: primary, secondary, outline, ghost, destructive
- Sizes: sm, md, lg, icon
- States: default, hover, active, disabled, loading

### Input
- Types: text, email, password, number, search
- States: default, error, disabled
- Features: prefix, suffix, clear button

### Card
- Variants: default, bordered, elevated
- Sections: Header, Content, Footer

### Modal/Dialog
- Controlled component
- Overlay + focus trap
- Keyboard close (ESC)

### Spinner/Loader
- Sizes: sm, md, lg
- Variants: circular, dots, bars

## Best Practices

### 1. Composition

```typescript
// ✅ CORRECT - Composable
export const Card = ({ children }: CardProps) => (
  <div className="card">{children}</div>
);

Card.Header = CardHeader;
Card.Content = CardContent;
Card.Footer = CardFooter;

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Content>Content</Card.Content>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### 2. Polymorphic Components

```typescript
// ✅ CORRECT - Can render as different elements
export type ButtonProps = {
  asChild?: boolean;
  // ...
};

export const Button = ({ asChild, ...props }: ButtonProps) => {
  const Comp = asChild ? Slot : "button";
  return <Comp {...props} />;
};

// Usage as link
<Button asChild>
  <Link to="/home">Home</Link>
</Button>
```

### 3. Forward Refs

```typescript
// ✅ CORRECT - Expose DOM ref
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => <input ref={ref} {...props} />
);
```

### 4. Controlled + Uncontrolled Support

```typescript
// ✅ CORRECT - Support both modes
export const Input = ({ value, defaultValue, onChange }: InputProps) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;

  const currentValue = isControlled ? value : internalValue;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) {
      setInternalValue(e.target.value);
    }
    onChange?.(e);
  };

  return <input value={currentValue} onChange={handleChange} />;
};
```

### 5. Accessibility

```typescript
// ✅ CORRECT - ARIA attributes
export const Button = ({
  children,
  disabled,
  isLoading,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) => (
  <button
    type="button"
    disabled={disabled || isLoading}
    aria-disabled={disabled || isLoading}
    aria-busy={isLoading}
    aria-label={ariaLabel}
    {...props}
  >
    {children}
  </button>
);
```

## Anti-Patterns

### ❌ WRONG: Business logic in shared

```typescript
// shared/ui/user-card/UserCard.tsx
export const UserCard = ({ userId }: { userId: string }) => {
  const { data } = useUser(userId); // ❌ WRONG - API call
  return <div>{data?.name}</div>;
};
```

### ✅ CORRECT: Pass data as props

```typescript
// shared/ui/user-card/UserCard.tsx
export const UserCard = ({ user }: { user: User }) => {
  return <div>{user.name}</div>;
};

// entities/user/ui/UserCardContainer.tsx
export const UserCardContainer = ({ userId }: { userId: string }) => {
  const { data } = useUser(userId);
  if (!data) return null;
  return <UserCard user={data} />; // Use shared component
};
```

### ❌ WRONG: Feature-specific styling

```typescript
// shared/ui/button/Button.tsx
<button className="user-profile-specific-style"> // ❌ WRONG
```

### ✅ CORRECT: Generic, reusable styling

```typescript
<button className={cn(buttonVariants({ variant, size }), className)}>
```

## Quick Reference

```bash
# Create new component
mkdir -p src/shared/ui/<component-name>

# Required files
Component.tsx      # Main component
types.ts          # Props types
constants.ts      # CVA variants
index.ts          # Public API

# Optional files
Component.test.tsx    # Tests
Component.stories.tsx # Storybook
utils.ts             # Helper functions
```
