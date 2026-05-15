# Tech Stack — mr-review-frontend

## Core

- **Runtime:** React 19
- **Language:** TypeScript 5.8+ (strict mode)
- **Build Tool:** Vite
- **Package Manager:** pnpm

## State Management

- **Server State:** TanStack Query (React Query)
- **Client State:** Zustand
- **URL State:** nuqs (search params management)
- **Forms:** React Hook Form

## Routing

- **Router:** React Router v7

## UI & Styling

- **UI Library:** Radix UI
- **CSS:** Tailwind CSS v4
- **Icons:** Lucide React
- **Animations:** tailwindcss-animate
- **Class Utils:** tailwind-merge + class-variance-authority
- **Theme:** Dark / Light / System (next-themes)
- **Responsive:** Mobile-first, все устройства (320px → 4K)

## Advanced UI Patterns

- **Virtualization:** TanStack Virtual (для больших списков/таблиц)
- **Tables:** TanStack Table (sorting, filtering, pagination)
- **Notifications:** Sonner (toast notifications)
- **Command Palette:** cmdk (Cmd+K universal search)
- **Keyboard Shortcuts:** react-hotkeys-hook

## UX Patterns

- **Loading States:** Skeleton loaders (CSS-based)
- **Empty States:** Custom illustrations + actions
- **Error States:** Error boundaries + retry logic
- **Optimistic Updates:** TanStack Query mutations
- **URL Persistence:** Filters, sorting, pagination в URL

## API & Data

- **HTTP Client:** Axios (с wrapper)
- **Validation:** Zod (runtime + types)
- **API Type:** REST (ручные типы + Zod schemas)

## Authentication

- **Method:** JWT в httpOnly cookies
- **Tokens:** Access + Refresh (OAuth2/OIDC)
- **Auto-refresh:** Axios interceptor

## Internationalization

- **Library:** i18next + react-i18next
- **Language:** English
- **Type-safe:** TypeScript key types

## Architecture

- **Pattern:** Feature-Sliced Design (FSD)
- **Layers:** app / pages / widgets / features / entities / shared

## Testing

- **Unit/Integration:** Vitest
- **Component:** Testing Library
- **E2E:** Playwright
- **Visual:** Storybook
- **Mocking:** axios-mock-adapter + MSW

## Code Quality

- **Linter:** ESLint 9 (flat config)
- **Formatter:** Prettier
- **Type Check:** TypeScript strict
- **Pre-commit:** pre-commit hooks (ESLint, Prettier)

## Developer Experience

- **Path Aliases:** @app, @pages, @widgets, @features, @entities, @shared
- **Environment:** Vite env + Zod validation
- **Docker:** Multi-stage build + nginx

## Production

- **Monitoring:** Prometheus metrics
- **Performance:** Lazy loading + code splitting
- **Security:** CSP + HTTPS only
