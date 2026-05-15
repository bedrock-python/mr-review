# Naming Conventions

Strict naming conventions for files, folders, and code elements.

## Summary Table

| Element | Convention | Example |
|---------|------------|---------|
| **Folders** | kebab-case | `user-profile/`, `create-order/` |
| **Components** | PascalCase.tsx | `UserProfile.tsx`, `Button.tsx` |
| **Hooks** | camelCase.ts (use prefix) | `useAuth.ts`, `useDebounce.ts` |
| **Utils** | camelCase.ts | `formatDate.ts`, `cn.ts` |
| **Constants** | UPPER_CASE.ts | `API_ROUTES.ts`, `COLORS.ts` |
| **Types** | camelCase.types.ts | `user.types.ts`, `api.types.ts` |
| **Tests** | *.test.tsx | `Button.test.tsx` |
| **Stories** | *.stories.tsx | `Button.stories.tsx` |
| **Schemas** | camelCase.schema.ts | `user.schema.ts` |

## Folders

**ALWAYS use kebab-case**

```
✅ CORRECT
src/
├── user-profile/
├── create-order/
├── api-integration/
└── auth-provider/

❌ WRONG
src/
├── UserProfile/
├── createOrder/
├── api_integration/
└── authProvider/
```

### FSD Layer Folders

```
src/
├── app/                    # lowercase
├── pages/
│   ├── home/              # kebab-case
│   ├── user-profile/
│   └── order-history/
├── widgets/
│   ├── header/
│   ├── sidebar/
│   └── user-menu/
├── features/
│   ├── auth/
│   ├── create-user/
│   └── update-order/
├── entities/
│   ├── user/
│   ├── order/
│   └── product/
└── shared/
    ├── ui/
    ├── lib/
    └── api/
```

## Files

### React Components

**PascalCase.tsx**

```
✅ CORRECT
Button.tsx
UserProfile.tsx
CreateOrderForm.tsx
DataTable.tsx

❌ WRONG
button.tsx
userProfile.tsx
create-order-form.tsx
data_table.tsx
```

### Hooks

**camelCase.ts with "use" prefix**

```
✅ CORRECT
useAuth.ts
useDebounce.ts
useLocalStorage.ts
usePagination.ts

❌ WRONG
UseAuth.ts
auth.ts
use-debounce.ts
hook_auth.ts
```

### Utilities

**camelCase.ts**

```
✅ CORRECT
formatDate.ts
validateEmail.ts
cn.ts
parseJSON.ts

❌ WRONG
FormatDate.ts
validate-email.ts
CN.ts
parse_json.ts
```

### Constants

**UPPER_CASE.ts**

```
✅ CORRECT
API_ROUTES.ts
VALIDATION_RULES.ts
COLORS.ts
CONFIG.ts

❌ WRONG
apiRoutes.ts
ValidationRules.ts
colors.ts
config.ts
```

### Types

**camelCase.types.ts**

```
✅ CORRECT
user.types.ts
api.types.ts
common.types.ts

❌ WRONG
User.types.ts
API.types.ts
types.ts
```

### Schemas (Zod)

**camelCase.schema.ts**

```
✅ CORRECT
user.schema.ts
auth.schema.ts
validation.schema.ts

❌ WRONG
User.schema.ts
userSchema.ts
user-schema.ts
```

### Tests

**matchingFile.test.tsx**

```
✅ CORRECT
Button.test.tsx
useAuth.test.ts
formatDate.test.ts

❌ WRONG
Button.spec.tsx
useAuth-test.ts
test_formatDate.ts
```

### Storybook Stories

**matchingFile.stories.tsx**

```
✅ CORRECT
Button.stories.tsx
UserCard.stories.tsx
Modal.stories.tsx

❌ WRONG
Button.story.tsx
UserCard-stories.tsx
modal_stories.tsx
```

## Code Elements

### Components

**PascalCase, named export**

```typescript
// ✅ CORRECT
export const UserProfile = () => { ... };
export const CreateOrderButton = () => { ... };
export const DataTable = () => { ... };

// ❌ WRONG
export const userProfile = () => { ... };
export default function UserProfile() { ... };
export const user_profile = () => { ... };
```

### Component Props

**PascalCase + "Props" suffix**

```typescript
// ✅ CORRECT
export type ButtonProps = { ... };
export type UserProfileProps = { ... };
export type DataTableProps = { ... };

// ❌ WRONG
export type Button = { ... };
export type IButtonProps = { ... };
export type buttonProps = { ... };
```

### Hooks

**camelCase with "use" prefix**

```typescript
// ✅ CORRECT
export const useAuth = () => { ... };
export const useDebounce = () => { ... };
export const useLocalStorage = () => { ... };

// ❌ WRONG
export const UseAuth = () => { ... };
export const auth = () => { ... };
export const getAuth = () => { ... };
```

### Functions

**camelCase, verb prefix**

```typescript
// ✅ CORRECT
export const formatDate = (date: Date) => { ... };
export const validateEmail = (email: string) => { ... };
export const parseJSON = (json: string) => { ... };
export const fetchUsers = async () => { ... };

// ❌ WRONG
export const FormatDate = () => { ... };
export const date_formatter = () => { ... };
export const DateFormat = () => { ... };
```

### Constants

**UPPER_CASE**

```typescript
// ✅ CORRECT
export const API_BASE_URL = "https://api.example.com";
export const MAX_RETRIES = 3;
export const DEFAULT_PAGE_SIZE = 20;

// ❌ WRONG
export const apiBaseUrl = "...";
export const maxRetries = 3;
export const default_page_size = 20;
```

### Types/Interfaces

**PascalCase, prefer "type" over "interface"**

```typescript
// ✅ CORRECT
export type User = { ... };
export type ApiResponse<T> = { ... };
export type UserRole = "admin" | "user";

// ❌ WRONG
export interface User { ... }
export type user = { ... };
export type IUser = { ... };
```

### Enums (avoid, use union types instead)

```typescript
// ✅ CORRECT - Union type (preferred)
export type UserRole = "admin" | "user" | "guest";

// ⚠️ ACCEPTABLE - Const object
export const UserRole = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

// ❌ WRONG - Enum
export enum UserRole {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest",
}
```

### Boolean Variables

**is/has/should prefix**

```typescript
// ✅ CORRECT
const isLoading = true;
const hasError = false;
const shouldRefetch = true;
const canEdit = false;

// ❌ WRONG
const loading = true;
const error = false;
const refetch = true;
const editable = false;
```

### Event Handlers

**handle + EventName**

```typescript
// ✅ CORRECT - Component internal
const handleClick = () => { ... };
const handleSubmit = () => { ... };
const handleInputChange = () => { ... };

// ✅ CORRECT - Props
type ButtonProps = {
  onClick?: () => void;
  onSubmit?: () => void;
  onChange?: () => void;
};

// ❌ WRONG
const click = () => { ... };
const submitHandler = () => { ... };
const onClickHandler = () => { ... };
```

### Zustand Stores

**use + Name + Store**

```typescript
// ✅ CORRECT
export const useAuthStore = create(() => ({ ... }));
export const useUserStore = create(() => ({ ... }));
export const useSidebarStore = create(() => ({ ... }));

// ❌ WRONG
export const authStore = create(() => ({ ... }));
export const useAuth = create(() => ({ ... }));
export const AuthStore = create(() => ({ ... }));
```

### TanStack Query Keys

**entity + action**

```typescript
// ✅ CORRECT
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: Filters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// ❌ WRONG
export const UserKeys = { ... };
export const keys = { ... };
export const QUERY_KEYS = { ... };
```

## Public API Exports

### index.ts Pattern

**Each module exports through index.ts**

```typescript
// features/auth/index.ts
// ✅ CORRECT - Re-export public API
export { LoginForm, SignupForm } from "./ui";
export { useAuth, useLogin } from "./lib";
export { authApi } from "./api";
export type { LoginFormProps, SignupFormProps } from "./ui";

// ❌ WRONG - Export everything
export * from "./ui";
export * from "./lib";
export * from "./api";
```

## Special Files

### Configuration Files

```
✅ CORRECT
vite.config.ts
eslint.config.js
tsconfig.json
tailwind.config.ts
vitest.config.ts

❌ WRONG
viteConfig.ts
eslint.js
ts-config.json
tailwind-config.ts
```

### Environment Files

```
✅ CORRECT
.env
.env.local
.env.development
.env.production
.env.example

❌ WRONG
env.ts
environment.ts
.env.dev
```

## Import Aliases

**Use @ prefix for path aliases**

```typescript
// ✅ CORRECT
import { Button } from "@shared/ui";
import { useAuth } from "@features/auth";
import { User } from "@entities/user";

// ❌ WRONG
import { Button } from "~/shared/ui";
import { Button } from "shared/ui";
import { Button } from "../../../shared/ui";
```

## Quick Reference

```
📁 Folders:           kebab-case
📄 Components:        PascalCase.tsx
🪝 Hooks:             camelCase.ts (use prefix)
🔧 Utils:             camelCase.ts
📊 Constants:         UPPER_CASE.ts
📝 Types:             camelCase.types.ts
✅ Tests:             MatchingFile.test.tsx
📖 Stories:           MatchingFile.stories.tsx
🔍 Schemas:           camelCase.schema.ts

💻 Code:
   - Components:      PascalCase
   - Functions:       camelCase
   - Constants:       UPPER_CASE
   - Types:           PascalCase
   - Props:           ComponentNameProps
   - Booleans:        is/has/should prefix
   - Handlers:        handle prefix
```
