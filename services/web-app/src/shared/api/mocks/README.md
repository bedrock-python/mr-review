# API mocks

MSW-based request mocking for local development, demo deployments, and tests.

## Switching mocks on / off

Mocks are toggled via the `VITE_USE_MOCKS` env var, read at runtime through
`@shared/config/env`. The switch lives in `src/main.tsx::enableMocking`.

| Env value                                  | Behaviour                                                    |
| ------------------------------------------ | ------------------------------------------------------------ |
| `VITE_USE_MOCKS=true` (`.env.development`) | MSW worker intercepts requests; no real backend needed.      |
| `VITE_USE_MOCKS=false` (default in prod)   | All HTTP traffic goes to `VITE_API_BASE_URL` (real backend). |

The same toggle is honoured by `Dockerfile.demo` / `entrypoint.sh` so a demo
image can be flipped to live data without rebuilding.

When backend implementation for a given endpoint becomes available, **no code
change is required** — flip the env var and the MSW worker stops handling
matching paths, requests pass through to the real backend.

## Paginated lists — repositories, MRs, inbox

`handlers/mrs.ts` serves the list endpoints with the backend page envelope
`{ items, page, per_page, has_more }` from deterministic data in
`fixtures/mrs.ts`, sized to span several pages:

| Endpoint                                  | Data                                                      | Default `per_page` |
| ----------------------------------------- | --------------------------------------------------------- | :----------------: |
| `GET /hosts/{id}/repos?q=`                | 137 repos in nested namespaces; `q` matches path or name  |         50         |
| `GET /hosts/{id}/repos/{path}/mrs?state=` | 0–95 MRs per repo (`MOCK_BUSY_REPO` has 95); `q` on title |         30         |
| `GET /hosts/{id}/inbox?scope=`            | open MRs across all repos, filtered by `scope`            |         30         |
| `GET /hosts/{id}/repos/{path}/mrs/{iid}`  | the matching generated MR, 404 otherwise                  |         —          |

Behaviour worth knowing when testing the UI against mocks:

- `MOCK_EXTERNAL_PINNED_REPO` is a favourite the listing never returns, so it
  is prepended to page 1 only (as the backend does for pinned repositories).
- Every 7th MR has `additions` / `deletions` / `file_count` set to `null`
  (hosts that do not report stats in list views).
- `scope=review_requested` mimics GitHub search results: empty
  `source_branch` / `target_branch` and no diff stats.
- `page < 1` or `per_page` outside `1..100` answer 422, like the backend.
- The inbox envelope also carries `truncated_repos` (repositories the backend's
  `scope=all` cut to their newest MRs); the mock never truncates, so it is `[]`.

Routes are RegExps so they match any origin and repository paths with slashes.

## C1 Inline Fix Suggestions — patch endpoints

Four endpoints are mocked in `handlers/patch.ts`, branching off the
`commentId` path parameter. Use the IDs from `PATCH_MOCK_COMMENT_IDS` to
drive deterministic FSM scenarios.

| Scenario            | Comment ID key     | Endpoint      | Status | Error code                  |
| ------------------- | ------------------ | ------------- | :----: | --------------------------- |
| Apply happy path    | `applyHappy`       | apply-patch   |  200   | —                           |
| Stale source        | `applyStale`       | apply-patch   |  409   | `PATCH_STALE`               |
| Invalid diff        | `applyInvalidDiff` | apply-patch   |  422   | `PATCH_INVALID_DIFF`        |
| Post happy path     | `postHappy`        | post-patch    |  200   | —                           |
| VCS error           | `postVcsFail`      | post-patch    |  502   | `VCS_ERROR`                 |
| Discard happy path  | `discardHappy`     | discard-patch |  200   | —                           |
| Revert happy path   | `revertHappy`      | revert-patch  |  200   | —                           |
| Revert sha mismatch | `revertConflict`   | revert-patch  |  409   | `PATCH_REVERT_SHA_MISMATCH` |
| No patch present    | `noPatchPresent`   | any of 4      |  404   | `PATCH_NOT_FOUND`           |

Error responses follow the backend FastAPI-style envelope:

```json
{ "detail": { "code": "PATCH_STALE", "message": "...", "context": {...} } }
```

Parse on the client side with `PatchErrorEnvelopeSchema` from
`@entities/review`.

## AI dispatch — streaming endpoints

`handlers/dispatch.ts` mocks the "Run in app" flow with the fixtures from
`fixtures/dispatch.ts`.

| Endpoint                                                | Response                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /reviews/:id/dispatch`                            | `text/event-stream`: `chunk` × N, `comment` × 3, then `done` |
| `GET /reviews/:id/iterations/:iterationId/raw-response` | `text/plain`: the raw model output the stream delivered      |
| `POST /reviews/:id/iterations/:iterationId/reparse`     | `{ imported: 3, errors: [], json_error: null }`              |

The stream is framed exactly like sse-starlette (CRLF line endings, a `: ping`
keep-alive comment) so the client's event-stream parsing is exercised as in
production. `done.iteration_id` echoes the request's `iteration_id`. Frames are
spaced 30 ms apart so the UI streams visibly; tests build the handlers with
`createDispatchHandlers({ frameDelayMs: 0 })`.

## Adding a new scenario

1. Add a new comment ID constant in `fixtures/patch.ts::PATCH_MOCK_COMMENT_IDS`.
2. Add a matching `Comment` shape in `FIXTURE_COMMENTS`.
3. Branch on the new ID inside the relevant handler in `handlers/patch.ts`.
4. Document it in the table above.
