---
description: Start the frontend development server with HMR (pnpm dev).
---

# Command: Start Development

Start the development server with hot module replacement.

## Usage

Run this command to start local development:

```bash
pnpm dev
```

## What It Does

1. Installs dependencies (if needed)
2. Starts Vite dev server on port 3000
3. Enables Hot Module Replacement (HMR)
4. Proxies API requests to backend

## First Time Setup

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

## Environment Variables

Create `.env.local` file:

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_ENV=development
```

## Accessing the App

After running `pnpm dev`:
- **Local**: http://localhost:3000
- **Network**: http://0.0.0.0:3000

## Development Tools

### Browser DevTools
- React DevTools: Inspect component tree
- TanStack Query DevTools: Inspect queries/mutations
- Redux DevTools: Zustand state (if devtools enabled)

### Vite Features
- **HMR**: Changes reflect instantly
- **Fast refresh**: State preserved on edit
- **Error overlay**: Clear error messages
- **Fast build**: Optimized for speed

## Proxy Configuration

API requests are automatically proxied:

```
/api/users → http://localhost:8000/users
```

Configured in `vite.config.ts`:
```typescript
server: {
  proxy: {
    "/api": {
      target: "http://localhost:8000",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
  },
}
```

## Troubleshooting

### Port already in use
```bash
# Kill process on port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
pnpm dev -- --port 3001
```

### Module not found
```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### TypeScript errors
```bash
# Check types
pnpm typecheck

# Restart TypeScript server in IDE
```

## Related Commands

- `pnpm build` - Production build
- `pnpm preview` - Preview production build
- `pnpm lint` - Run linter
- `pnpm test` - Run tests
