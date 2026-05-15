---
name: frontend-setup-test
description: Write and run frontend tests — Vitest + Testing Library + Storybook, components/hooks/API/TanStack Query/integration patterns, mocks, providers, coverage.
---

# Skill: Setup Testing

How to write and run tests for the application.

## Test Stack

- **Unit/Integration**: Vitest
- **Component Testing**: Testing Library
- **Visual Testing**: Storybook
- **Mocking**: axios-mock-adapter, vitest mocks

## Test File Structure

```typescript
// ComponentName.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ComponentName } from "./ComponentName";

describe("ComponentName", () => {
  it("should render correctly", () => {
    render(<ComponentName />);
    expect(screen.getByText("Expected text")).toBeInTheDocument();
  });
});
```

## Writing Tests

### 1. Component Tests

```typescript
// shared/ui/button/Button.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  describe("Rendering", () => {
    it("renders with children", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
    });

    it("applies variant classes", () => {
      render(<Button variant="primary">Click</Button>);
      expect(screen.getByRole("button")).toHaveClass("bg-primary");
    });
  });

  describe("Interactions", () => {
    it("calls onClick when clicked", async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Click me</Button>);
      await user.click(screen.getByRole("button"));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick} disabled>Click me</Button>);
      await user.click(screen.getByRole("button"));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("States", () => {
    it("shows loading state", () => {
      render(<Button isLoading>Submit</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });
  });
});
```

### 2. Hook Tests

```typescript
// shared/lib/hooks/useDebounce.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 500));
    expect(result.current).toBe("initial");
  });

  it("debounces value changes", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "updated" });

    // Immediate check - should still be initial
    expect(result.current).toBe("initial");

    // After delay - should be updated
    await waitFor(() => expect(result.current).toBe("updated"), { timeout: 600 });
  });
});
```

### 3. API Tests with Mocks

```typescript
// entities/user/api/userApi.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "@shared/api/http-client";
import { userApi } from "./userApi";
import { mockUser } from "@shared/lib/test-utils/mocks";

describe("userApi", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(httpClient);
  });

  afterEach(() => {
    mock.reset();
  });

  describe("getUser", () => {
    it("fetches user successfully", async () => {
      const userData = mockUser();
      mock.onGet("/users/1").reply(200, userData);

      const user = await userApi.getUser("1");

      expect(user).toEqual(userData);
    });

    it("throws on 404", async () => {
      mock.onGet("/users/999").reply(404);

      await expect(userApi.getUser("999")).rejects.toThrow();
    });

    it("validates response with Zod", async () => {
      mock.onGet("/users/1").reply(200, { id: "1" }); // Invalid data

      await expect(userApi.getUser("1")).rejects.toThrow();
    });
  });
});
```

### 4. TanStack Query Tests

```typescript
// entities/user/api/userQueries.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { useUser } from "./userQueries";
import * as userApi from "./userApi";
import { mockUser } from "@shared/lib/test-utils/mocks";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useUser", () => {
  it("fetches user data", async () => {
    const userData = mockUser();
    vi.spyOn(userApi, "getUser").mockResolvedValue(userData);

    const { result } = renderHook(() => useUser("1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(userData);
  });

  it("handles errors", async () => {
    vi.spyOn(userApi, "getUser").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUser("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
```

### 5. Integration Tests (Pages)

```typescript
// pages/users/UsersPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { UsersPage } from "./UsersPage";
import { createTestProviders } from "@shared/lib/test-utils";

describe("UsersPage", () => {
  it("displays users list", async () => {
    render(<UsersPage />, { wrapper: createTestProviders() });

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });

  it("filters users by search", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: createTestProviders() });

    await user.type(screen.getByPlaceholderText(/search/i), "Jane");

    await waitFor(() => {
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    });
  });
});
```

## Test Utilities

### Create Test Providers

```typescript
// shared/lib/test-utils/providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import i18n from "@shared/i18n/config";

export const createTestProviders = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <I18nextProvider i18n={i18n}>
            {children}
          </I18nextProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: createTestProviders() });
};
```

### Mock Data Generators

```typescript
// shared/lib/test-utils/mocks.ts
import type { User } from "@entities/user";

export const mockUser = (overrides?: Partial<User>): User => ({
  id: "1",
  name: "John Doe",
  email: "john@example.com",
  role: "user",
  status: "active",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const mockUsers = (count: number): User[] => {
  return Array.from({ length: count }, (_, i) =>
    mockUser({ id: String(i + 1), name: `User ${i + 1}` })
  );
};
```

## Running Tests

### Commands

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# UI mode (interactive)
pnpm test:ui

# Coverage report
pnpm test:coverage

# Run specific file
pnpm test src/shared/ui/button/Button.test.tsx

# Run tests matching pattern
pnpm test --grep "Button"
```

### Coverage

```bash
# Generate coverage report
pnpm test:coverage

# Open HTML report
open coverage/index.html
```

Target: 80%+ coverage for:
- shared/ui components
- shared/lib utilities
- entities API
- features business logic

## Best Practices

### 1. Arrange-Act-Assert

```typescript
it("updates user name", async () => {
  // Arrange
  const user = mockUser({ name: "John" });
  const handleUpdate = vi.fn();

  // Act
  render(<UserForm user={user} onUpdate={handleUpdate} />);
  await userEvent.type(screen.getByLabelText("Name"), "Jane");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  // Assert
  expect(handleUpdate).toHaveBeenCalledWith({ ...user, name: "Jane" });
});
```

### 2. Descriptive Test Names

```typescript
// ✅ CORRECT - Describes behavior
it("disables submit button while form is submitting", () => { ... });
it("shows error message when email is invalid", () => { ... });

// ❌ WRONG - Vague
it("works correctly", () => { ... });
it("test button", () => { ... });
```

### 3. Test User Behavior

```typescript
// ✅ CORRECT - User perspective
it("displays validation error when email is invalid", async () => {
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText("Email"), "invalid");
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));
  expect(screen.getByText("Invalid email")).toBeInTheDocument();
});

// ❌ WRONG - Implementation details
it("sets hasError state to true", () => {
  const { result } = renderHook(() => useForm());
  act(() => result.current.validate());
  expect(result.current.hasError).toBe(true);
});
```

### 4. Use Semantic Queries

```typescript
// ✅ CORRECT - Semantic queries (priority order)
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email");
screen.getByPlaceholderText("Enter email");
screen.getByText("Welcome");

// ❌ WRONG - Test IDs (use only as last resort)
screen.getByTestId("submit-button");
```

### 5. Async Testing

```typescript
// ✅ CORRECT - waitFor for async updates
it("displays user after loading", async () => {
  render(<UserProfile userId="1" />);

  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });
});

// ❌ WRONG - No waiting
it("displays user", () => {
  render(<UserProfile userId="1" />);
  expect(screen.getByText("John Doe")).toBeInTheDocument(); // May fail
});
```

## Storybook Stories

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
```

### Interactive Story

```typescript
// features/auth/ui/LoginForm.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { LoginForm } from "./LoginForm";

export default {
  title: "Features/Auth/LoginForm",
  component: LoginForm,
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof LoginForm>;

export const Default: StoryObj<typeof LoginForm> = {};

export const WithError: StoryObj<typeof LoginForm> = {
  args: {
    error: "Invalid credentials",
  },
};
```

## Mocking

### Mock API Responses

```typescript
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "@shared/api/http-client";

describe("Feature with API", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(httpClient);
  });

  afterEach(() => {
    mock.reset();
  });

  it("handles successful response", async () => {
    mock.onGet("/users").reply(200, { users: [mockUser()] });

    // Test component
  });
});
```

### Mock Modules

```typescript
// Mock entire module
vi.mock("@entities/user", () => ({
  useUser: vi.fn(() => ({
    data: mockUser(),
    isLoading: false,
    error: null,
  })),
}));

// Mock specific function
vi.spyOn(userApi, "getUser").mockResolvedValue(mockUser());
```

## Running Tests

```bash
# All tests
pnpm test

# Watch mode (auto-rerun on changes)
pnpm test:watch

# UI mode (interactive browser UI)
pnpm test:ui

# Coverage
pnpm test:coverage

# Specific file
pnpm test Button.test.tsx

# Specific test
pnpm test --grep "renders correctly"

# Update snapshots
pnpm test -u
```

## Coverage Report

After running `pnpm test:coverage`:

```
File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
All files              |   85.3  |   78.2   |   88.1  |   85.7
 shared/ui/button      |   92.0  |   87.5   |   95.0  |   92.3
  Button.tsx           |   92.0  |   87.5   |   95.0  |   92.3
```

View detailed HTML report: `open coverage/index.html`

## Test Checklist

For each component/hook/function:

- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested (null, empty, invalid)
- [ ] Loading states tested
- [ ] Disabled states tested
- [ ] Async operations tested with waitFor
- [ ] User interactions tested (click, type, etc.)
- [ ] Accessibility tested (roles, labels)
- [ ] Cleanup performed (afterEach)

## Common Patterns

### Test with Router

```typescript
import { BrowserRouter } from "react-router-dom";

const renderWithRouter = (ui: React.ReactElement) => {
  return render(ui, { wrapper: BrowserRouter });
};
```

### Test with Query Client

```typescript
const renderWithQuery = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};
```

### Test Forms

```typescript
it("submits form with valid data", async () => {
  const handleSubmit = vi.fn();
  const user = userEvent.setup();

  render(<CreateUserForm onSubmit={handleSubmit} />);

  await user.type(screen.getByLabelText("Name"), "John Doe");
  await user.type(screen.getByLabelText("Email"), "john@example.com");
  await user.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(handleSubmit).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
    });
  });
});
```

### Test Error Boundaries

```typescript
it("catches and displays error", () => {
  const ThrowError = () => {
    throw new Error("Test error");
  };

  render(
    <ErrorBoundary fallback={<div>Error occurred</div>}>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText("Error occurred")).toBeInTheDocument();
});
```

## Anti-Patterns

### ❌ WRONG: Testing implementation

```typescript
// ❌ WRONG
expect(component.state.count).toBe(1);
expect(wrapper.find(".button")).toHaveLength(1);
```

### ❌ WRONG: Not cleaning up

```typescript
// ❌ WRONG
describe("Component", () => {
  const mock = new MockAdapter(httpClient);
  // Missing afterEach cleanup!
});
```

### ❌ WRONG: Snapshot testing everything

```typescript
// ❌ WRONG - Brittle, no value
expect(container).toMatchSnapshot();
```

### ✅ CORRECT: Test behavior

```typescript
// ✅ CORRECT
expect(screen.getByRole("button")).toBeInTheDocument();
expect(screen.getByText("John Doe")).toBeInTheDocument();
```

## Quick Reference

```bash
# Test file naming
ComponentName.test.tsx   # Component tests
hookName.test.ts         # Hook tests
functionName.test.ts     # Function tests

# Story file naming
ComponentName.stories.tsx

# Test commands
pnpm test              # Run once
pnpm test:watch        # Watch mode
pnpm test:ui           # Interactive UI
pnpm test:coverage     # With coverage

# Storybook commands
pnpm storybook         # Start dev server
pnpm build-storybook   # Build static
```
