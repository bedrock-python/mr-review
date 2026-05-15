# Code Style Standards

This project enforces strict TypeScript and React coding standards.

## Language Standards

- **TypeScript version**: 5.8+
- **React version**: 19+
- **Line Length**: 100 characters
- **Quotes**: Double quotes for strings
- **Semicolons**: Required
- **Indentation**: 2 spaces

## TypeScript Rules

### Type vs Interface

**ALWAYS use `type`, NOT `interface`**

```typescript
// ✅ CORRECT
export type UserProps = {
  id: string;
  name: string;
};

// ❌ WRONG
export interface UserProps {
  id: string;
  name: string;
}
```

**Why**: Consistency and better type inference in complex scenarios.

### Type Annotations

**ALL functions and variables MUST have explicit type annotations**

```typescript
// ✅ CORRECT
export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export const getUserById = async (id: string): Promise<User> => {
  const response = await apiClient.get<User>(`/users/${id}`);
  return response.data;
};

// ❌ WRONG - missing return type
export const formatDate = (date: Date) => {
  return date.toISOString();
};
```

### No Explicit Any

**NEVER use `any`**

```typescript
// ❌ WRONG
const data: any = await fetch("/api");

// ✅ CORRECT
const data: unknown = await fetch("/api");
const user = UserSchema.parse(data);

// ✅ CORRECT - generic unknown
const parseJSON = <T>(json: string): T => {
  return JSON.parse(json) as T;
};
```

### Modern Type Syntax

```typescript
// ✅ CORRECT - built-in types
type Numbers = number[];
type StringMap = Record<string, string>;
type Optional = string | null;
type Nullable = string | undefined;

// ❌ WRONG - old typing module
import type { List, Dict, Optional } from "typing";
```

## Naming Conventions

### Files and Folders

| Type | Convention | Example |
|------|------------|---------|
| **Folders** | kebab-case | `user-profile/`, `create-order/` |
| **Components** | PascalCase.tsx | `UserProfile.tsx`, `CreateOrderForm.tsx` |
| **Hooks** | camelCase.ts | `useAuth.ts`, `usePagination.ts` |
| **Utils** | camelCase.ts | `formatDate.ts`, `validateEmail.ts` |
| **Constants** | UPPER_CASE.ts | `API_ROUTES.ts`, `VALIDATION_RULES.ts` |
| **Types** | camelCase.types.ts | `user.types.ts`, `api.types.ts` |
| **Tests** | *.test.tsx | `Button.test.tsx`, `useAuth.test.ts` |

### Components

```typescript
// ✅ CORRECT - PascalCase, named export
export const UserProfile = ({ userId }: UserProfileProps) => {
  return <div>Profile: {userId}</div>;
};

// ❌ WRONG - default export
export default function UserProfile({ userId }: UserProfileProps) {
  return <div>Profile: {userId}</div>;
}

// ❌ WRONG - camelCase
export const userProfile = () => { ... };
```

### Hooks

```typescript
// ✅ CORRECT - use prefix, camelCase
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  return { user, setUser };
};

// ❌ WRONG - no use prefix
export const auth = () => { ... };
```

### Props Types

```typescript
// ✅ CORRECT - ComponentNameProps suffix
export type ButtonProps = {
  variant: "primary" | "secondary";
  children: React.ReactNode;
};

export const Button = ({ variant, children }: ButtonProps) => { ... };

// ❌ WRONG - no Props suffix
export type Button = { ... };
```

### Constants

```typescript
// ✅ CORRECT - UPPER_CASE
export const API_BASE_URL = "https://api.example.com";
export const MAX_RETRY_ATTEMPTS = 3;

// ❌ WRONG - camelCase
export const apiBaseUrl = "https://api.example.com";
```

## React Patterns

### Component Definition

**Use function components with named exports**

```typescript
// ✅ CORRECT
export type UserCardProps = {
  user: User;
  onEdit?: (id: string) => void;
};

export const UserCard = ({ user, onEdit }: UserCardProps) => {
  return (
    <div>
      <h3>{user.name}</h3>
      {onEdit && <button onClick={() => onEdit(user.id)}>Edit</button>}
    </div>
  );
};

// ❌ WRONG - default export
export default function UserCard(props: UserCardProps) { ... }

// ❌ WRONG - React.FC (deprecated in React 19)
export const UserCard: React.FC<UserCardProps> = (props) => { ... };
```

### Props Destructuring

```typescript
// ✅ CORRECT - destructure in params
export const Button = ({ variant, children, onClick }: ButtonProps) => {
  return <button onClick={onClick}>{children}</button>;
};

// ❌ WRONG - props object
export const Button = (props: ButtonProps) => {
  return <button onClick={props.onClick}>{props.children}</button>;
};
```

### Event Handlers

```typescript
// ✅ CORRECT - handleEventName
const handleClick = () => { ... };
const handleSubmit = (event: FormEvent) => { ... };
const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => { ... };

// ❌ WRONG - onEventName (reserved for props)
const onClick = () => { ... };
```

### Boolean Props

```typescript
// ✅ CORRECT - is/has/should prefix
type ModalProps = {
  isOpen: boolean;
  hasCloseButton: boolean;
  shouldCloseOnEsc: boolean;
};

// ❌ WRONG - no prefix
type ModalProps = {
  open: boolean;
  closeButton: boolean;
};
```

## Import Organization

**Order (enforced by ESLint):**

1. React imports
2. Third-party libraries
3. Internal aliases (@app, @features, etc.)
4. Relative imports
5. Type imports (separate)

```typescript
// ✅ CORRECT
import { useState, useEffect } from "react";

import { z } from "zod";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@shared/ui";
import { useAuth } from "@features/auth";

import { formatDate } from "./utils";

import type { User } from "@entities/user";
import type { ApiResponse } from "./types";

// ❌ WRONG - mixed order
import type { User } from "@entities/user";
import { Button } from "@shared/ui";
import { useState } from "react";
```

### Type Imports

**Use `import type` for types**

```typescript
// ✅ CORRECT
import type { User } from "@entities/user";
import type { FC, ReactNode } from "react";

// ❌ WRONG - value import for types
import { User } from "@entities/user";
import { FC, ReactNode } from "react";
```

## Code Quality Rules

### No Default Exports

```typescript
// ✅ CORRECT - named export
export const Button = () => { ... };

// ❌ WRONG - default export
export default Button;
```

**Why**: Better refactoring, explicit imports, tree-shaking.

### No Console Logs

```typescript
// ❌ WRONG in production code
console.log("User data:", user);

// ✅ CORRECT - structured logging
logger.info("User data fetched", { userId: user.id });

// ✅ ALLOWED - warnings and errors
console.warn("Deprecated API used");
console.error("Failed to fetch user", error);
```

### Prefer const

```typescript
// ✅ CORRECT
const maxItems = 10;
const items = [1, 2, 3];

// ❌ WRONG - unnecessary let
let maxItems = 10;
let items = [1, 2, 3];
```

### No Magic Numbers

```typescript
// ❌ WRONG
if (items.length > 10) { ... }
setTimeout(callback, 5000);

// ✅ CORRECT
const MAX_ITEMS = 10;
const DEBOUNCE_DELAY_MS = 5000;

if (items.length > MAX_ITEMS) { ... }
setTimeout(callback, DEBOUNCE_DELAY_MS);
```

## Comments

**Comments should explain WHY, not WHAT**

```typescript
// ❌ WRONG - obvious comment
// Set user to null
setUser(null);

// ✅ CORRECT - explains reasoning
// Clear user data to force re-authentication after token refresh
setUser(null);

// ✅ CORRECT - documents non-obvious behavior
// We use setTimeout to defer the state update until after the current
// render cycle, preventing React hydration mismatch
setTimeout(() => setTheme("dark"), 0);
```

## Prohibited Practices

- ❌ No `any` type
- ❌ No default exports
- ❌ No `React.FC` (use function components)
- ❌ No console.log in production
- ❌ No TODO/FIXME comments (create issues instead)
- ❌ No unused variables/imports
- ❌ No magic numbers
- ❌ No non-null assertions (`!`) without justification
