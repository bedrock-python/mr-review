# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
