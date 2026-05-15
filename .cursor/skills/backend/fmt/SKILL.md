# Skill: Format Code

Standard procedure for linting and formatting code across the project.

## Commands

### Format all Python Libraries
From the root directory:
```bash
make fmt-python-libs
```

### Format a Specific Service or Library
Go to the component directory and run:
```bash
make fmt
```
*Note: This usually runs `ruff format .` and `ruff check --fix .`*

## Manual Execution (Ruff)
If `make` is not available:
```bash
ruff format .
ruff check --fix .
```

## IDE Integration
- Configure Cursor to "Format on Save" using Ruff.
- Ensure the `ruff` extension is installed.

## Pre-commit
Formatting is also enforced during commit via pre-commit hooks. If a commit fails due to formatting, run the commands above and re-add the files.
