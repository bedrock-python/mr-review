# ── OS Detection ──────────────────────────────────────────────────────────────
ifeq ($(OS),Windows_NT)
    DETECTED_OS := Windows
else
    UNAME := $(shell uname 2>/dev/null || echo Unknown)
    ifeq ($(UNAME),Darwin)
        DETECTED_OS := macOS
    else
        DETECTED_OS := Linux
    endif
endif

.PHONY: install dev fmt check test test-unit

install: ##@App Install dependencies
	uv sync --group dev

dev: ##@App Start development server
	uv run uvicorn mr_review.main:app --reload --host 127.0.0.1 --port 8000

fmt: ##@Code Format and lint with pre-commit
	uv run pre-commit run --all-files

check: ##@Code Run linter and type checker
	uv run ruff check .
	uv run mypy mr_review/ api/

test: ##@App Run all tests
	uv run pytest tests/ -v

test-unit: ##@App Run unit tests only
	uv run pytest tests/unit/ -v -m unit
