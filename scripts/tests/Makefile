# Docker compose command
DOCKER_COMPOSE = docker compose

TESTS_SCRIPTS_DIR = scripts/tests
TESTS_ENV_FILE = $(TESTS_SCRIPTS_DIR)/.env.tests
TESTS_NETWORK_NAME = mr-review-test-network

ifeq ($(OS),Windows_NT)
	TESTS_NULL = NUL
else
	TESTS_NULL = /dev/null
endif

.PHONY: tests-help run-tests run-tests-docker stop-test-infra

tests-help:
	@echo.
	@echo === Test Environment Commands ===
	@echo.
	@echo   make run-tests                        - Run tests locally (uv run pytest)
	@echo   make run-tests TESTS=mr-review        - Run specific service tests locally
	@echo   make run-tests-docker                 - Run tests in Docker
	@echo   make stop-test-infra                  - Stop test Docker services
	@echo.

# Run tests locally (fast, no Docker)
run-tests:
ifeq ($(TESTS),)
	$(MAKE) -C services/mr-review test
	$(MAKE) -C services/web-app test
else
	$(MAKE) -C services/$(TESTS) test
endif

# Run tests in Docker
run-tests-docker:
	@docker network inspect $(TESTS_NETWORK_NAME) > $(TESTS_NULL) 2>&1 || docker network create $(TESTS_NETWORK_NAME)
	$(DOCKER_COMPOSE) \
		-p mr-review-tests \
		-f $(TESTS_SCRIPTS_DIR)/infra.compose.yml \
		-f $(TESTS_SCRIPTS_DIR)/tests.compose.yml \
		--profile mr-review-tests \
		up --build --abort-on-container-exit --exit-code-from mr-review-tests

stop-test-infra:
	$(DOCKER_COMPOSE) \
		-p mr-review-tests \
		-f $(TESTS_SCRIPTS_DIR)/infra.compose.yml \
		-f $(TESTS_SCRIPTS_DIR)/tests.compose.yml \
		--profile mr-review-tests \
		down --remove-orphans
