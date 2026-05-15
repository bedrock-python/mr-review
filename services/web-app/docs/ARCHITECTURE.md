# Architecture Guide

## Feature-Sliced Design (FSD)

This project follows Feature-Sliced Design methodology for maintainable and scalable frontend architecture.

## Layer Structure

### 1. App Layer

**Purpose**: Application initialization and global configuration

```
app/
├── providers/     # React context providers
├── routes/        # Route configuration
└── styles/        # Global styles
```

**Responsibilities:**

- Initialize providers (Query, Theme, i18n, Router)
- Configure routing
- Setup global error boundaries
- Apply global styles

### 2. Pages Layer

**Purpose**: Application routes and page-level components

```
pages/
├── home/
├── login/
└── user-profile/
```

**Responsibilities:**

- Route entry points
- Compose widgets and features
- Page-level state
- SEO metadata

**Example:**

```typescript
export const DashboardPage = () => {
  return (
    <AppLayout>
      <Header />
      <UserList />
      <CreateUserButton />
    </AppLayout>
  );
};
```

### 3. Widgets Layer

**Purpose**: Complex composite UI blocks used across pages

```
widgets/
├── header/
├── sidebar/
└── footer/
```

**Responsibilities:**

- Compose features and entities
- Layout components
- Reusable page sections
- NO business logic

**Example:**

```typescript
export const Header = () => {
  const { user } = useAuth();

  return (
    <header>
      <Logo />
      <Navigation />
      <UserMenu user={user} />
    </header>
  );
};
```

### 4. Features Layer

**Purpose**: Business features and user interactions

```
features/
├── auth/
│   ├── api/
│   ├── model/
│   ├── ui/
│   └── lib/
└── create-user/
```

**Responsibilities:**

- Business logic
- User interactions
- Forms and actions
- Feature-specific state

**Example:**

```typescript
export const LoginFeature = () => {
  const { login } = useAuth();

  const handleSubmit = async (data: LoginInput) => {
    await login.mutateAsync(data);
  };

  return <LoginForm onSubmit={handleSubmit} />;
};
```

### 5. Entities Layer

**Purpose**: Business entities and domain models

```
entities/
├── user/
│   ├── api/        # API calls
│   ├── model/      # Types, schemas
│   ├── ui/         # Entity UI
│   └── lib/        # Helpers
└── order/
```

**Responsibilities:**

- Domain data models
- CRUD operations
- Reusable entity UI
- Entity helpers

**Example:**

```typescript
// entities/user/api/userApi.ts
export const userApi = {
  getAll: async () => { ... },
  getById: async (id) => { ... },
  create: async (data) => { ... },
};

// entities/user/ui/UserCard.tsx
export const UserCard = ({ user }: { user: User }) => {
  return <Card>{user.name}</Card>;
};
```

### 6. Shared Layer

**Purpose**: Reusable code with no business logic

```
shared/
├── ui/             # UI primitives
├── lib/            # Utilities, hooks
├── api/            # HTTP client
├── config/         # App configuration
└── types/          # Global types
```

**Responsibilities:**

- Generic UI components (Button, Input)
- Utility functions
- HTTP client
- Type definitions

## Dependency Rules

### Import Flow

```
app → pages → widgets → features → entities → shared
```

### Allowed Imports

| Layer    | Can Import From                            |
| -------- | ------------------------------------------ |
| app      | pages, widgets, features, entities, shared |
| pages    | widgets, features, entities, shared        |
| widgets  | features, entities, shared                 |
| features | entities, shared                           |
| entities | shared                                     |
| shared   | - (nothing)                                |

### Cross-Imports (Within Same Layer)

- **Pages**: ✅ Can import other pages
- **Widgets**: ❌ Cannot import other widgets
- **Features**: ❌ Cannot import other features (use entities)
- **Entities**: ❌ Cannot import other entities

## Public API Pattern

Every FSD slice exports through `index.ts`:

```typescript
// features/auth/index.ts
export { LoginForm } from "./ui/LoginForm";
export { useAuth } from "./model/useAuth";
export type { LoginInput } from "./model/types";

// ✅ CORRECT - Import from public API
import { LoginForm, useAuth } from "@features/auth";

// ❌ WRONG - Direct import
import { LoginForm } from "@features/auth/ui/LoginForm";
```

## Feature Isolation

Features are isolated from each other. If you need to share logic:

### ❌ WRONG: Feature imports another feature

```typescript
// features/create-order/model/useCreateOrder.ts
import { useAuth } from "@features/auth"; // ❌ WRONG
```

### ✅ CORRECT: Extract to entity

```typescript
// entities/session/model/useSession.ts
export const useSession = () => { ... };

// features/create-order/model/useCreateOrder.ts
import { useSession } from "@entities/session"; // ✅ CORRECT
```

## Component Structure

### Feature Structure

```
features/auth/
├── api/
│   ├── authApi.ts        # API functions
│   └── index.ts
├── model/
│   ├── useAuth.ts        # Main hook
│   ├── types.ts          # Types
│   └── index.ts
├── ui/
│   ├── LoginForm.tsx     # UI components
│   └── index.ts
├── lib/
│   ├── validateToken.ts  # Helpers
│   └── index.ts
└── index.ts              # Public API
```

### Entity Structure

```
entities/user/
├── api/
│   ├── userApi.ts        # API functions
│   ├── userQueries.ts    # TanStack Query hooks
│   ├── schemas.ts        # Zod schemas
│   └── index.ts
├── model/
│   ├── types.ts          # Types (from schemas)
│   └── index.ts
├── ui/
│   ├── UserCard.tsx      # Entity UI
│   ├── UserAvatar.tsx
│   └── index.ts
├── lib/
│   ├── formatUser.ts     # Helpers
│   └── index.ts
└── index.ts              # Public API
```

## Best Practices

### 1. Layer Separation

- Keep business logic in features
- Keep data models in entities
- Keep UI primitives in shared

### 2. Type Safety

- Use Zod for runtime validation
- Explicit return types
- No `any` types

### 3. Performance

- Lazy load pages
- Virtualize long lists
- Memoize expensive operations

### 4. Accessibility

- Semantic HTML
- Keyboard navigation
- ARIA attributes
- Screen reader support

### 5. Internationalization

- Use i18n for ALL user-facing text
- Support English (default) and Russian
- Type-safe translation keys

## Common Patterns

### API Integration

```typescript
// entities/user/api/userApi.ts
export const getUser = async (id: string): Promise<User> => {
  const response = await httpClient.get(`/users/${id}`);
  return UserSchema.parse(response.data);
};

// entities/user/api/userQueries.ts
export const useUser = (id: string) => {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id),
  });
};
```

### State Management

```typescript
// Server state: TanStack Query
const { data, isLoading } = useUsers();

// Client state: Zustand
const { theme, setTheme } = useThemeStore();

// URL state: nuqs
const [search, setSearch] = useQueryState("search");

// Form state: React Hook Form
const { register, handleSubmit } = useForm();
```

### Error Handling

```typescript
const { data, error, isError } = useUser(id);

if (isError) {
  return <ErrorState error={error} />;
}
```

## Learn More

- Explore `src/` for code examples
- Check `TECH_STACK.md` for technology decisions
