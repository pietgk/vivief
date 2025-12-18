# @pietgk/devac-fixtures-typescript

TypeScript test fixtures for DevAC parser testing.

## Usage

```typescript
import { getFixturePath, FIXTURES_DIR } from "@pietgk/devac-fixtures-typescript";

// Get path to a specific fixture
const classFile = getFixturePath("sample-class.ts");

// Or use the directory directly
import path from "path";
const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
```

## Fixture Files

### Type-Checked Files

These files are included in `pnpm typecheck` and IDE type-checking:

- `sample-class.ts` - Classes, interfaces, enums, inheritance
- `sample-functions.ts` - Functions, arrow functions, callbacks
- `sample-jsx.tsx` - JSX/React components
- `hello.ts`, `valid.ts`, `pending.ts`, `new-file.ts`
- `perf-test.ts`, `perf-test-warm.ts`, `watch-perf-test.ts`
- `rapid-0.ts`, `rapid-1.ts`, `rapid-2.ts`

### Parser Test Files (excluded from type-check)

These files test parser capabilities with edge cases that may not pass strict
type checking. They are excluded from `tsconfig.json` but still valid for
parser testing:

- `sample-decorators.ts` - Legacy decorator patterns (TS5 incompatible)
- `sample-generics.ts` - Complex generic type inference edge cases
- `sample-advanced-types.ts` - Advanced type patterns with intentional duplicates
- `sample-modules.ts` - Module augmentation for fictional modules
- `sample-edge-cases.ts` - Intentional edge cases and unusual patterns

### Intentionally Broken Files

These files have been renamed to `.txt` extension to prevent IDE/editor errors:

- `error.ts.txt` - Contains intentional syntax errors
- `invalid.ts.txt` - Contains intentionally invalid code

## Type Checking

This package is configured with its own `tsconfig.json` that type-checks most
TypeScript fixtures. Run `pnpm --filter @pietgk/devac-fixtures-typescript typecheck`
to verify.

Files excluded from type-checking:
- `*.txt` files (intentionally broken)
- Parser test files with edge cases (listed above)
