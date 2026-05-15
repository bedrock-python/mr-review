# Command: Build

Build the application for production deployment.

## Usage

```bash
# Production build
pnpm build

# Preview production build locally
pnpm preview
```

## Build Process

### What Happens

1. **Type Check**: `tsc -b` - Validates all TypeScript
2. **Vite Build**: Bundles for production
3. **Optimization**: Tree-shaking, minification, code splitting
4. **Assets**: Copies public/ to dist/
5. **Source Maps**: Generates for debugging

### Output

```
dist/
├── assets/
│   ├── index-[hash].js       # Main bundle
│   ├── vendor-[hash].js      # Third-party libs
│   ├── index-[hash].css      # Styles
│   └── *.svg, *.png          # Assets
└── index.html                # Entry point
```

## Build Configuration

### Vite Config

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: "ES2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "tanstack-vendor": ["@tanstack/react-query", "@tanstack/react-table"],
          "radix-vendor": ["@radix-ui/react-dialog", "@radix-ui/react-select"],
        },
      },
    },
  },
});
```

### Code Splitting

Automatic by Vite:
- **Route-based**: Each lazy-loaded page = separate chunk
- **Vendor**: Third-party libraries
- **Shared**: Common code between routes

## Preview Build

```bash
# Build first
pnpm build

# Preview on http://localhost:4173
pnpm preview
```

Tests production build locally before deployment.

## Environment Variables

### Build-time Variables

```bash
# .env.production
VITE_API_BASE_URL=https://api.aiops.com
VITE_APP_ENV=production
```

Only `VITE_*` variables are included in build.

### Validation

```typescript
// shared/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_APP_ENV: z.enum(["development", "staging", "production"]),
});

export const env = envSchema.parse(import.meta.env);
```

## Build Optimization

### Analyze Bundle

```bash
# Install bundle analyzer
pnpm add -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    visualizer({
      open: true,
      filename: "dist/stats.html",
    }),
  ],
});

# Build and analyze
pnpm build
```

### Reduce Bundle Size

1. **Tree-shaking**: Import specific modules
   ```typescript
   // ✅ CORRECT
   import { format } from "date-fns/format";

   // ❌ WRONG
   import { format } from "date-fns";
   ```

2. **Lazy loading**: Load routes on demand
   ```typescript
   const Dashboard = lazy(() => import("@pages/dashboard"));
   ```

3. **Dynamic imports**: Load features conditionally
   ```typescript
   const module = await import("./heavy-module");
   ```

4. **Image optimization**: Use WebP, compress images

## Docker Build

### Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Build Docker Image

```bash
docker build -t aiops-web-app .
docker run -p 8080:80 aiops-web-app
```

## Build Verification

### Checklist

After `pnpm build`:

- [ ] Build completes without errors
- [ ] TypeScript check passes
- [ ] Bundle size is reasonable (< 500kb initial)
- [ ] Source maps generated
- [ ] Assets copied correctly
- [ ] `pnpm preview` works
- [ ] All routes load
- [ ] API calls work
- [ ] Dark/Light themes work
- [ ] Responsive on mobile

### Testing Production Build

```bash
# Build
pnpm build

# Preview
pnpm preview

# Open http://localhost:4173
# Test:
# 1. Navigate all routes
# 2. Toggle theme
# 3. Test forms
# 4. Check console for errors
# 5. Test on mobile (DevTools)
```

## CI/CD Build

```yaml
# GitLab CI example
build:
  stage: build
  script:
    - pnpm install --frozen-lockfile
    - pnpm typecheck
    - pnpm lint
    - pnpm test
    - pnpm build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
  only:
    - master
    - merge_requests
```

## Deployment

### Static Hosting

```bash
# Build
pnpm build

# Deploy to:
# - Netlify: netlify deploy --prod --dir=dist
# - Vercel: vercel --prod
# - AWS S3: aws s3 sync dist/ s3://bucket-name
```

### Docker Deployment

```bash
# Build image
docker build -t aiops-web-app:1.0.0 .

# Push to registry
docker push registry.example.com/aiops-web-app:1.0.0

# Deploy to Kubernetes
kubectl apply -f k8s/deployment.yaml
```

## Common Issues

### Build fails on type errors

```bash
# Check types first
pnpm typecheck

# Fix errors, then build
pnpm build
```

### Out of memory

```bash
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm build
```

### Slow builds

```bash
# Use cache
pnpm build --cache

# Skip source maps (faster, less debuggable)
pnpm build --no-sourcemap
```

## Quick Reference

```bash
# Development
pnpm dev              # Dev server

# Production
pnpm build            # Build for prod
pnpm preview          # Preview build

# Verification
pnpm typecheck        # Check types
pnpm lint             # Check lint
pnpm test             # Run tests

# Complete build check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Output**: `dist/` directory ready for deployment.

**Size target**: < 500kb initial bundle, < 2MB total.
