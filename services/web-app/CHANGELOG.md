# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/0.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/bedrock-python/mr-review/compare/web-app-v0.2.2...web-app-v0.3.0) (2026-10-08)


### ⚠ BREAKING CHANGES

* data export is format 2.0 (version 1 files still import); POST /api/v1/data/export leaves secrets out unless a password (encrypted) or include_plain_secrets is given; an empty token or API key counts as absent on import; the server must run a single worker.
* the API refuses requests whose Host is not in MR_REVIEW__ALLOWED_HOSTS (default localhost, 127.0.0.1, ::1, api) with 400 — add your LAN hostname/IP or reverse-proxy upstream name when exposing it; saving a brief on an iteration that reached Post returns 409.
* POST /api/v1/reviews/{id}/post answers {posted, failed, skipped, held_back, completed, results[], review} instead of {posted}, refuses a completed iteration with 409 unless force is set, and comment edits return 409 while a post of the review is running.
* POST /api/v1/reviews/{id}/dispatch streams typed SSE events (chunk, comment, done, error) with JSON data instead of plain text chunks; dispatching into a posted iteration returns 409.
* GET /api/v1/hosts/{id}/repos, /repos/{repo_path}/mrs and /inbox return a page envelope {items, page, per_page, has_more} instead of a bare list (the inbox also carries truncated_repos), and MR additions / deletions / file_count are nullable. Upstream VCS errors now map to 400/401/403/404/422/429/502/504 instead of 502/500.
* compose files publish ports on 127.0.0.1 by default (set MR_REVIEW_BIND=0.0.0.0 to expose on the LAN); the web-app image calls the API same-origin through its /api/ proxy (set API_BASE_URL or API_UPSTREAM for a standalone web-app); the api and all-in-one images start as root and drop to PUID:PGID (they need CHOWN, SETUID and SETGID, or run them with user:); HSTS is opt-in via HSTS_MAX_AGE. See docs/getting-started/installation.md, "Upgrading".

### Features

* design system foundation — tokens, accessible contrast, shared UI primitives, bundled fonts ([#134](https://github.com/bedrock-python/mr-review/issues/134)) ([db9161c](https://github.com/bedrock-python/mr-review/commit/db9161c1b97441cbbe06e406ce3dfd63cbc385e1))
* keyboard-driven comment polishing with filters, bulk actions and undo ([#124](https://github.com/bedrock-python/mr-review/issues/124)) ([c594996](https://github.com/bedrock-python/mr-review/commit/c5949967afb69d3a85823e2d8050d9203fee10f6))
* model-aware dispatch settings — effort, output limit, structured output, system prompt ([#129](https://github.com/bedrock-python/mr-review/issues/129)) ([d03ea33](https://github.com/bedrock-python/mr-review/commit/d03ea33bad0e969dc475fb5250139ced6169bb63))
* paginate repositories, merge requests and the inbox ([#126](https://github.com/bedrock-python/mr-review/issues/126)) ([c8748c7](https://github.com/bedrock-python/mr-review/commit/c8748c75dce248ef3cb81c88415de5c13065196d))
* review brief options — language, severity floor, comment cap, path filters, line numbers, presets, prompt budget ([#130](https://github.com/bedrock-python/mr-review/issues/130)) ([5773a96](https://github.com/bedrock-python/mr-review/commit/5773a96881cc1af747d44eaeb51d6115022af653))
* **web:** redesign Settings and export/import on the shared primitives ([#140](https://github.com/bedrock-python/mr-review/issues/140)) ([d7aa5ae](https://github.com/bedrock-python/mr-review/commit/d7aa5aee187fd1e6fab63a9585ddf93c543e5c84))
* **web:** redesign the app shell, sidebar and MR list on the shared primitives ([#138](https://github.com/bedrock-python/mr-review/issues/138)) ([531e61b](https://github.com/bedrock-python/mr-review/commit/531e61b28332cd0a4a4801de6714af2117db9ddd))
* **web:** redesign the Dispatch stage on the shared primitives ([#136](https://github.com/bedrock-python/mr-review/issues/136)) ([6ea1db2](https://github.com/bedrock-python/mr-review/commit/6ea1db2e086099c8b77e680498e585049beb1693))
* **web:** redesign the Pick and Brief stages on the shared primitives ([#135](https://github.com/bedrock-python/mr-review/issues/135)) ([1ab965a](https://github.com/bedrock-python/mr-review/commit/1ab965a41709cbdd6438df6ad8b4555b14ac05fa))
* **web:** redesign the Polish stage on the shared primitives ([#137](https://github.com/bedrock-python/mr-review/issues/137)) ([7575201](https://github.com/bedrock-python/mr-review/commit/7575201424a6c8e41cede27c548380712bbe3337))
* **web:** redesign the Post stage and history panels on the shared primitives ([#139](https://github.com/bedrock-python/mr-review/issues/139)) ([9c56862](https://github.com/bedrock-python/mr-review/commit/9c568626d4f066c6e0fc55fa740e084c3f739c85))


### Bug Fixes

* harden the deployments — security headers, same-origin API, data dir ownership, loopback ports ([#127](https://github.com/bedrock-python/mr-review/issues/127)) ([cc4cba2](https://github.com/bedrock-python/mr-review/commit/cc4cba282f64b2d6b0db198615656d3f960e07db))
* make the data store safe under concurrency and export/import lossless ([#133](https://github.com/bedrock-python/mr-review/issues/133)) ([bc62013](https://github.com/bedrock-python/mr-review/commit/bc62013d3bbb7b932daf1dd90183f10afa1964ab))
* parse AI review comments reliably and stream them live ([#125](https://github.com/bedrock-python/mr-review/issues/125)) ([126c938](https://github.com/bedrock-python/mr-review/commit/126c938ce2176520dc4455ac43a4b98e9ac30602))
* post review comments exactly once, report what landed, anchor them on the right lines ([#131](https://github.com/bedrock-python/mr-review/issues/131)) ([4e7fea9](https://github.com/bedrock-python/mr-review/commit/4e7fea975e004598fe22e303bd65a5cd34975b7f))
* web app reliability — stage in the URL, safe cache persistence, lazy stages, host allowlist ([#132](https://github.com/bedrock-python/mr-review/issues/132)) ([312727b](https://github.com/bedrock-python/mr-review/commit/312727b13ff5875dc7aaab98be620ba11ccb9413))

## [0.2.2](https://github.com/bedrock-python/mr-review/compare/web-app-v0.2.1...web-app-v0.2.2) (2026-08-15)


### Performance Improvements

* **docker:** build web assets on the native platform ([9b061a6](https://github.com/bedrock-python/mr-review/commit/9b061a6bbab5588cc8ff4026ad936ba8985e5cee))
* **docker:** build web assets on the native platform instead of under QEMU ([7fcf8ef](https://github.com/bedrock-python/mr-review/commit/7fcf8efa10f6ace97115f2f64d69d9d68826c8c3))

## [0.2.1](https://github.com/bedrock-python/mr-review/compare/web-app-v0.2.0...web-app-v0.2.1) (2026-08-15)


### Bug Fixes

* **deps:** clear all security advisories in web-app ([2f4cde5](https://github.com/bedrock-python/mr-review/commit/2f4cde525b5e2ffe5b52a0f7e892d101d9ee33a6))
* **deps:** update web-app dependencies to clear all security advisories ([17b43ad](https://github.com/bedrock-python/mr-review/commit/17b43adb64a83392c93566daccf96df9df7859eb))
* **polish:** repair comment navigation and stop full diff re-renders ([6440046](https://github.com/bedrock-python/mr-review/commit/64400464dfb350f16886de3cf3da6ca563ea0474))
* **polish:** reset the comment editor when navigating between comments ([9203f3d](https://github.com/bedrock-python/mr-review/commit/9203f3da4a23727f0fee06a32c3a4938eeb740a1))
* **web-app:** copy patches directory before pnpm install in Dockerfile ([7c197c4](https://github.com/bedrock-python/mr-review/commit/7c197c4d14e5fdc04a72a49274e04f08fd92624b))


### Performance Improvements

* **diff-viewer:** memoise rows and apply the highlight imperatively ([b522564](https://github.com/bedrock-python/mr-review/commit/b522564ff165d2fb26513b3fbabe489215c53e3c))

## [0.2.0](https://github.com/bedrock-python/mr-review/compare/web-app-v0.1.0...web-app-v0.2.0) (2026-05-17)


### Features

* **export-import:** add data export/import functionality ([7dc3e6e](https://github.com/bedrock-python/mr-review/commit/7dc3e6eb1ec93ca7bcd6df418fd1a248d7e1f300))
* **export-import:** add encrypted export/import with password protection ([1fc0843](https://github.com/bedrock-python/mr-review/commit/1fc0843ba692339d55611cd0aa1111aede893864))
* merge develop → master (Agent Teams, concurrency fence, arbitrary repos, branch-diff, inline patches foundation) ([70f5105](https://github.com/bedrock-python/mr-review/commit/70f5105fae47333c60a3be07099597c1fa738412))
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
