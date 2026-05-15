---
description: Generate a new Alembic migration for a service.
---

# /migrate command

**Purpose**: Generate a new Alembic migration for a service.

**Usage**:
1. Identify target service.
2. Edit `scripts/tools/.env.tools`.
3. Run `make alembic-new-migration`.

**Rules**:
- Check for naming conventions (`op.f()`).
- Verify `upgrade` and `downgrade`.
