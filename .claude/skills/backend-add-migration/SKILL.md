---
name: backend-add-migration
description: Generate a new Alembic migration for a Python service via Docker (configure .env.tools, run make alembic-new-migration, verify upgrade/downgrade).
---

# Skill: Add Alembic Migration

Process for generating a new Alembic migration for a service using Docker.

## Prerequisites
- Service with Alembic configured (using `sqlalchemy-postgres-kit`).
- Docker and Makefile installed.

## Procedure

1. **Configure Environment**:
   Edit `scripts/tools/.env.tools` to point to the target service:
   ```bash
   SERVICE_IMAGE=ai-ops-<service-name>-api:local
   SERVICE_CONTEXT=services/<path-to-service>
   MIGRATION_MESSAGE=<description_of_changes>
   ```

2. **Run Generation**:
   Execute the make command from the root of the project:
   ```bash
   make alembic-new-migration
   ```

3. **Verify Output**:
   Check the newly created file in `services/<path-to-service>/migrations/versions/`.
   - Ensure the filename follows `YYYY_MM_DD_HHMM-<id>_<message>.py`.
   - Ensure `op.f()` is used for index/key names to comply with Naming Conventions.

4. **Review SQL**:
   Verify the `upgrade()` and `downgrade()` methods are correct.

## Common Issues
- **Image not found**: Ensure you have built the service image (`make -C services/<path> build` if applicable, or use a general dev image).
- **DB Connection**: The tool starts its own temporary Postgres container. Ensure no port conflicts.
