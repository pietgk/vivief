# @devac/fixtures-python

Python test fixtures for DevAC parser testing.

## Project Structure

This is a proper Python project with type checking via pyright.

```
fixtures-python/
├── pyproject.toml      # Python project configuration
├── package.json        # npm integration for turbo
├── sample_class.py     # Class definitions, methods, inheritance
├── sample_functions.py # Functions, decorators, generators
├── sample_imports.py   # Import statements
└── sample_modern_python.py  # Modern Python 3.9+ features
```

## Type Checking

Run type checking with:

```bash
pnpm --filter @devac/fixtures-python typecheck
```

This uses pyright to validate Python type hints.

## Usage in Tests

```typescript
import path from "path";

// Note: files are at package root, not in src/
const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-python");
const filePath = path.join(FIXTURES_DIR, "sample_class.py");
```

## File Naming Convention

Python files use snake_case naming convention:
- `sample_class.py` (not `sample-class.py`)
- `sample_functions.py`
- `sample_imports.py`
- `sample_modern_python.py`
