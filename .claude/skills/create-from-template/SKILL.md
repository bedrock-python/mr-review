---
name: create-from-template
description: Bootstrap a new Python service or library from templates/ — read GUIDE.md, gather placeholders (kebab/snake/title), copy & rename, follow phased post-creation checklist.
---

# Skill: Create Component from Template

Automated process for creating a new service or library from existing templates in the `templates/` directory.

## Procedure

1.  **Select Template Type**:
    Choose the appropriate template from `templates/`:
    - `python-service-full`: Full Python service with gRPC API and background Worker (PostgreSQL, Kafka, Redis, full observability)
    - `python-library`: Shared Python library for common utilities and patterns

    **CRITICAL**: Before starting, you MUST read the `GUIDE.md` file inside the selected template directory. It contains comprehensive step-by-step instructions from zero to production deployment. The GUIDE.md includes:
    - Complete phase-by-phase checklists (generation → development → testing → deployment)
    - Detailed instructions for each phase with code examples
    - Best practices and common patterns from existing services
    - Infrastructure setup (Vault, K8s, CI/CD, Docker Compose)
    - Testing strategies and quality requirements

    Follow ALL steps described in `GUIDE.md` sequentially. Each phase has specific deliverables that must be completed before moving to the next phase.

2.  **Gather Values**:
    Ask the user for the following values (provide defaults if possible):

    **For Services:**
    - `<SERVICE_NAME>`: Service name in kebab-case (e.g., `identity-service`).
    - `<SERVICE_NAME_SNAKE>`: Service name in snake_case (derived from `<SERVICE_NAME>`).
    - `<SERVICE_NAME_TITLE>`: Human-readable service name (e.g., `Identity Service`).
    - `<SERVICE_PREFIX>`: Prefix for environment variables in uppercase (e.g., `IDENTITY`).
    - `<SERVICE_DOMAIN>`: Parent directory in `services/` (e.g., `auth-platform`).
    - `<PROTO_PATH>`: Path to proto files (e.g., `aiops/identity/v1`).
    - `<AUTHOR_NAME>`: Author's name (default to "Alex Shalaev").
    - `<AUTHOR_EMAIL>`: Author's email (default to "shalaevad.alexey@yandex.ru").

    **For Libraries:**
    - `<PACKAGE_NAME>`: Package name in kebab-case (e.g., `grpc-client-kit`).
    - `<PACKAGE_NAME_SNAKE>`: Package name in snake_case (derived from `<PACKAGE_NAME>`).
    - `<PACKAGE_DESCRIPTION>`: Brief description of the library.
    - `<DOMAIN>`: Parent directory in `libs/python/` (e.g., `common`, `communication`).
    - `<CATEGORY>`: Sub-directory if any (e.g., `grpc`, `utils`).
    - `<AUTHOR_NAME>`: Author's name (default to "Alex Shalaev").
    - `<AUTHOR_EMAIL>`: Author's email (default to "shalaevad.alexey@yandex.ru").

3.  **Calculate Path**:
    - Service destination: `services/<SERVICE_DOMAIN>/<SERVICE_NAME>/`
    - Library destination: `libs/python/<DOMAIN>/<CATEGORY>/<PACKAGE_NAME>/` (if no category: `libs/python/<DOMAIN>/<PACKAGE_NAME>/`)

4.  **Copy and Replace**:
    1.  Create destination directories.
    2.  Copy all files and folders from the selected template to the destination.
    3.  **Rename** the package directory `SERVICE_NAME_SNAKE` (or `PACKAGE_NAME_SNAKE` for libraries) to the real snake_case name, then replace all `<PLACEHOLDER>` tokens in file contents.
    4.  **Recursively replace** placeholders within all file contents.

5.  **Post-Creation Checklist**:
    - **Follow GUIDE.md**: The GUIDE.md contains a comprehensive checklist divided into phases (typically 10 phases for services, 5 for libraries). Complete each phase sequentially:
      - **Services**: Generation → Proto/gRPC → Domain (Core) → Infrastructure → Use Cases → Testing → Infrastructure Setup → Deployment → Local Dev → CI/CD
      - **Libraries**: Generation → Development → Testing → Quality → Integration
    - Run `make install` in the new directory to install dependencies
    - Initialize git hooks: `uv run pre-commit install`
    - For libraries: Add the library to `libs/python/README.md`
    - **DO NOT delete GUIDE.md** - keep it as reference documentation for the component
    - Refer back to GUIDE.md when adding new features or onboarding team members

## Example Commands

- "Create a new full Python service named 'billing-service' in the 'finance' domain."
- "Create a new Python library named 'auth-utils' in 'libs/python/common/utils'."
