# Skill: Add gRPC Endpoint

Step-by-step process for adding a new gRPC endpoint to a service.

## Procedure

1. **Define Proto**:
   Update the relevant `.proto` file in the `proto/` directory.
   ```proto
   service IdentityService {
     rpc MyNewMethod(MyRequest) returns (MyResponse);
   }
   ```

2. **Compile Proto**:
   From the root directory:
   ```bash
   make proto-python-compile
   ```

3. **Create DTO**:
   Update `core/<module>/dto.py` with request and response DTOs.
   - **MANDATORY**: DTOs must be **Pydantic models** (`pydantic.BaseModel`).
   - Use `frozen=True` configuration for DTOs.

4. **Implement Use Case**:
   Create `use_cases/<verb>_<noun>.py`.

5. **Update Servicer**:
   In `api/servicers/v1/<service>.py`, implement the new method.
   - Use `@inject` for DI.
   - Convert Proto request to DTO.
   - Execute Use Case.
   - Convert result DTO to Proto response.

6. **Add Converters**:
   If needed, add converter functions in `api/servicers/v1/converters.py`.

7. **Register in DI**:
   Ensure the new Use Case is registered in `infra/di/providers/use_cases.py`.

8. **Add Tests**:
   - Integration test for the API call in `tests/integration/api/`.
   - Unit test for the Use Case in `tests/unit/use_cases/`.
