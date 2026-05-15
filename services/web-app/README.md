# MR Review Web Application

Enterprise-grade frontend application built with React, TypeScript, and Feature-Sliced Design architecture.

## Features

- **Feature-Sliced Design**: Scalable and maintainable architecture.
- **Strict Type Safety**: TypeScript 5.8+ with strict rules.
- **Modern State Management**: TanStack Query, Zustand, and nuqs.
- **Accessible UI**: Radix UI primitives.
- **Internationalization**: Full support for English and Russian.
- **Production Ready**: Optimized Docker builds, security headers, and health checks.

## Setup

1. Install dependencies:
   ```bash
   make install
   ```
2. Set up environment:
   ```bash
   cp .env.example .env.local
   ```
3. Start development server:
   ```bash
   make dev
   ```

## Development

- `make fmt`: Format and lint code.
- `make test`: Run unit and integration tests with coverage.
- `make typecheck`: Run TypeScript compiler checks.
- `make build`: Create production build.

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Development Workflow](docs/DEVELOPMENT.md)
- [Scripts Reference](docs/SCRIPTS.md)
