# Command: Lint & Format

Run linter and formatter to ensure code quality.

## Usage

```bash
# Check linting issues
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Check formatting
pnpm format:check

# Fix formatting
pnpm format

# Type check
pnpm typecheck

# Run all quality checks
pnpm lint && pnpm typecheck && pnpm format:check
```

## What Gets Checked

### ESLint
- TypeScript strict rules
- React hooks rules
- Import order
- Unused variables
- Code quality issues

### Prettier
- Line length (100 chars)
- Semicolons
- Quotes (double)
- Trailing commas
- Indentation (2 spaces)

### TypeScript
- Type errors
- Strict mode violations
- Missing annotations
- Unused declarations

## Pre-commit Hook

Automatically runs on `git commit`:

```bash
# Runs for staged files
1. ESLint --fix
2. Prettier --write
3. TypeScript check
4. Tests for changed files
```

Setup (first time):
```bash
pnpm prepare  # Installs husky hooks
```

## Fix Common Issues

### Auto-fix Most Issues

```bash
# Fix lint + format in one command
pnpm lint:fix && pnpm format
```

### TypeScript Errors

```bash
# Check types
pnpm typecheck

# Common fixes:
# 1. Add missing type annotations
# 2. Remove unused imports
# 3. Fix strict null checks
```

### Import Order

ESLint automatically sorts imports:
1. React imports
2. Third-party libraries
3. Internal aliases (@app, @shared, etc.)
4. Relative imports
5. Type imports

```typescript
// ✅ CORRECT (after lint:fix)
import { useState } from "react";

import { z } from "zod";

import { Button } from "@shared/ui";

import type { User } from "./types";
```

## IDE Integration

### VS Code

Install extensions:
- ESLint
- Prettier
- TypeScript Error Translator

Settings:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  }
}
```

### Cursor

Built-in ESLint and Prettier support.
Format on save enabled by default.

## Lint Rules

### Errors (Must Fix)

- ❌ `@typescript-eslint/no-explicit-any`
- ❌ `@typescript-eslint/no-unused-vars`
- ❌ `react-hooks/exhaustive-deps`
- ❌ `@tanstack/query/exhaustive-deps`

### Warnings (Should Fix)

- ⚠️ `no-console` (console.log)
- ⚠️ `react-refresh/only-export-components`

## Ignore Rules (When Justified)

```typescript
// Disable for specific line
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = legacyApi();

// Disable for block
/* eslint-disable @typescript-eslint/no-explicit-any */
const legacy = () => {
  // Old code
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ⚠️ Use sparingly! Add comment explaining WHY
```

## Format Configuration

### Prettier Config

```json
{
  "semi": true,              // Require semicolons
  "singleQuote": false,      // Use double quotes
  "tabWidth": 2,             // 2 spaces
  "printWidth": 100,         // 100 chars per line
  "trailingComma": "es5",    // ES5 trailing commas
  "arrowParens": "always"    // (x) => x
}
```

### EditorConfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

## CI/CD Integration

### In GitLab CI

```yaml
lint:
  script:
    - pnpm install
    - pnpm lint
    - pnpm typecheck
    - pnpm format:check
  only:
    - merge_requests
    - master
```

## Common Fixes

### Missing Semicolons

```bash
pnpm format  # Auto-adds semicolons
```

### Wrong Quotes

```bash
pnpm format  # Converts to double quotes
```

### Unused Imports

```bash
pnpm lint:fix  # Removes unused imports
```

### Wrong Import Order

```bash
pnpm lint:fix  # Sorts imports automatically
```

## Bypass (Not Recommended)

### Skip Pre-commit Hook

```bash
# ⚠️ Only for emergencies
git commit --no-verify -m "emergency fix"
```

### Skip Lint Errors

```bash
# ⚠️ Not recommended
pnpm build -- --no-lint
```

## Performance

### Lint Only Changed Files

```bash
# Lint staged files (automatic in pre-commit)
pnpm lint-staged

# Lint specific directory
pnpm lint src/shared/ui
```

### Type Check Performance

```bash
# Skip lib checks for faster builds
tsc --noEmit --skipLibCheck
```

## Quick Fix Workflow

```bash
# 1. Check issues
pnpm lint

# 2. Auto-fix
pnpm lint:fix

# 3. Format
pnpm format

# 4. Verify types
pnpm typecheck

# 5. Done!
```

## VS Code Quick Actions

- `Ctrl/Cmd + Shift + P` → "Format Document"
- `Ctrl/Cmd + Shift + P` → "ESLint: Fix all auto-fixable problems"
- Save file (auto-format on save)

## Summary

```bash
# Check everything
pnpm lint && pnpm typecheck && pnpm format:check

# Fix everything
pnpm lint:fix && pnpm format

# Pre-commit does this automatically
git commit -m "message"
```

**Goal**: Zero lint errors, zero type errors, consistent formatting.
