# Changelog

## Unreleased

### Bug Fixes

- All-in-one image: the container health check now probes `/system/health/livez`. The
  previous `/health` probe was answered by the SPA fallback, so the container reported
  healthy whatever state the application was in

## v0.1.0 (2026-05-14)

### Features

- Initial project scaffolding with backend and frontend
- GitLab and GitHub VCS host support
- Anthropic (Claude) and OpenAI-compatible AI providers
- Five-stage review pipeline: PICK → BRIEF → DISPATCH → POLISH → POST
- SQLite storage for host configuration and review history
- Streaming review output via SSE
