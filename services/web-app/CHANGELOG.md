# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/0.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 (2026-05-15)


### Features

* initial mr-review project ([d080171](https://github.com/bedrock-python/mr-review/commit/d0801718fb1fa295ba5363daa6090809a3f052a6))


### Bug Fixes

* **ci:** fix eslint prettier and no-unnecessary-condition errors ([337fe40](https://github.com/bedrock-python/mr-review/commit/337fe4026785661fb27fd189b1c0c855366d9366))
* **ci:** fix prettier formatting and suppress no-unnecessary-condition in StageBadge ([76c3f18](https://github.com/bedrock-python/mr-review/commit/76c3f18c22b77f44def083796ea0cae9bbe9d5d9))
* **ci:** fix STAGE_META type and zodResolver input/output type mismatch ([6149e46](https://github.com/bedrock-python/mr-review/commit/6149e463c30fb0eddfe0ab25fcf9c2e1712e8623))
* **ci:** resolve frontend typecheck errors and remove integration coverage threshold ([b984eec](https://github.com/bedrock-python/mr-review/commit/b984eec0850001c488d70a9b072b37cbcebe3494))

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
