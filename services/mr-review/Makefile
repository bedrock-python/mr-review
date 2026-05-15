# ============================================================
# OS Detection
# ============================================================
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
else
	UNAME := $(shell uname 2>/dev/null || echo "Unknown")
	ifeq ($(UNAME),Linux)
		DETECTED_OS := Linux
	else ifeq ($(UNAME),Darwin)
		DETECTED_OS := macOS
	else
		DETECTED_OS := Unix
	endif
endif

# ============================================================
# Targets
# ============================================================

.PHONY: fmt install reinstall-custom-libs run-api test

fmt:  ##@Code Check code with pre-commit
	uv run --extra dev python -m pre_commit run --all-files

install: ##@App Install raw dependencies
	uv sync --all-extras

reinstall-custom-libs: ##@App Reinstall all local custom libraries and sync env
	uv sync --all-extras $(CUSTOM_UV_REINSTALL_ARGS)

run-api:	##@App Run API server
	uv run --extra api python -m mr_review.api.entrypoint

test:	##@App Test application
ifeq ($(OS),Windows_NT)
	uv run pytest tests
else
	uv run pytest tests
endif
