# Python Library Maintenance Workflow

When working on or updating libraries in `libs/python/`, follow this iterative process to ensure code quality and stability.

## Iterative Steps

For the library you are modifying (or for each library in `libs/python/` if performing a global update), execute these steps sequentially:

1.  **Formatting**: Run `make fmt`. Fix any issues until it passes (exit code 0).
2.  **Checks**: Run `make check`. Fix any linting or type-checking errors until it passes (exit code 0).
3.  **Testing**: Run `make test`. Fix any test failures until all tests pass (exit code 0).

## Final Verification

After all individual steps have passed, run the full suite once more to ensure no regressions:

```bash
make fmt && make check && make test
```

**CRITICAL**: You must fix all issues found in each step before moving to the next. If a later step requires changes that might affect an earlier step (e.g., fixing a test bug changes formatting), you must re-verify the earlier steps.
