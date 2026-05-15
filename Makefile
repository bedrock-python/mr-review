# MR Review Main Makefile
# Root entry point for all project commands

.DEFAULT_GOAL := help

# Include scripts Makefile
include scripts/Makefile

.PHONY: help docs-serve docs-build

help:
	@echo.
	@echo ==========================================
	@echo   MR Review Project Management
	@echo ==========================================
	@echo.
	@$(MAKE) -s scripts-help
	@echo.
	@echo ==========================================
	@echo   Development and Tests
	@echo ==========================================
	@echo.
	@echo   make fmt-services          - Format all services (make fmt in each service dir)
	@echo.
	@echo ==========================================
	@echo   Documentation
	@echo ==========================================
	@echo.
	@echo   make docs-serve            - Serve documentation locally (http://localhost:8080)
	@echo   make docs-build            - Build static documentation site to site/
	@echo.

.PHONY: fmt-services

fmt-services:
	$(MAKE) -C services/mr-review fmt
	$(MAKE) -C services/web-app fmt

docs-serve:
	python -c "import shutil; shutil.copy('CHANGELOG.md', 'docs/changelog.md')"
	uv run --group docs zensical serve

docs-build:
	python -c "import shutil; shutil.copy('CHANGELOG.md', 'docs/changelog.md')"
	uv run --group docs zensical build --clean
