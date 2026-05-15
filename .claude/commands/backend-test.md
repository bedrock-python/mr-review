---
description: Run backend tests for the current component or service (Docker or local pytest).
---

# /test command

**Purpose**: Run tests for the current component or service.

**Usage**:
- Docker: `make run-tests TESTS=<service>`
- Local: `uv run pytest tests`

**Checklist**:
- Start infra if needed (`make run-test-infra`).
- Check markers (`-m unit`, `-m integration`).
