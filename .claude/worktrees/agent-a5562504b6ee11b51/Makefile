# MR Review Main Makefile
# Root entry point for all project commands

.DEFAULT_GOAL := help

# Include scripts Makefile
include scripts/Makefile

.PHONY: help

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

.PHONY: fmt-services

fmt-services:
	$(MAKE) -C services/mr-review fmt
	$(MAKE) -C services/web-app fmt
