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

.PHONY: fmt lint install test dev build typecheck clean

fmt:  ##@Code Format and lint code
	pnpm lint:fix && pnpm format

lint:  ##@Code Lint code
	pnpm lint

install: ##@App Install dependencies
	pnpm install --frozen-lockfile

test:	##@App Test application
	pnpm test:coverage

dev:	##@App Run development server
	pnpm dev

build:	##@App Build for production
	pnpm build

typecheck:	##@App Type check TypeScript
	pnpm typecheck

clean:	##@App Clean build artifacts
ifeq ($(DETECTED_OS),Windows)
	if exist dist rmdir /s /q dist
	if exist node_modules\.vite rmdir /s /q node_modules\.vite
	if exist coverage rmdir /s /q coverage
else
	rm -rf dist node_modules/.vite coverage
endif
