# Development Guide

## Getting Started

### Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm 9+
- VS Code or Cursor IDE (recommended)

### First Time Setup

```bash
# Clone repository
git clone <repository-url>
cd web-app

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your values
# VITE_API_BASE_URL=http://localhost:8000

# Start development server
pnpm dev
```

Open http://localhost:3000

## Daily Workflow

### 1. Pull Latest Changes

```bash
git pull origin main
pnpm install  # Update dependencies if needed
```

### 2. Create Feature Branch

```bash
git checkout -b feature/user-profile
```

### 3. Development

```bash
# Start dev server
pnpm dev

# In another terminal: run tests in watch mode
pnpm test:watch

# Start Storybook (for UI components)
pnpm storybook
```

### 4. Code Quality Checks

```bash
# Check linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Check formatting
pnpm format:check

# Format code
pnpm format

# Type check
pnpm typecheck

# Run tests
pnpm test
```

### 5. Commit Changes

Pre-commit hooks run automatically:

- ESLint (auto-fix)
- Prettier (auto-format)
- TypeScript check
- Tests for changed files

```bash
git add .
git commit -m "feat: add user profile page"
```

### 6. Push & Create MR

```bash
git push origin feature/user-profile
# Create merge request in GitLab
```

## Development Tools

### VS Code Extensions (Recommended)

- **ESLint** - Linting
- **Prettier** - Formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **TypeScript Error Translator** - Better TS errors
- **i18n Ally** - i18n management
- **Error Lens** - Inline errors

### Browser Extensions

- **React DevTools** - Inspect React components
- **TanStack Query DevTools** - Built-in (in app)

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

## Environment Variables

### Available Variables

```bash
# Required
VITE_API_BASE_URL=http://localhost:8000    # Backend API URL
VITE_APP_ENV=development                   # Environment

# Optional (with defaults)
VITE_USE_MOCKS=false                       # Enable MSW mocking
VITE_ENABLE_MSW_BUNDLE=false              # Bundle MSW in production
```

### Environment Files

- `.env.example` - Template (committed)
- `.env.local` - Local development (ignored)
- `.env.production` - Production build (ignored)

### Accessing in Code

```typescript
import { env } from "@shared/config/env";

console.log(env.VITE_API_BASE_URL);
```

All variables are validated with Zod at startup.

## Path Aliases

TypeScript and Vite are configured with path aliases:

```typescript
import { Button } from "@shared/ui"; // shared/ui/
import { useAuth } from "@features/auth"; // features/auth/
import { UserCard } from "@entities/user"; // entities/user/
```

Available aliases:

- `@app` → `src/app`
- `@pages` → `src/pages`
- `@widgets` → `src/widgets`
- `@features` → `src/features`
- `@entities` → `src/entities`
- `@shared` → `src/shared`

## API Integration

### HTTP Client

```typescript
import { httpClient } from "@shared/api/http-client";

const response = await httpClient.get("/users");
const user = UserSchema.parse(response.data);
```

### TanStack Query

```typescript
// Query
export const useUsers = () => {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => userApi.getAll(),
  });
};

// Mutation
export const useCreateUser = () => {
  return useMutation({
    mutationFn: (data: CreateUserInput) => userApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};
```

### Zod Validation

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

const response = await httpClient.get("/users/1");
const user = UserSchema.parse(response.data);
```

## State Management

### Server State (TanStack Query)

Use for data from API:

```typescript
const { data: users, isLoading } = useUsers();
```

### Client State (Zustand)

Use for UI state:

```typescript
const { theme, setTheme } = useThemeStore();
```

### URL State (nuqs)

Use for filters, pagination:

```typescript
const [search, setSearch] = useQueryState("search");
```

### Form State (React Hook Form)

Use for forms:

```typescript
const { register, handleSubmit } = useForm<LoginInput>();
```

## Internationalization

### Using Translations

```typescript
import { useTranslation } from "react-i18next";

export const Component = () => {
  const { t } = useTranslation();

  return <h1>{t("pages.home.title")}</h1>;
};
```

### Adding Translations

```typescript
// shared/i18n/config.ts
const resources = {
  en: {
    common: { greeting: "Hello" },
  },
  ru: {
    common: { greeting: "Привет" },
  },
};
```

### Switching Language

```typescript
import { useTranslation } from "react-i18next";

const { i18n } = useTranslation();

i18n.changeLanguage("ru");
```

## Testing

### Component Test

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("Button", () => {
  it("renders correctly", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
```

### Hook Test

```typescript
import { renderHook } from "@testing-library/react";

describe("useCounter", () => {
  it("increments count", () => {
    const { result } = renderHook(() => useCounter());

    act(() => result.current.increment());

    expect(result.current.count).toBe(1);
  });
});
```

### API Test

```typescript
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "@shared/api/http-client";

describe("userApi", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(httpClient);
  });

  it("fetches user", async () => {
    mock.onGet("/users/1").reply(200, mockUser());

    const user = await userApi.getById("1");

    expect(user.id).toBe("1");
  });
});
```

## Storybook

### Creating Stories

```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

export default {
  title: "UI/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export const Primary: StoryObj<typeof Button> = {
  args: {
    variant: "primary",
    children: "Button",
  },
};
```

### Viewing Stories

```bash
pnpm storybook
```

Open http://localhost:6006

## Performance

### Code Splitting

```typescript
// ✅ CORRECT - Lazy load pages
const Dashboard = lazy(() => import("@pages/dashboard"));

<Route path="/dashboard" element={
  <Suspense fallback={<Spinner />}>
    <Dashboard />
  </Suspense>
} />
```

### Virtualization

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});
```

### Memoization

```typescript
const memoizedValue = useMemo(() => expensiveCalculation(), [deps]);
const memoizedCallback = useCallback(() => { ... }, [deps]);
const MemoizedComponent = memo(Component);
```

## Debugging

### React DevTools

- Inspect component tree
- View props and state
- Profile performance

### TanStack Query DevTools

- Built-in (bottom-left corner in dev)
- View queries and mutations
- Debug cache

### Network Tab

- Inspect API calls
- Check request/response
- Debug CORS issues

## Tips

1. **Use TypeScript strictly**: Enable all strict options
2. **Test user behavior**: Not implementation details
3. **Write stories**: For all shared components
4. **Mobile-first**: Start with mobile design
5. **Accessibility**: Use semantic HTML and ARIA
6. **Performance**: Lazy load, virtualize, memoize
7. **i18n**: Use for all user-facing text
8. **Types**: Generate from Zod schemas
