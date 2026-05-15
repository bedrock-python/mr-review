# Command: Run Tests

Run tests with Vitest and Testing Library.

## Usage

```bash
# Run all tests once
pnpm test

# Watch mode (auto-rerun on changes)
pnpm test:watch

# Interactive UI mode
pnpm test:ui

# Coverage report
pnpm test:coverage
```

## Test Commands

### Run All Tests

```bash
pnpm test
```

Runs all tests in the project once.

### Watch Mode

```bash
pnpm test:watch
```

Auto-reruns tests when files change. Best for development.

### UI Mode

```bash
pnpm test:ui
```

Opens interactive browser UI at http://localhost:51204 to:
- View test results
- Filter tests
- Debug failures
- See coverage

### Coverage

```bash
pnpm test:coverage
```

Generates coverage report:
- Console summary
- HTML report in `coverage/index.html`
- LCOV for CI/CD

### Specific File

```bash
# Run specific test file
pnpm test Button.test.tsx

# Run tests in directory
pnpm test src/shared/ui

# Pattern matching
pnpm test --grep "Button"
```

## Coverage Report

After running coverage:

```bash
# Open HTML report
open coverage/index.html  # macOS
start coverage/index.html # Windows
xdg-open coverage/index.html # Linux
```

Example output:
```
File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
All files              |   85.3  |   78.2   |   88.1  |   85.7
 shared/ui             |   92.0  |   87.5   |   95.0  |   92.3
  Button.tsx           |   95.0  |   90.0   |  100.0  |   95.0
 features/auth         |   78.5  |   70.0   |   80.0  |   79.0
```

## Test Filtering

### By Name

```bash
# Run tests with "Button" in name
pnpm test --grep "Button"

# Exclude tests
pnpm test --grep -v "integration"
```

### By File Pattern

```bash
# Run only component tests
pnpm test "**/*.test.tsx"

# Run only hook tests
pnpm test "**/use*.test.ts"
```

### By Changed Files

```bash
# Run tests related to changed files (Git)
pnpm test --changed
```

## Debugging Tests

### Console Output

```bash
# Verbose output
pnpm test --reporter=verbose

# Show console.logs
pnpm test --reporter=verbose --no-coverage
```

### Debug in VS Code

1. Set breakpoint in test file
2. Run "Debug Test" in VS Code
3. Or use `debugger;` statement

### Debug with UI

```bash
pnpm test:ui
```

Click on failed test → See detailed error

## CI/CD Testing

### In CI Pipeline

```bash
# Run with coverage
pnpm test:coverage

# Upload to SonarQube/Codecov
# coverage/lcov.info
```

## Mock Strategy

### API Mocking

```typescript
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "@shared/api/http-client";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(httpClient);
});

afterEach(() => {
  mock.reset();
});

it("test", async () => {
  mock.onGet("/users").reply(200, [mockUser()]);
  // Test code
});
```

### Module Mocking

```typescript
// Mock entire module
vi.mock("@entities/user", () => ({
  useUser: vi.fn(),
}));

// Mock specific export
vi.spyOn(userApi, "getUser").mockResolvedValue(mockUser());
```

## Test Organization

```
src/
├── shared/
│   └── ui/
│       └── button/
│           ├── Button.tsx
│           ├── Button.test.tsx        ← Test next to component
│           └── Button.stories.tsx     ← Story next to component
```

## Coverage Targets

| Layer | Target | Priority |
|-------|--------|----------|
| shared/ui | 90%+ | High |
| shared/lib | 90%+ | High |
| entities | 85%+ | High |
| features | 80%+ | Medium |
| widgets | 75%+ | Medium |
| pages | 70%+ | Low |

## Common Issues

### Tests timeout
```typescript
// Increase timeout for slow operations
it("slow operation", async () => {
  // ...
}, { timeout: 10000 }); // 10 seconds
```

### Async not waiting
```typescript
// ✅ CORRECT - Use waitFor
await waitFor(() => {
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});

// ❌ WRONG - No waiting
expect(screen.getByText("Loaded")).toBeInTheDocument();
```

### Missing cleanup
```typescript
afterEach(() => {
  mock.reset();
  vi.clearAllMocks();
  cleanup();
});
```

## Quick Reference

```bash
# Development
pnpm test:watch      # Auto-rerun
pnpm test:ui         # Interactive UI

# CI/CD
pnpm test            # Run once
pnpm test:coverage   # With coverage

# Debugging
pnpm test --grep "specific test"
pnpm test:ui         # Visual debugging
```

**Test files:** `*.test.tsx` or `*.test.ts`

**Coverage target:** 80%+

**Test priority:** Critical paths → Shared → Features → Pages
