# Troubleshooting: vitest fails with `ERR_MODULE_NOT_FOUND` on `expect-type`

## Symptom

`pnpm test` (or `pnpm vitest`) in `services/web-app/` errors out before any test runs:

```
Unhandled Error
Error: Cannot find package '.../node_modules/.pnpm/vitest@<...>/node_modules/expect-type/dist/index.js'
  imported from .../vitest/dist/chunks/runBaseTests.<hash>.js
Did you mean to import "expect-type/dist/index.js"?
  ❯ legacyMainResolve  node:internal/modules/esm/resolve:215:26
  ❯ packageResolve     node:internal/modules/esm/resolve:841:14
  ...
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }
```

All test files are loaded but report `no tests` because the test harness itself never starts.

## Root cause

`expect-type@1.x` (a transitive dependency of `vitest@3.x`) ships CommonJS at `dist/index.js`, but its `package.json` declares **only** `"main"` — no `"type"` field and no `"exports"` map.

When `vitest@3.x` (which is an ESM package) tries to import `expect-type`, Node's ESM resolver falls back to `legacyMainResolve` (the spec-mandated path for packages lacking an `exports` map). On Windows, with pnpm's symlinked layout, this resolver ends up constructing a path that crosses the package boundary in a way Node refuses to follow — hence the misleading "Cannot find package" error referring to a file that does exist on disk.

This affects:
- Windows + pnpm (reproducible 100%)
- Likely Linux + pnpm under certain Node ESM resolver edge cases (less frequent but possible)
- Probably **not** npm/yarn (flat `node_modules`) — but we don't support those.

## Fix in this repo

`services/web-app/patches/expect-type@1.3.0.patch` patches the dependency's `package.json` to add:

```json
{
  "type": "commonjs",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  }
}
```

The patch is wired in via pnpm's `patchedDependencies` in `services/web-app/package.json`. Lockfile (`pnpm-lock.yaml`) records the patch hash, so `pnpm install --frozen-lockfile` reproduces the fix identically on every environment, including CI (`ubuntu-latest`).

## How to verify

```bash
cd services/web-app
pnpm install                  # patch applied automatically
pnpm test                     # must not show ERR_MODULE_NOT_FOUND
```

Existing tests `src/shared/ui/Badge.test.tsx` and `src/shared/lib/cn.test.ts` should pass.

You can also inspect the patched manifest:

```bash
cat node_modules/.pnpm/expect-type@1.3.0_patch_hash=*/node_modules/expect-type/package.json
# must contain "exports" and "type": "commonjs"
```

## When the error returns

The most likely triggers for regression:

1. **`expect-type` is bumped to a new minor/patch version** by pnpm (e.g. via `pnpm update`). The patch is pinned to `expect-type@1.3.0` and **will silently fail to apply** if a different version is resolved — pnpm prints `WARN  Patch for expect-type@1.3.0 was not used` and proceeds without it.
2. **Vitest changes its expect-type peer range** (currently `^1.2.1`). A new vitest could resolve a different version.
3. **Upstream finally ships `exports`** — at that point the patch becomes a no-op or fails to apply cleanly.

### Repro / diagnosis steps

```bash
cd services/web-app
pnpm test 2>&1 | head -20     # confirm ERR_MODULE_NOT_FOUND, copy resolver path
cat node_modules/.pnpm/expect-type@*/node_modules/expect-type/package.json | grep -E '"exports"|"type"'
# if no output → patch did not apply or version mismatched
```

### Fix path

**Preferred — upstream now supports it:**

1. `pnpm view expect-type@latest exports` — if it returns a non-empty object, upstream is fixed.
2. Update `vitest` (or `expect-type` directly if needed) to a version that resolves the fixed expect-type.
3. `pnpm install` — verify the patch warning. If pnpm warns `Patch for expect-type@<old-version> was not used`, that's the signal it's safe to remove.
4. Delete `services/web-app/patches/expect-type@*.patch` and the `pnpm.patchedDependencies` block in `services/web-app/package.json`.
5. Run `pnpm test` to confirm.

**Workaround — patch still needed for new version:**

1. Update the patch:
   ```bash
   cd services/web-app
   pnpm patch expect-type@<new-version>
   # edit the printed path's package.json: add type+exports as documented above
   pnpm patch-commit "<printed-path>"
   ```
2. Old patch file under `patches/` is deleted automatically. Update the `patchedDependencies` key version in `package.json` to match.
3. Run `pnpm test` to confirm.

## Why not other workarounds

We evaluated the alternatives:

| Approach | Verdict | Reason |
| --- | --- | --- |
| Downgrade vitest to 3.1.x | ❌ no | Same `expect-type: ^1.2.1` peer range → same broken transitive resolve |
| Pin `expect-type` in `pnpm.overrides` to 1.2.2 | ❌ no | Same `package.json` shape (no `exports`); identical failure |
| `.npmrc` → `node-linker=hoisted` | ❌ no | Bypasses pnpm's whole isolation model, can break other packages; high blast radius |
| `pnpm.packageExtensions` for `expect-type` | ❌ no | Only changes what **pnpm itself** reads from the manifest for resolution; does **not** mutate the on-disk `package.json` that Node's ESM resolver reads. Confirmed by experiment. |
| `pnpm patch` (chosen) | ✅ yes | Mutates the on-disk manifest, lockfile-pinned, reproducible across OS/CI, low blast radius (only this package) |

## Tracking upstream

Drop the patch once upstream ships `exports`:
- Repo: https://github.com/mmkal/expect-type
- Look for a release that adds `"exports"` (and/or `"type"`) to its `package.json`.
