# CHANGELOG

<!-- version list -->

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
