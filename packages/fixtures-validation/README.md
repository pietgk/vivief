# Fixtures Validation

Test fixtures for the DevAC validation system. These packages contain **intentional errors** for testing validation detection capabilities.

## Packages

| Package | Purpose | Errors |
|---------|---------|--------|
| `pkg-clean` | Control fixture | None (should pass all validators) |
| `pkg-ts-errors` | TypeScript errors | Type mismatches (TS2322) |
| `pkg-lint-errors` | ESLint violations | `no-unused-vars`, `no-var`, `no-console` |
| `pkg-test-failures` | Failing tests | Intentionally failing test assertions |
| `pkg-multi-depend` | Cross-package | Depends on `pkg-clean`, tests dependency graph |

## Usage

These fixtures are used by integration and E2E tests in `@pietgk/devac-cli` and `@pietgk/devac-core`.

### In Tests

```typescript
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";

const harness = new ValidationTestHarness();
const workspace = await harness.createTempWorkspace(["pkg-ts-errors"]);

const result = await harness.runValidation({
  packagePath: workspace.packages["pkg-ts-errors"],
  mode: "quick",
});

expect(result.typecheck?.success).toBe(false);
expect(result.typecheck?.issues.length).toBeGreaterThan(0);
```

## Important Notes

- **Do not run `typecheck` on this package** - It contains intentional type errors
- **Do not run `lint` on this package** - It contains intentional lint violations
- **These fixtures should be excluded from CI validation** - They are only consumed by tests

## Adding New Fixtures

1. Create a new `pkg-*` directory
2. Add `package.json`, `tsconfig.json`, and source files
3. Document the expected errors in this README
4. Update the tsconfig.json references
