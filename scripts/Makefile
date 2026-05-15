# Scripts Makefile
# Aggregates all script-related commands


# Include all sub-Makefiles
include scripts/dev/Makefile
include scripts/tests/Makefile
include scripts/tools/Makefile

.PHONY: scripts-help

scripts-help:
	@echo.
	@echo ==========================================
	@echo   MR Review Scripts Management
	@echo ==========================================
	@echo.
	@$(MAKE) -s dev-help
	@$(MAKE) -s tests-help
	@$(MAKE) -s tools-help
