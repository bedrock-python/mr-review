# Contributing to MR Review Web App

Thank you for contributing! Please follow these guidelines.

## Development Setup

1. Fork and clone repository
2. Install dependencies: `pnpm install`
3. Create branch: `git checkout -b feature/my-feature`
4. Make changes following our coding standards
5. Test changes: `pnpm test`
6. Commit: `git commit -m "feat: add my feature"`
7. Push and create merge request

## Code Standards

### Architecture

- Follow Feature-Sliced Design (FSD)
- Respect layer dependency rules
- Export through public APIs (index.ts)

### TypeScript

- Use strict mode
- No `any` types
- Explicit return types
- Zod validation for API responses

### Naming

- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` with `use` prefix
- Folders: `kebab-case`

### Testing

- Write tests for business logic
- Target 80%+ coverage
- Test user behavior, not implementation

## Commit Messages

Follow conventional commits:

```
feat: add user profile page
fix: correct login validation
docs: update README
style: format code
refactor: extract user hook
test: add button tests
chore: update dependencies
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all checks pass:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. Request review from maintainers
5. Address review comments
6. Merge after approval

## Questions?

Open an issue or contact the maintainers.
