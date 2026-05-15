# Skill: Run Tests

Guidelines for executing tests in the AI-Ops project.

## Options

### 1. Docker-based (Recommended for Integration)
Best for running tests with real databases, Redis, and Kafka.

- **Start Test Infrastructure**:
  ```bash
  make run-test-infra
  ```
- **Run Tests for a Service**:
  ```bash
  make run-tests TESTS=<service-name>
  ```
- **Cleanup**:
  ```bash
  make stop-test-infra
  ```

### 2. Local execution (Best for Unit Tests)
Faster for development and local iterations.

- **Prerequisites**: Installed dependencies via `uv`.
- **Run all tests in current directory**:
  ```bash
  uv run pytest tests
  ```
- **Run specific marker**:
  ```bash
  uv run pytest -m unit tests
  ```

### 3. All Shared Libraries
```bash
make test-python-libs
```

## Troubleshooting
- **Port Conflicts**: Test infrastructure uses different ports (e.g., 25432 for Postgres) to avoid conflicts with dev infra.
- **Environment Variables**: Local tests might need a `.env.test` file.
- **Asyncio**: Ensure `@pytest.mark.asyncio` is used for async tests.
