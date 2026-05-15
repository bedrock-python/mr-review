---
name: frontend-add-widget
description: Add a new widget (Header, Sidebar, layout block) — composition of features/entities, sub-components, no business logic, public API.
---

# Skill: Add Widget

How to add a new widget (complex composite UI block) to the application.

## When to Use

Create a widget when you need:
- Complex UI block used across multiple pages
- Composition of features and entities
- Layout components (Header, Sidebar, Footer)
- Reusable page sections (UserMenu, Breadcrumbs)

Examples: Header, Sidebar, Footer, UserMenu, Notifications Panel

## Structure

```
widgets/
└── <widget-name>/         # kebab-case
    ├── WidgetName.tsx     # Main widget component
    ├── types.ts           # Widget types
    ├── constants.ts       # Widget constants
    ├── components/        # Sub-components (optional)
    │   ├── SubComponent.tsx
    │   └── index.ts
    └── index.ts           # Public API
```

## Steps

### 1. Create Widget Directory

```bash
mkdir -p src/widgets/<widget-name>
mkdir -p src/widgets/<widget-name>/components
```

### 2. Create Widget Component

```typescript
// widgets/<widget-name>/WidgetName.tsx
import { useAuth } from "@features/auth";
import { UserAvatar } from "@entities/user";
import { Button } from "@shared/ui";
import type { WidgetNameProps } from "./types";

export const WidgetName = ({ className }: WidgetNameProps) => {
  const { user } = useAuth();

  return (
    <div className={className}>
      {/* Compose features and entities */}
      <UserAvatar user={user} />
      <Button>Action</Button>
    </div>
  );
};
```

### 3. Create Types

```typescript
// widgets/<widget-name>/types.ts
export type WidgetNameProps = {
  className?: string;
};
```

### 4. Create Sub-components (if needed)

```typescript
// widgets/header/components/UserMenu.tsx
import { DropdownMenu } from "@shared/ui";
import { useAuth } from "@features/auth";

export const UserMenu = () => {
  const { user, logout } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <UserAvatar user={user} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onClick={() => navigate("/profile")}>
          Profile
        </DropdownMenu.Item>
        <DropdownMenu.Item onClick={logout}>
          Logout
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
```

### 5. Create Public API

```typescript
// widgets/<widget-name>/index.ts
export { WidgetName } from "./WidgetName";
export type { WidgetNameProps } from "./types";
```

### 6. Update Widgets Index

```typescript
// widgets/index.ts
export { Header } from "./header";
export { Sidebar } from "./sidebar";
export { WidgetName } from "./<widget-name>"; // Add this line
```

## Example: Header Widget

```
widgets/
└── header/
    ├── Header.tsx
    ├── types.ts
    ├── components/
    │   ├── Logo.tsx
    │   ├── Navigation.tsx
    │   ├── UserMenu.tsx
    │   └── index.ts
    └── index.ts
```

```typescript
// widgets/header/Header.tsx
import { Logo, Navigation, UserMenu } from "./components";
import type { HeaderProps } from "./types";

export const Header = ({ className }: HeaderProps) => {
  return (
    <header className={cn("border-b bg-background", className)}>
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <Navigation />
        </div>
        <UserMenu />
      </div>
    </header>
  );
};

// widgets/header/components/Navigation.tsx
import { Link, useLocation } from "react-router-dom";
import { cn } from "@shared/lib";

const navItems = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/users", label: "Users" },
  { path: "/settings", label: "Settings" },
];

export const Navigation = () => {
  const location = useLocation();

  return (
    <nav className="flex items-center gap-6">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            location.pathname === item.path
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};

// widgets/header/components/UserMenu.tsx
import { DropdownMenu } from "@shared/ui";
import { useAuth } from "@features/auth";
import { UserAvatar } from "@entities/user";

export const UserMenu = () => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <UserAvatar user={user} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Label>{user.name}</DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item>
          Profile
        </DropdownMenu.Item>
        <DropdownMenu.Item>
          Settings
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={logout}>
          Logout
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
```

## Example: Sidebar Widget

```typescript
// widgets/sidebar/Sidebar.tsx
import { Link, useLocation } from "react-router-dom";
import { Home, Users, Settings, LogOut } from "lucide-react";
import { cn } from "@shared/lib";
import { useAuth } from "@features/auth";
import type { SidebarProps } from "./types";

const navigationItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/users", label: "Users", icon: Users },
  { path: "/settings", label: "Settings", icon: Settings },
];

export const Sidebar = ({ className }: SidebarProps) => {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <aside className={cn("flex h-screen w-64 flex-col border-r bg-background", className)}>
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">AIOps</h1>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </aside>
  );
};
```

## Important Rules

1. **Composition**: Widgets compose features, entities, and shared components
2. **No Business Logic**: Complex logic should be in features
3. **Reusability**: Widgets should be reusable across pages
4. **Isolation**: Widgets MUST NOT import from other widgets
5. **Props**: Accept only presentation props, not data-fetching props

## Widget Composition Pattern

```typescript
// ✅ CORRECT - Widget composes from lower layers
export const Dashboard = () => {
  const { user } = useAuth(); // feature
  const { data: stats } = useStats(); // entity

  return (
    <div>
      <UserAvatar user={user} /> {/* entity UI */}
      <StatCard stats={stats} /> {/* entity UI */}
      <Button>Action</Button> {/* shared UI */}
    </div>
  );
};
```

## Layout Widgets

### App Layout

```typescript
// widgets/layout/AppLayout.tsx
import { Outlet } from "react-router-dom";
import { Header } from "@widgets/header";
import { Sidebar } from "@widgets/sidebar";

export const AppLayout = () => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
```

## Common Mistakes

### ❌ WRONG: Cross-widget imports

```typescript
// widgets/header/Header.tsx
import { Sidebar } from "@widgets/sidebar"; // ❌ WRONG
```

### ❌ WRONG: Business logic in widget

```typescript
// widgets/user-panel/UserPanel.tsx
export const UserPanel = () => {
  const createUser = useCreateUser(); // ❌ WRONG - mutation logic

  const handleCreate = async (data) => {
    // Complex business logic
  };
};
```

### ✅ CORRECT: Delegate to features

```typescript
// widgets/user-panel/UserPanel.tsx
import { CreateUserButton } from "@features/create-user";

export const UserPanel = () => {
  return (
    <div>
      <CreateUserButton /> {/* Feature handles logic */}
    </div>
  );
};
```

## Quick Reference

```bash
# Create widget
mkdir -p src/widgets/<widget-name>

# Structure
WidgetName.tsx    # Main component
types.ts          # Props types
constants.ts      # Constants
components/       # Sub-components
index.ts          # Public API
```

Widgets = Layout + Composition, NO business logic!
