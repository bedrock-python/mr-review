# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/0.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0](https://github.com/bedrock-python/mr-review/compare/web-app-v0.1.0...web-app-v0.2.0) (2026-05-17)


### Features

* **export-import:** add data export/import functionality ([7dc3e6e](https://github.com/bedrock-python/mr-review/commit/7dc3e6eb1ec93ca7bcd6df418fd1a248d7e1f300))
* **export-import:** add encrypted export/import with password protection ([1fc0843](https://github.com/bedrock-python/mr-review/commit/1fc0843ba692339d55611cd0aa1111aede893864))
* **repos:** add arbitrary repository by URL pinning ([#9](https://github.com/bedrock-python/mr-review/issues/9)) ([#18](https://github.com/bedrock-python/mr-review/issues/18)) ([651179c](https://github.com/bedrock-python/mr-review/commit/651179c65cef1a46b2b3c25562ff384e2cadc625))
* **web-app:** inline fix suggestions foundation — roadmap, DiffViewer, Zod schemas, MSW mocks ([#20](https://github.com/bedrock-python/mr-review/issues/20)) ([566ad91](https://github.com/bedrock-python/mr-review/commit/566ad9146583f954866fac39372422461d665853))


### Bug Fixes

* **lint:** resolve ruff and prettier errors blocking master merge ([6c66711](https://github.com/bedrock-python/mr-review/commit/6c667110edb29374dd1bd2e6681c8ff962cc3ba2))
* **update-check:** compare versions semantically instead of string equality ([7e55329](https://github.com/bedrock-python/mr-review/commit/7e55329f916cfc912eea4c8e39a95b7602662b66))

## 0.1.0 (2026-05-15)

### Features

- initial mr-review project ([d080171](https://github.com/bedrock-python/mr-review/commit/d0801718fb1fa295ba5363daa6090809a3f052a6))

### Bug Fixes

- **ci:** fix eslint prettier and no-unnecessary-condition errors ([337fe40](https://github.com/bedrock-python/mr-review/commit/337fe4026785661fb27fd189b1c0c855366d9366))
- **ci:** fix prettier formatting and suppress no-unnecessary-condition in StageBadge ([76c3f18](https://github.com/bedrock-python/mr-review/commit/76c3f18c22b77f44def083796ea0cae9bbe9d5d9))
- **ci:** fix STAGE_META type and zodResolver input/output type mismatch ([6149e46](https://github.com/bedrock-python/mr-review/commit/6149e463c30fb0eddfe0ab25fcf9c2e1712e8623))
- **ci:** resolve frontend typecheck errors and remove integration coverage threshold ([b984eec](https://github.com/bedrock-python/mr-review/commit/b984eec0850001c488d70a9b072b37cbcebe3494))

## [Unreleased]

### Added

- Initial project setup with Feature-Sliced Design architecture
- React 19 with TypeScript 5.8+ (strict mode)
- Vite build tool with SWC plugin
- State management setup (TanStack Query, Zustand, nuqs, React Hook Form)
- UI framework (Radix UI, Tailwind CSS v4)
- Internationalization (i18next, English)
- Testing infrastructure (Vitest, Testing Library, Storybook)
- Docker multi-stage build configuration
- Nginx configuration with security headers
- Pre-commit hooks (ESLint, Prettier, TypeScript check)
- HTTP client with Axios (auth interceptors, retry logic)
- Environment validation with Zod
- Error boundary and loading states
- Comprehensive documentation (README, ARCHITECTURE, DEVELOPMENT, CONTRIBUTING)

### Documentation

- Project README with quick start guide
- Architecture guide explaining FSD layers
- Development guide with daily workflow
- Contributing guidelines
- Tech stack documentation

### Developer Experience

- Path aliases (@app, @pages, @widgets, @features, @entities, @shared)
- ESLint with strict TypeScript rules
- Prettier with consistent formatting
- VS Code/Cursor configuration recommendations
- Comprehensive test utilities and mocks
