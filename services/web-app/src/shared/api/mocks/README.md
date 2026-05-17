# API mocks

MSW-based request mocking for local development, demo deployments, and tests.

## Switching mocks on / off

Mocks are toggled via the `VITE_USE_MOCKS` env var, read at runtime through
`@shared/config/env`. The switch lives in `src/main.tsx::enableMocking`.

| Env value | Behaviour |
| --- | --- |
| `VITE_USE_MOCKS=true` (`.env.development`) | MSW worker intercepts requests; no real backend needed. |
| `VITE_USE_MOCKS=false` (default in prod) | All HTTP traffic goes to `VITE_API_BASE_URL` (real backend). |

The same toggle is honoured by `Dockerfile.demo` / `entrypoint.sh` so a demo
image can be flipped to live data without rebuilding.

When backend implementation for a given endpoint becomes available, **no code
change is required** — flip the env var and the MSW worker stops handling
matching paths, requests pass through to the real backend.

## C1 Inline Fix Suggestions — patch endpoints

Four endpoints are mocked in `handlers/patch.ts`, branching off the
`commentId` path parameter. Use the IDs from `PATCH_MOCK_COMMENT_IDS` to
drive deterministic FSM scenarios.

| Scenario | Comment ID key | Endpoint | Status | Error code |
| --- | --- | --- | :-: | --- |
| Apply happy path | `applyHappy` | apply-patch | 200 | — |
| Stale source | `applyStale` | apply-patch | 409 | `PATCH_STALE` |
| Invalid diff | `applyInvalidDiff` | apply-patch | 422 | `PATCH_INVALID_DIFF` |
| Post happy path | `postHappy` | post-patch | 200 | — |
| VCS error | `postVcsFail` | post-patch | 502 | `VCS_ERROR` |
| Discard happy path | `discardHappy` | discard-patch | 200 | — |
| Revert happy path | `revertHappy` | revert-patch | 200 | — |
| Revert sha mismatch | `revertConflict` | revert-patch | 409 | `PATCH_REVERT_SHA_MISMATCH` |
| No patch present | `noPatchPresent` | any of 4 | 404 | `PATCH_NOT_FOUND` |

Error responses follow the backend FastAPI-style envelope:

```json
{ "detail": { "code": "PATCH_STALE", "message": "...", "context": {...} } }
```

Parse on the client side with `PatchErrorEnvelopeSchema` from
`@entities/review`.

## Adding a new scenario

1. Add a new comment ID constant in `fixtures/patch.ts::PATCH_MOCK_COMMENT_IDS`.
2. Add a matching `Comment` shape in `FIXTURE_COMMENTS`.
3. Branch on the new ID inside the relevant handler in `handlers/patch.ts`.
4. Document it in the table above.
