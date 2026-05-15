# Examples: Create from Template

This file contains examples of how to use the `create-from-template` skill.

## Example 1: Full Python Service

### Input:
"Create a new full Python service named 'payment-service' in the 'finance' domain. Prefix for env: 'PAYMENT'. Proto path: 'aiops/finance/v1'."

### Actions:
1.  **Select Template**: `templates/python-service-full/`
2.  **Gather Values**:
    - `<SERVICE_NAME>`: `payment-service`
    - `<SERVICE_NAME_SNAKE>`: `payment_service`
    - `<SERVICE_NAME_TITLE>`: `Payment Service`
    - `<SERVICE_PREFIX>`: `PAYMENT`
    - `<SERVICE_DOMAIN>`: `finance`
    - `<PROTO_PATH>`: `aiops/finance/v1`
    - `<AUTHOR_NAME>`: `Alex Shalaev`
    - `<AUTHOR_EMAIL>`: `shalaevad.alexey@yandex.ru`
3.  **Destination Path**: `services/finance/payment-service/`
4.  **Process**:
    - Copy `templates/python-service-full/` -> `services/finance/payment-service/`
    - Rename `services/finance/payment-service/SERVICE_NAME_SNAKE/` -> `services/finance/payment-service/payment_service/`
    - Replace placeholders in all files within `services/finance/payment-service/`.
    - Move `deploy/` and `vault/` to their final locations (if needed, otherwise keep them in the service folder and instruct the user to move them).
    - **Note**: In our templates, `deploy/` and `vault/` are inside the service directory. The user may want them moved to `deploy/services/` and `infra/k8s/vault/envs/services/` respectively. The skill should handle this.

## Example 2: Python Library

### Input:
"Create a new Python library named 'http-client-kit' in 'libs/python/communication/http'. Description: 'Shared HTTP client utilities'."

### Actions:
1.  **Select Template**: `templates/python-library/`
2.  **Gather Values**:
    - `<PACKAGE_NAME>`: `http-client-kit`
    - `<PACKAGE_NAME_SNAKE>`: `http_client_kit`
    - `<PACKAGE_DESCRIPTION>`: `Shared HTTP client utilities`
    - `<DOMAIN>`: `communication`
    - `<CATEGORY>`: `http`
    - `<AUTHOR_NAME>`: `Alex Shalaev`
    - `<AUTHOR_EMAIL>`: `shalaevad.alexey@yandex.ru`
3.  **Destination Path**: `libs/python/communication/http/http-client-kit/`
4.  **Process**:
    - Copy `templates/python-library/` -> `libs/python/communication/http/http-client-kit/`
    - Rename `libs/python/communication/http/http-client-kit/PACKAGE_NAME_SNAKE/` -> `libs/python/communication/http/http-client-kit/http_client_kit/`
    - Replace placeholders in all files.
