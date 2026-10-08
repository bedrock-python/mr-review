# CHANGELOG

<!-- version list -->

## [0.3.0](https://github.com/bedrock-python/mr-review/compare/mr-review-v0.2.1...mr-review-v0.3.0) (2026-10-08)


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


### Bug Fixes

* harden the deployments — security headers, same-origin API, data dir ownership, loopback ports ([#127](https://github.com/bedrock-python/mr-review/issues/127)) ([cc4cba2](https://github.com/bedrock-python/mr-review/commit/cc4cba282f64b2d6b0db198615656d3f960e07db))
* make the data store safe under concurrency and export/import lossless ([#133](https://github.com/bedrock-python/mr-review/issues/133)) ([bc62013](https://github.com/bedrock-python/mr-review/commit/bc62013d3bbb7b932daf1dd90183f10afa1964ab))
* parse AI review comments reliably and stream them live ([#125](https://github.com/bedrock-python/mr-review/issues/125)) ([126c938](https://github.com/bedrock-python/mr-review/commit/126c938ce2176520dc4455ac43a4b98e9ac30602))
* post review comments exactly once, report what landed, anchor them on the right lines ([#131](https://github.com/bedrock-python/mr-review/issues/131)) ([4e7fea9](https://github.com/bedrock-python/mr-review/commit/4e7fea975e004598fe22e303bd65a5cd34975b7f))
* stop context collection from deadlocking on its own semaphore ([#123](https://github.com/bedrock-python/mr-review/issues/123)) ([0080f6b](https://github.com/bedrock-python/mr-review/commit/0080f6bce9a550263cad58d63efb0878253b07f0))
* web app reliability — stage in the URL, safe cache persistence, lazy stages, host allowlist ([#132](https://github.com/bedrock-python/mr-review/issues/132)) ([312727b](https://github.com/bedrock-python/mr-review/commit/312727b13ff5875dc7aaab98be620ba11ccb9413))

## [0.2.1](https://github.com/bedrock-python/mr-review/compare/mr-review-v0.2.0...mr-review-v0.2.1) (2026-08-15)


### Bug Fixes

* **deps:** refresh uv.lock so it records the released version ([17b43ad](https://github.com/bedrock-python/mr-review/commit/17b43adb64a83392c93566daccf96df9df7859eb))

## [0.2.0](https://github.com/bedrock-python/mr-review/compare/mr-review-v0.1.1...mr-review-v0.2.0) (2026-05-17)


### Features

* **export-import:** add data export/import functionality ([7dc3e6e](https://github.com/bedrock-python/mr-review/commit/7dc3e6eb1ec93ca7bcd6df418fd1a248d7e1f300))
* **export-import:** add encrypted export/import with password protection ([1fc0843](https://github.com/bedrock-python/mr-review/commit/1fc0843ba692339d55611cd0aa1111aede893864))
* merge develop → master (Agent Teams, concurrency fence, arbitrary repos, branch-diff, inline patches foundation) ([70f5105](https://github.com/bedrock-python/mr-review/commit/70f5105fae47333c60a3be07099597c1fa738412))
* **mr-review:** add branch-diff review source (issue [#10](https://github.com/bedrock-python/mr-review/issues/10) phase 1) ([#19](https://github.com/bedrock-python/mr-review/issues/19)) ([c9e2ea8](https://github.com/bedrock-python/mr-review/commit/c9e2ea83dc352012e29f6ec174de941f51617de8))
* **mr-review:** per-AIProvider concurrency fence + API surface ([#11](https://github.com/bedrock-python/mr-review/issues/11)) ([#17](https://github.com/bedrock-python/mr-review/issues/17)) ([663f0d1](https://github.com/bedrock-python/mr-review/commit/663f0d103a6b208f199dff5b5e78a774fc42c3f3))
* **repos:** add arbitrary repository by URL pinning ([#9](https://github.com/bedrock-python/mr-review/issues/9)) ([#18](https://github.com/bedrock-python/mr-review/issues/18)) ([651179c](https://github.com/bedrock-python/mr-review/commit/651179c65cef1a46b2b3c25562ff384e2cadc625))


### Bug Fixes

* **dispatch:** remove duplicate function definitions after merge ([6cd4c7c](https://github.com/bedrock-python/mr-review/commit/6cd4c7cd035c1e6241391f9d8411064f58dcdfb8))
* **export-import:** expose tokens properly in plain export mode ([ec571d9](https://github.com/bedrock-python/mr-review/commit/ec571d9fc59369d866fb89874506349c1250b29b))
* **lint:** resolve ruff and prettier errors blocking master merge ([6c66711](https://github.com/bedrock-python/mr-review/commit/6c667110edb29374dd1bd2e6681c8ff962cc3ba2))
* **test:** add --all-extras flag to test command to install all dependencies ([efc139a](https://github.com/bedrock-python/mr-review/commit/efc139a667a551a1a10f912713b038f4fb4b4c04))
* **tests:** propagate favourite_repos in make_host factory ([df2932d](https://github.com/bedrock-python/mr-review/commit/df2932d53ba6f4523cdd8cf0392e54a492e09270))

## [0.1.1](https://github.com/bedrock-python/mr-review/compare/mr-review-v0.1.0...mr-review-v0.1.1) (2026-05-16)


### Bug Fixes

* **mr-review:** apply all review fixes — SecretStr, XSS, dead code, type safety ([c783d65](https://github.com/bedrock-python/mr-review/commit/c783d65a0272b5e85064c210ae8794049895ae4a))

## 0.1.0 (2026-05-15)


### Features

* initial mr-review project ([d080171](https://github.com/bedrock-python/mr-review/commit/d0801718fb1fa295ba5363daa6090809a3f052a6))

## v0.1.0 (2026-05-14)

### Features

- Initial project scaffolding with backend and frontend
