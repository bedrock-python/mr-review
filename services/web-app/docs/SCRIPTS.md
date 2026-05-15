# Scripts Reference

Complete guide to all npm scripts in the project.

## Development

### `pnpm dev`

Start development server with Hot Module Replacement.

```bash
pnpm dev
```

- Opens at http://localhost:3000
- Hot reload on file changes
- React Fast Refresh
- Source maps enabled
- API proxy to backend

**Options:**

```bash
pnpm dev -- --port 3001  # Custom port
pnpm dev -- --host        # Expose to network
```

### `pnpm preview`

Preview production build locally.

```bash
pnpm preview
```

- Serves `dist/` folder
- Opens at http://localhost:4173
- Tests production behavior

## Build

### `pnpm build`

Build for production.

```bash
pnpm build
```

**Steps:**

1. Type check (`tsc -b`)
2. Vite build
3. Minification
4. Code splitting
5. Output to `dist/`

**Output:**

```
dist/
├── assets/
│   ├── index-[hash].js
│   ├── vendor-[hash].js
│   └── index-[hash].css
└── index.html
```

## Code Quality

### `pnpm lint`

Check code for linting issues.

```bash
pnpm lint
```

Runs ESLint on all TypeScript/TSX files.

### `pnpm lint:fix`

Auto-fix linting issues.

```bash
pnpm lint:fix
```

Fixes:

- Import order
- Unused imports
- Formatting issues
- Auto-fixable ESLint rules

### `pnpm format`

Format code with Prettier.

```bash
pnpm format
```

Formats:

- TypeScript files
- JSON files
- Markdown files
- CSS files

### `pnpm format:check`

Check if code is formatted correctly.

```bash
pnpm format:check
```

Exits with error if formatting needed.

### `pnpm typecheck`

Type check without building.

```bash
pnpm typecheck
```

Runs `tsc --noEmit` to check types.

## Testing

### `pnpm test`

Run all tests once.

```bash
pnpm test
```

Runs Vitest in run mode.

### `pnpm test:watch`

Run tests in watch mode.

```bash
pnpm test:watch
```

Auto-reruns tests on file changes. Best for TDD.

### `pnpm test:ui`

Run tests with interactive UI.

```bash
pnpm test:ui
```

Opens browser UI at http://localhost:51204.

### `pnpm test:coverage`

Generate coverage report.

```bash
pnpm test:coverage
```

Outputs:

- Console summary
- HTML report in `coverage/index.html`
- LCOV for CI/CD

## Storybook

### `pnpm storybook`

Start Storybook development server.

```bash
pnpm storybook
```

Opens at http://localhost:6006.

### `pnpm build-storybook`

Build static Storybook.

```bash
pnpm build-storybook
```

Outputs to `storybook-static/`.

## Combined Commands

### Full Quality Check

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Runs all checks before commit.

### Auto-fix Everything

```bash
pnpm lint:fix && pnpm format
```

Fixes all auto-fixable issues.

### Clean Install

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

Fresh installation of all dependencies.

## Pre-commit Hook

Automatically runs on `git commit`:

```bash
# For staged TypeScript files
1. eslint --fix
2. prettier --write

# For staged JSON/MD/CSS files
1. prettier --write
```

## CI/CD Scripts

### GitLab CI Example

```yaml
stages:
  - lint
  - test
  - build

lint:
  script:
    - pnpm install --frozen-lockfile
    - pnpm lint
    - pnpm typecheck

test:
  script:
    - pnpm install --frozen-lockfile
    - pnpm test:coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build:
  script:
    - pnpm install --frozen-lockfile
    - pnpm build
  artifacts:
    paths:
      - dist/
```

## Docker Scripts

### Build Image

```bash
docker build -f Dockerfile.app -t mr-review-web-app .
```

### Run Container

```bash
docker run -p 8080:8080 mr-review-web-app
```

## Performance Scripts

### Bundle Analysis

```bash
pnpm bundlesize
```

Checks bundle sizes against limits defined in `.size-limit.json`.

### Dependency Size

```bash
pnpm list --depth=0
```

## Utility Commands

### Update Dependencies

```bash
# Check outdated
pnpm outdated

# Update all to latest
pnpm update --latest

# Update specific package
pnpm update react react-dom
```

### Clean Cache

```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Clear TypeScript cache
rm -rf node_modules/.cache

# Clear all caches
rm -rf node_modules/.vite node_modules/.cache coverage .eslintcache
```

## Quick Reference

| Command     | Purpose          | Usage          |
| ----------- | ---------------- | -------------- |
| `dev`       | Development      | Daily work     |
| `build`     | Production build | Deployment     |
| `test`      | Run tests        | CI/CD          |
| `lint`      | Check code       | Pre-commit     |
| `format`    | Format code      | Manual cleanup |
| `typecheck` | Check types      | Verification   |
| `storybook` | Component dev    | UI development |

## Troubleshooting

### "Port already in use"

```bash
pnpm dev -- --port 3001
```

### "Module not found"

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### "Out of memory"

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm build
```

### "Tests failing"

```bash
pnpm test:ui  # Debug in browser
```
