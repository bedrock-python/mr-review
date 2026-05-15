DOCKER_COMPOSE = docker compose

DEV_SCRIPTS_DIR = scripts/dev
DEV_ENV_FILE = $(DEV_SCRIPTS_DIR)/.env
DEV_NETWORK_NAME = mr-review-network

SERVICES_COMPOSE_DIR = $(DEV_SCRIPTS_DIR)/services
SERVICES_COMPOSE_FILES = $(wildcard $(SERVICES_COMPOSE_DIR)/*.compose.yml)
SERVICES_COMPOSE_FLAGS = $(foreach f,$(SERVICES_COMPOSE_FILES),-f $(f))

ifeq ($(OS),Windows_NT)
    DEV_NULL = NUL
else
    DEV_NULL = /dev/null
endif

.PHONY: dev-help ensure-network run-services stop-all-services clean-volumes dev

dev-help:
	@echo.
	@echo === Development Environment Commands ===
	@echo.
	@echo   make dev               - Start backend + frontend dev servers (local, no Docker)
	@echo   make run-services      - Start all services with Docker Compose
	@echo   make stop-all-services - Stop all Docker services
	@echo   make clean-volumes     - Stop services and remove volumes (DESTRUCTIVE)
	@echo.
	@echo Examples:
	@echo   make dev
	@echo   make run-services
	@echo   make run-services PROFILES=mr-review
	@echo.

ensure-network:
	@docker network inspect $(DEV_NETWORK_NAME) > $(DEV_NULL) 2>&1 || docker network create $(DEV_NETWORK_NAME)

run-services: ensure-network
ifeq ($(PROFILES),)
	$(DOCKER_COMPOSE) \
		-p mr-review-dev \
		-f $(DEV_SCRIPTS_DIR)/infra.compose.yml \
		$(SERVICES_COMPOSE_FLAGS) \
		--env-file $(DEV_ENV_FILE) \
		--profile all \
		up --build -d
else
	$(DOCKER_COMPOSE) \
		-p mr-review-dev \
		-f $(DEV_SCRIPTS_DIR)/infra.compose.yml \
		$(SERVICES_COMPOSE_FLAGS) \
		--env-file $(DEV_ENV_FILE) \
		$(foreach p,$(PROFILES),--profile $(p)) \
		up --build -d
endif

stop-all-services:
	$(DOCKER_COMPOSE) \
		-p mr-review-dev \
		-f $(DEV_SCRIPTS_DIR)/infra.compose.yml \
		$(SERVICES_COMPOSE_FLAGS) \
		--env-file $(DEV_ENV_FILE) \
		--profile all \
		down

clean-volumes:
	@echo "WARNING: This will remove all volumes and data!"
	@echo "Type 'yes' to confirm:"
	@$(SHELL) -c 'read confirm && [ "$$confirm" = "yes" ]' || (echo "Cancelled." && exit 1)
	$(DOCKER_COMPOSE) \
		-p mr-review-dev \
		-f $(DEV_SCRIPTS_DIR)/infra.compose.yml \
		$(SERVICES_COMPOSE_FLAGS) \
		--env-file $(DEV_ENV_FILE) \
		--profile all \
		down --volumes --remove-orphans

dev:
	$(MAKE) -C services/mr-review dev &
	$(MAKE) -C services/web-app dev
