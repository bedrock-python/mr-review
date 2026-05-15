# Base paths (run make from repo root so PROJECT_ROOT=. resolves correctly)
TOOLS_SCRIPTS_DIR = scripts/tools
TOOLS_ENV_FILE = $(TOOLS_SCRIPTS_DIR)/.env.tools
PROJECT_ROOT = .

# Include environment variables from tools env file if it exists
-include $(TOOLS_ENV_FILE)

.PHONY: tools-help alembic-new-migration

tools-help:
	@echo.
	@echo === Tools Commands ===
	@echo.
	@echo   make alembic-new-migration     - Create new Alembic migration
	@echo.
	@echo Examples:
	@echo   make alembic-new-migration SERVICE_CONTEXT=services/mr-review MIGRATION_MESSAGE=my_change
	@echo.
	@echo Note: Configure SERVICE_CONTEXT and MIGRATION_MESSAGE in $(TOOLS_ENV_FILE)
	@echo.

alembic-new-migration:
ifndef SERVICE_CONTEXT
	$(error SERVICE_CONTEXT is not set. Configure it in $(TOOLS_ENV_FILE) or pass as an argument)
endif
	cd $(SERVICE_CONTEXT) && uv run alembic revision --autogenerate -m "$(MIGRATION_MESSAGE)"
