---
name: frontend-add-page
description: Add a new route page — page component, types, route registration with lazy loading + Suspense, i18n, navigation links, protected/dynamic routes.
---

# Skill: Add Page

How to add a new page (route) to the application.

## When to Use

Create a new page when adding a new route/URL to your application.

Examples: Dashboard, User Profile, Settings, Analytics

## Structure

```
pages/
└── <page-name>/           # kebab-case
    ├── PageName.tsx       # Main page component
    ├── types.ts           # Page-specific types
    ├── index.ts           # Public API
    └── PageName.test.tsx  # Optional tests
```

## Steps

### 1. Create Page Directory

```bash
mkdir -p src/pages/<page-name>
```

### 2. Create Page Component

```typescript
// pages/<page-name>/PageName.tsx
import type { PageNameProps } from "./types";

export const PageName = ({ param }: PageNameProps) => {
  // Page logic

  return (
    <div>
      <h1>Page Title</h1>
      {/* Page content using widgets and features */}
    </div>
  );
};
```

### 3. Create Types (if needed)

```typescript
// pages/<page-name>/types.ts
export type PageNameProps = {
  param?: string;
};
```

### 4. Create Public API

```typescript
// pages/<page-name>/index.ts
export { PageName } from "./PageName";
export type { PageNameProps } from "./types";
```

### 5. Add Route

```typescript
// app/routes/index.tsx
import { lazy } from "react";

// ✅ CORRECT - Lazy load pages
const PageName = lazy(() => import("@pages/page-name").then(m => ({ default: m.PageName })));

export const routes = [
  {
    path: "/page-name",
    element: (
      <Suspense fallback={<Spinner />}>
        <PageName />
      </Suspense>
    ),
  },
];
```

### 6. Update Pages Index

```typescript
// pages/index.ts
export { HomePage } from "./home";
export { PageName } from "./page-name"; // Add this line
```

### 7. Add i18n Keys

```json
// shared/i18n/locales/en/pages.json
{
  "page-name": {
    "title": "Page Title",
    "description": "Page description"
  }
}
```

### 8. Add Navigation Link (if needed)

```typescript
// widgets/sidebar/Sidebar.tsx
import { Link } from "react-router-dom";

<Link to="/page-name">
  Page Name
</Link>
```

## Example: User Profile Page

```
pages/
└── user-profile/
    ├── UserProfile.tsx
    ├── types.ts
    └── index.ts
```

```typescript
// pages/user-profile/UserProfile.tsx
import { useParams } from "react-router-dom";
import { useUser } from "@entities/user";
import { UserCard } from "@entities/user";

export const UserProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const { data: user, isLoading } = useUser(userId!);

  if (isLoading) return <Spinner />;
  if (!user) return <NotFound />;

  return (
    <div>
      <h1>User Profile</h1>
      <UserCard user={user} />
    </div>
  );
};

// pages/user-profile/index.ts
export { UserProfile } from "./UserProfile";

// app/routes/index.tsx
const UserProfile = lazy(() => import("@pages/user-profile").then(m => ({ default: m.UserProfile })));

{
  path: "/users/:userId",
  element: <Suspense fallback={<Spinner />}><UserProfile /></Suspense>,
}
```

## Important Rules

1. **Lazy Loading**: ALWAYS use lazy loading for pages
2. **Suspense**: Wrap lazy components in Suspense
3. **Naming**: Page component matches folder (UserProfile → user-profile)
4. **Dependencies**: Pages can import from widgets, features, entities, shared
5. **SEO**: Add meta tags for public pages

## Page Composition Pattern

```typescript
// ✅ CORRECT - Compose from lower layers
export const DashboardPage = () => {
  return (
    <>
      <Header />  {/* widget */}
      <div className="flex">
        <Sidebar />  {/* widget */}
        <main>
          <UserList />  {/* feature */}
          <CreateUserButton />  {/* feature */}
        </main>
      </div>
    </>
  );
};
```

## Protected Routes

```typescript
// app/routes/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@features/auth";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// app/routes/index.tsx
{
  path: "/dashboard",
  element: (
    <ProtectedRoute>
      <Suspense fallback={<Spinner />}>
        <Dashboard />
      </Suspense>
    </ProtectedRoute>
  ),
}
```

## Dynamic Routes

```typescript
// app/routes/index.tsx
const routes = [
  {
    path: "/users/:userId",
    element: <UserProfile />,
  },
  {
    path: "/orders/:orderId/edit",
    element: <EditOrder />,
  },
];

// In component
import { useParams } from "react-router-dom";

const { userId } = useParams<{ userId: string }>();
```

## Nested Routes

```typescript
// app/routes/index.tsx
{
  path: "/settings",
  element: <SettingsLayout />,
  children: [
    { path: "profile", element: <ProfileSettings /> },
    { path: "security", element: <SecuritySettings /> },
    { path: "billing", element: <BillingSettings /> },
  ],
}
```

## Common Mistakes

❌ **Not lazy loading**
```typescript
import { Dashboard } from "@pages/dashboard"; // ❌ WRONG
```

❌ **Default export**
```typescript
export default Dashboard; // ❌ WRONG
```

❌ **No Suspense**
```typescript
const Dashboard = lazy(() => import("@pages/dashboard"));
<Dashboard /> // ❌ WRONG - no Suspense
```
