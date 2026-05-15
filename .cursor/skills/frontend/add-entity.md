# Skill: Add Entity

How to add a new business entity to the application.

## When to Use

Create an entity when you have a business concept that:
- Represents domain data (User, Order, Product)
- Has API endpoints for CRUD operations
- Is shared across multiple features
- Has reusable UI representations

Examples: User, Order, Product, Comment, Notification

## Structure

```
entities/
└── <entity-name>/         # kebab-case, singular
    ├── api/               # API calls and queries
    │   ├── entityApi.ts   # API functions
    │   ├── entityQueries.ts  # TanStack Query hooks
    │   ├── entityMutations.ts # TanStack Mutations
    │   ├── schemas.ts     # Zod schemas
    │   └── index.ts
    ├── model/             # State and types
    │   ├── types.ts       # Entity types
    │   ├── constants.ts   # Entity constants
    │   └── index.ts
    ├── ui/                # UI representations
    │   ├── EntityCard.tsx # Card view
    │   ├── EntityList.tsx # List view
    │   └── index.ts
    ├── lib/               # Helpers
    │   ├── utils.ts
    │   └── index.ts
    └── index.ts           # Public API
```

## Steps

### 1. Create Entity Directory

```bash
mkdir -p src/entities/<entity-name>/api
mkdir -p src/entities/<entity-name>/model
mkdir -p src/entities/<entity-name>/ui
mkdir -p src/entities/<entity-name>/lib
```

### 2. Create Zod Schema

```typescript
// entities/<entity-name>/api/schemas.ts
import { z } from "zod";

export const EntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const EntitiesResponseSchema = z.object({
  items: z.array(EntitySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export type Entity = z.infer<typeof EntitySchema>;
export type EntitiesResponse = z.infer<typeof EntitiesResponseSchema>;
```

### 3. Create API Functions

```typescript
// entities/<entity-name>/api/entityApi.ts
import { httpClient } from "@shared/api/http-client";
import { EntitySchema, EntitiesResponseSchema } from "./schemas";
import type { Entity, CreateEntityInput, UpdateEntityInput } from "./types";

export const entityApi = {
  getAll: async (params?: GetEntitiesParams): Promise<EntitiesResponse> => {
    const response = await httpClient.get("/entities", { params });
    return EntitiesResponseSchema.parse(response.data);
  },

  getById: async (id: string): Promise<Entity> => {
    const response = await httpClient.get(`/entities/${id}`);
    return EntitySchema.parse(response.data);
  },

  create: async (data: CreateEntityInput): Promise<Entity> => {
    const response = await httpClient.post("/entities", data);
    return EntitySchema.parse(response.data);
  },

  update: async (id: string, data: UpdateEntityInput): Promise<Entity> => {
    const response = await httpClient.patch(`/entities/${id}`, data);
    return EntitySchema.parse(response.data);
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/entities/${id}`);
  },
};
```

### 4. Create Query Keys

```typescript
// entities/<entity-name>/api/queryKeys.ts
export const entityKeys = {
  all: ["entities"] as const,
  lists: () => [...entityKeys.all, "list"] as const,
  list: (filters?: GetEntitiesParams) => [...entityKeys.lists(), filters] as const,
  details: () => [...entityKeys.all, "detail"] as const,
  detail: (id: string) => [...entityKeys.details(), id] as const,
};
```

### 5. Create TanStack Query Hooks

```typescript
// entities/<entity-name>/api/entityQueries.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entityApi } from "./entityApi";
import { entityKeys } from "./queryKeys";
import type { GetEntitiesParams } from "./types";

export const useEntities = (params?: GetEntitiesParams) => {
  return useQuery({
    queryKey: entityKeys.list(params),
    queryFn: () => entityApi.getAll(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useEntity = (id: string) => {
  return useQuery({
    queryKey: entityKeys.detail(id),
    queryFn: () => entityApi.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
};

// Prefetch helper
export const usePrefetchEntity = () => {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: entityKeys.detail(id),
      queryFn: () => entityApi.getById(id),
    });
  };
};
```

### 6. Create Mutations

```typescript
// entities/<entity-name>/api/entityMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi } from "./entityApi";
import { entityKeys } from "./queryKeys";
import type { CreateEntityInput, UpdateEntityInput } from "./types";

export const useCreateEntity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEntityInput) => entityApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityKeys.lists() });
    },
  });
};

export const useUpdateEntity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEntityInput }) =>
      entityApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: entityKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: entityKeys.lists() });
    },
  });
};

export const useDeleteEntity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => entityApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityKeys.lists() });
    },
  });
};
```

### 7. Create UI Components

```typescript
// entities/<entity-name>/ui/EntityCard.tsx
import { Card } from "@shared/ui";
import type { Entity } from "../model";

export type EntityCardProps = {
  entity: Entity;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export const EntityCard = ({ entity, onEdit, onDelete }: EntityCardProps) => {
  return (
    <Card>
      <Card.Header>
        <h3>{entity.name}</h3>
      </Card.Header>
      <Card.Content>
        <p>{entity.email}</p>
        <p>Status: {entity.status}</p>
      </Card.Content>
      <Card.Footer>
        {onEdit && <Button onClick={() => onEdit(entity.id)}>Edit</Button>}
        {onDelete && <Button variant="destructive" onClick={() => onDelete(entity.id)}>Delete</Button>}
      </Card.Footer>
    </Card>
  );
};

// entities/<entity-name>/ui/index.ts
export * from "./EntityCard";
```

### 8. Create Public API

```typescript
// entities/<entity-name>/index.ts
export * from "./api";
export * from "./model";
export * from "./ui";
export * from "./lib";
```

### 9. Update Entities Index

```typescript
// entities/index.ts
export * from "./user";
export * from "./<entity-name>"; // Add this line
```

### 10. Add i18n Keys

```json
// shared/i18n/locales/en/entities.json
{
  "<entity-name>": {
    "title": "Entity",
    "name": "Name",
    "status": "Status",
    "createdAt": "Created",
    "actions": {
      "edit": "Edit",
      "delete": "Delete"
    }
  }
}
```

## Example: User Entity

```
entities/
└── user/
    ├── api/
    │   ├── userApi.ts
    │   ├── userQueries.ts
    │   ├── userMutations.ts
    │   ├── schemas.ts
    │   └── index.ts
    ├── model/
    │   ├── types.ts
    │   └── index.ts
    ├── ui/
    │   ├── UserCard.tsx
    │   ├── UserAvatar.tsx
    │   ├── UserBadge.tsx
    │   └── index.ts
    ├── lib/
    │   ├── formatUserName.ts
    │   └── index.ts
    └── index.ts
```

## Usage Example

```typescript
// In a feature
import { useUsers, useCreateUser, UserCard } from "@entities/user";

export const UserListFeature = () => {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();

  const handleCreate = (data: CreateUserInput) => {
    createUser.mutate(data);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {users?.items.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};
```

## Important Rules

1. **Entity = Singular**: Use singular form (user, not users)
2. **No Cross-Entity Imports**: Entities MUST NOT import other entities
3. **Zod Validation**: ALL API responses MUST be validated
4. **TanStack Query**: Use for ALL server state
5. **Public API**: Export through index.ts
6. **Type Safety**: All types from Zod schemas

## Common Mistakes

❌ **Plural naming**
```
entities/users/  // ❌ WRONG
```

❌ **Cross-entity imports**
```typescript
// entities/order/api/orderApi.ts
import { userApi } from "@entities/user"; // ❌ WRONG
```

❌ **No validation**
```typescript
const response = await httpClient.get("/users/1");
return response.data; // ❌ WRONG - no Zod validation
```

✅ **Correct approach**
```typescript
const response = await httpClient.get("/users/1");
return UserSchema.parse(response.data); // ✅ CORRECT
```
