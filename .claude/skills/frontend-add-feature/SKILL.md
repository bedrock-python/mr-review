---
name: frontend-add-feature
description: Add a new FSD feature (auth, create-user) — api/model/ui/lib structure, isolated logic, public API via index.ts, i18n keys.
---

# Skill: Add Feature

How to add a new feature to the application using Feature-Sliced Design.

## When to Use

Create a new feature when implementing user-facing functionality that:
- Involves user interaction (forms, buttons, actions)
- Contains business logic
- Can be isolated from other features
- May use entities from the entities layer

Examples: Login, Create User, Update Order, Export Data

## Structure

```
features/
└── <feature-name>/        # kebab-case
    ├── api/               # API calls specific to this feature
    │   ├── featureApi.ts
    │   └── index.ts
    ├── model/             # State management (Zustand stores)
    │   ├── featureStore.ts
    │   └── index.ts
    ├── ui/                # UI components
    │   ├── FeatureForm.tsx
    │   ├── FeatureButton.tsx
    │   └── index.ts
    ├── lib/               # Helpers, hooks
    │   ├── useFeature.ts
    │   ├── utils.ts
    │   └── index.ts
    └── index.ts           # Public API
```

## Steps

### 1. Create Feature Directory

```bash
mkdir -p src/features/<feature-name>/api
mkdir -p src/features/<feature-name>/model
mkdir -p src/features/<feature-name>/ui
mkdir -p src/features/<feature-name>/lib
```

### 2. Create API Layer (if needed)

```typescript
// features/<feature-name>/api/featureApi.ts
import { httpClient } from "@shared/api/http-client";
import { FeatureSchema } from "./schemas";
import type { CreateFeatureInput } from "./types";

export const featureApi = {
  create: async (data: CreateFeatureInput) => {
    const response = await httpClient.post("/features", data);
    return FeatureSchema.parse(response.data);
  },
};

// features/<feature-name>/api/index.ts
export * from "./featureApi";
export * from "./types";
```

### 3. Create Model Layer (if needed)

```typescript
// features/<feature-name>/model/featureStore.ts
import { create } from "zustand";

type FeatureState = {
  isOpen: boolean;
  data: string | null;
};

type FeatureActions = {
  open: () => void;
  close: () => void;
  setData: (data: string) => void;
};

export const useFeatureStore = create<FeatureState & FeatureActions>((set) => ({
  isOpen: false,
  data: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setData: (data) => set({ data }),
}));

// features/<feature-name>/model/index.ts
export * from "./featureStore";
```

### 4. Create UI Components

```typescript
// features/<feature-name>/ui/FeatureForm.tsx
import { useForm } from "react-hook-form";
import { Button } from "@shared/ui";

export type FeatureFormProps = {
  onSubmit: (data: FormData) => void;
};

export const FeatureForm = ({ onSubmit }: FeatureFormProps) => {
  const form = useForm();

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
      <Button type="submit">Submit</Button>
    </form>
  );
};

// features/<feature-name>/ui/index.ts
export * from "./FeatureForm";
```

### 5. Create Lib Layer (hooks, utils)

```typescript
// features/<feature-name>/lib/useFeature.ts
import { useMutation } from "@tanstack/react-query";
import { featureApi } from "../api";

export const useCreateFeature = () => {
  return useMutation({
    mutationFn: featureApi.create,
  });
};

// features/<feature-name>/lib/index.ts
export * from "./useFeature";
```

### 6. Create Public API

```typescript
// features/<feature-name>/index.ts
export * from "./ui";
export * from "./lib";
export * from "./model";
export * from "./api";
```

### 7. Add i18n Keys

```json
// shared/i18n/locales/en/features.json
{
  "<feature-name>": {
    "title": "Feature Title",
    "description": "Feature description",
    "submit": "Submit",
    "cancel": "Cancel"
  }
}
```

### 8. Update Features Index

```typescript
// features/index.ts
export * from "./<feature-name>";
```

## Important Rules

1. **Feature Isolation**: Features MUST NOT import from other features
2. **Use Entities**: If you need shared business logic, use entities layer
3. **Public API**: Only export through `index.ts`
4. **Naming**: Use kebab-case for folder, PascalCase for components
5. **Testing**: Add tests for all hooks and components

## Example: Create User Feature

```
features/
└── create-user/
    ├── api/
    │   ├── createUserApi.ts      # API call
    │   ├── schemas.ts             # Zod schemas
    │   └── index.ts
    ├── model/
    │   ├── createUserStore.ts     # Optional state
    │   └── index.ts
    ├── ui/
    │   ├── CreateUserForm.tsx     # Main form
    │   ├── CreateUserButton.tsx   # Trigger button
    │   └── index.ts
    ├── lib/
    │   ├── useCreateUser.ts       # TanStack Query hook
    │   ├── validation.ts          # Form validation
    │   └── index.ts
    └── index.ts
```

## Usage

```typescript
// In a page or widget
import { CreateUserForm, useCreateUser } from "@features/create-user";

export const UsersPage = () => {
  const createUser = useCreateUser();

  const handleSubmit = (data: CreateUserInput) => {
    createUser.mutate(data);
  };

  return <CreateUserForm onSubmit={handleSubmit} />;
};
```

## Common Mistakes

❌ **Cross-feature imports**
```typescript
// features/create-user/ui/Form.tsx
import { useAuth } from "@features/auth"; // ❌ WRONG
```

✅ **Use entities instead**
```typescript
import { useUser } from "@entities/user"; // ✅ CORRECT
```

❌ **No public API**
```typescript
import { Form } from "@features/create-user/ui/Form"; // ❌ WRONG
```

✅ **Use public API**
```typescript
import { CreateUserForm } from "@features/create-user"; // ✅ CORRECT
```
