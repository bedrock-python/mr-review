# Docker and Makefile Workflow

All automation is handled via `make` commands and `docker-compose`.

## Core Commands

### Infrastructure
- `make run-infra`: Starts core infrastructure (Postgres, Redis, Kafka, MinIO).
- `make stop-all-services`: Stops everything.
- `make clean-volumes`: Deletes Docker volumes (requires `yes`).

### Development
- `make run-services`: Starts infra + services.
- `make run-services PROFILES='identity-service'`: Starts specific service.
- `make fmt-python-libs`: Formats all shared libraries.

### Testing
- `make run-test-infra`: Starts infra for testing (different ports from dev).
- `make run-tests`: Runs all tests in Docker.
- `make run-tests TESTS='identity-service'`: Runs tests for specific service.

### Tools
- `make alembic-new-migration`: Generates a new migration (requires `.env.tools` config).
- `make proto-python-compile`: Compiles `.proto` files to Python stubs.

## Configuration Files
- **Dev**: `scripts/dev/.env`
- **Tests**: `scripts/tests/.env.tests`
- **Tools**: `scripts/tools/.env.tools`

## Environment Setup for Migrations
Before running `make alembic-new-migration`, edit `scripts/tools/.env.tools`:
```bash
SERVICE_IMAGE=ai-ops-identity-service-api:local
SERVICE_CONTEXT=services/auth/identity-service
MIGRATION_MESSAGE=init_migration
```

## Docker Compose Profiles
We use profiles to manage subsets of services:
- `infra`: core databases
- `api-gateway`: envoy + control-plane
- `identity-service`, `password-vault`: individual apps
- `all`: everything
