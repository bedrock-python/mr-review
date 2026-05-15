DOCKER_COMPOSE = docker compose

TESTS_SCRIPTS_DIR = scripts/tests
TESTS_ENV_FILE = $(TESTS_SCRIPTS_DIR)/.env.tests

.PHONY: tests-help run-tests run-tests-docker stop-test-infra

tests-help:
	@echo.
	@echo === Test Environment Commands ===
	@echo.
	@echo   make run-tests                         - Run all tests (local)
	@echo   make run-tests TESTS=mr-review          - Run specific service tests (local)
	@echo   make run-tests-docker                  - Run all tests with Docker Compose
	@echo   make stop-test-infra                   - Stop test infrastructure
	@echo.

run-tests:
ifeq ($(TESTS),)
	$(MAKE) -C services/mr-review test
	$(MAKE) -C services/web-app test
else
	$(MAKE) -C services/$(TESTS) test
endif

run-tests-docker:
ifeq ($(TESTS),)
	$(DOCKER_COMPOSE) \
		-p mr-review-tests \
		-f $(TESTS_SCRIPTS_DIR)/infra.compose.yml \
		-f $(TESTS_SCRIPTS_DIR)/tests.compose.yml \
		--env-file $(TESTS_ENV_FILE) \
		--profile all \
		up --build \
		--force-recreate \
		--remove-orphans
else
	$(DOCKER_COMPOSE) \
		-p mr-review-tests \
		-f $(TESTS_SCRIPTS_DIR)/infra.compose.yml \
		-f $(TESTS_SCRIPTS_DIR)/tests.compose.yml \
		--env-file $(TESTS_ENV_FILE) \
		$(foreach t,$(TESTS),--profile $(t)) \
		up --build \
		--abort-on-container-exit \
		--force-recreate \
		--remove-orphans
endif

stop-test-infra:
	$(DOCKER_COMPOSE) \
		-p mr-review-tests \
		-f $(TESTS_SCRIPTS_DIR)/infra.compose.yml \
		--env-file $(TESTS_ENV_FILE) \
		down --remove-orphans
