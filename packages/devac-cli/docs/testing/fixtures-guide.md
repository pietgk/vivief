# Fixtures Guide

This document details the test fixture packages, their purposes, and the specific errors they contain.

## Overview

**Location:** `packages/fixtures-validation/`

Fixtures are pre-built TypeScript packages with intentional errors used to verify validation behavior. Each fixture targets a specific validation type.

| Fixture | Purpose | Expected Result |
|---------|---------|-----------------|
| `pkg-clean` | Control baseline | ✓ All validators pass |
| `pkg-ts-errors` | TypeScript validation | ✗ 7 type errors |
| `pkg-lint-errors` | Linting validation | ✗ 10+ Biome violations |
| `pkg-test-failures` | Test runner validation | ✗ 7 failing tests |
| `pkg-multi-depend` | Cross-package dependencies | ✓ Pass (depends on pkg-clean) |

---

## pkg-clean

**Purpose:** Control fixture for baseline testing. Verifies that valid code passes all validators.

**Expected Behavior:**
- TypeScript: ✓ No errors
- Linting: ✓ No violations
- Tests: ✓ All pass

**Structure:**
```
pkg-clean/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts     # Valid TypeScript code
```

**Use Cases:**
- Baseline for comparison tests
- Verifying "no issues" output format
- Testing successful validation path

---

## pkg-ts-errors

**Purpose:** Verify TypeScript error detection. Contains 7 intentional type errors covering common type mismatches.

**Expected Behavior:**
- TypeScript: ✗ 7 errors
- Linting: ✓ No violations (errors are type-related, not lint)
- Tests: N/A

### Error Breakdown

**File:** `src/type-errors.ts`

| # | Error Code | Description | Line |
|---|------------|-------------|------|
| 1 | TS2322 | String assigned to number variable | ~5 |
| 2 | TS2322 | Number assigned to string variable | ~8 |
| 3 | TS2322 | Boolean assigned to array variable | ~11 |
| 4 | TS2322 | String returned from function expecting number | ~16 |
| 5 | TS2345 | Wrong argument type (string passed to number param) | ~21 |
| 6 | TS2339 | Accessing non-existent property on object | ~26 |
| 7 | TS2741 | Missing required properties in object literal | ~31 |

**Code Example (abridged):**
```typescript
// Error 1: TS2322 - Type 'string' is not assignable to type 'number'
const numberVar: number = "not a number"; // @ts-expect-error

// Error 5: TS2345 - Argument of type 'string' is not assignable
function expectsNumber(n: number): number {
  return n * 2;
}
expectsNumber("string"); // @ts-expect-error

// Error 7: TS2741 - Missing required property
interface RequiredProps {
  name: string;
  age: number;
}
const partial: RequiredProps = { name: "test" }; // @ts-expect-error - missing 'age'
```

**Use Cases:**
- Verifying TypeScript compiler integration
- Testing error count extraction
- Validating type error reporting format

---

## pkg-lint-errors

**Purpose:** Verify Biome linting error detection. Contains 10+ intentional lint violations.

**Expected Behavior:**
- TypeScript: ✓ No type errors
- Linting: ✗ 10+ Biome violations
- Tests: N/A

### Violation Breakdown

**File:** `src/lint-errors.ts`

| Rule | Description | Count |
|------|-------------|-------|
| `noUnusedImports` | Unused import statement | 1 |
| `noUnusedVariables` | Unused variable declarations | 2 |
| `useConst` | `let` used for non-reassigned variable | 1 |
| `noExplicitAny` | Explicit `any` type usage | 1 |
| `noNonNullAssertion` | Non-null assertion operator `!` | 1 |
| `noAssignInExpressions` | Assignment inside condition | 1 |
| `noForEach` | Using `forEach` instead of `for...of` | 1 |
| `noImplicitAnyLet` | `let` without type annotation | 1+ |

**Code Example (abridged):**
```typescript
// biome-ignore lint/correctness/noUnusedImports: Testing unused import
import path from "path";

// biome-ignore lint/correctness/noUnusedVariables: Testing unused variable
const unusedVariable = "never used";

// biome-ignore lint/style/useConst: Testing let vs const
let shouldBeConst = "this is never reassigned";

// biome-ignore lint/suspicious/noExplicitAny: Testing any usage
function takesAny(value: any): void {
  console.log(value);
}

// biome-ignore lint/style/noNonNullAssertion: Testing non-null assertion
const maybeNull: string | null = null;
const definitelyString = maybeNull!;
```

**Use Cases:**
- Verifying Biome/ESLint integration
- Testing lint violation reporting
- Validating warning vs error categorization

---

## pkg-test-failures

**Purpose:** Verify test failure detection. Contains intentionally buggy functions and their failing tests.

**Expected Behavior:**
- TypeScript: ✓ No type errors
- Linting: ✓ No violations
- Tests: ✗ 7 failures, 1 pass

### Test Breakdown

**File:** `src/buggy-functions.ts` + `src/buggy-functions.test.ts`

| Function | Bug Description | Failing Tests |
|----------|-----------------|---------------|
| `buggyAdd(a, b)` | Returns `a + b + 1` (off-by-one) | 2 |
| `buggySubtract(a, b)` | Returns `a * b` (wrong operation) | 1 |
| `buggyFormatName(first, last)` | Returns "last, first" (wrong order) | 1 |
| `buggySum(items)` | Returns `sum - 1` (off-by-one) | 2 |
| `buggyFetch()` | Always throws error | 1 |
| `workingMultiply(a, b)` | Correct implementation | 0 (control) |

**Code Example:**
```typescript
// Buggy implementation
export function buggyAdd(a: number, b: number): number {
  return a + b + 1; // Bug: off-by-one error
}

// Test file
describe("buggyAdd", () => {
  it("should add two positive numbers", () => {
    expect(buggyAdd(2, 3)).toBe(5); // Fails: returns 6
  });

  it("should handle zero", () => {
    expect(buggyAdd(0, 0)).toBe(0); // Fails: returns 1
  });
});
```

**Use Cases:**
- Verifying test runner integration
- Testing failure count extraction
- Validating test output parsing

---

## pkg-multi-depend

**Purpose:** Test cross-package dependency scenarios. Depends on `pkg-clean`.

**Expected Behavior:**
- TypeScript: ✓ No errors (if dependencies valid)
- Linting: ✓ No violations
- Tests: ✓ All pass

**Structure:**
```
pkg-multi-depend/
├── package.json         # Contains dependency on pkg-clean
├── tsconfig.json
└── src/
    └── index.ts         # Imports from pkg-clean
```

**package.json (relevant portion):**
```json
{
  "dependencies": {
    "pkg-clean": "workspace:*"
  }
}
```

**Use Cases:**
- Testing `--affected` flag behavior
- Verifying cross-package error propagation
- Testing multi-package workspace validation

---

## Using Fixtures in Tests

### Single Fixture

```typescript
const workspace = await harness.createTempWorkspace({
  fixtures: ["pkg-ts-errors"],
  initGit: true,
});

// Access fixture path
const pkgPath = workspace.packages["pkg-ts-errors"];
```

### Multiple Fixtures

```typescript
const workspace = await harness.createTempWorkspace({
  fixtures: ["pkg-clean", "pkg-ts-errors", "pkg-lint-errors"],
  initGit: true,
});

// Access each fixture
const cleanPath = workspace.packages["pkg-clean"];
const tsErrorsPath = workspace.packages["pkg-ts-errors"];
```

### Fixture with Dependencies

```typescript
const workspace = await harness.createTempWorkspace({
  fixtures: ["pkg-clean", "pkg-multi-depend"], // Order matters for deps
  initGit: true,
});
```

---

## Creating New Fixtures

When adding a new fixture:

1. **Create directory:** `fixtures-validation/pkg-new-fixture/`

2. **Add package.json:**
   ```json
   {
     "name": "pkg-new-fixture",
     "version": "1.0.0",
     "type": "module",
     "main": "dist/index.js",
     "scripts": {
       "build": "tsc",
       "test": "vitest"
     }
   }
   ```

3. **Add tsconfig.json:**
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "dist"
     },
     "include": ["src"]
   }
   ```

4. **Add source files with intentional issues**

5. **Document in this guide:**
   - Purpose and expected behavior
   - Detailed error/violation breakdown
   - Use cases

6. **Update tests to use new fixture**

---

## Fixture Maintenance

### Updating Error Counts

If fixture errors change:

1. Update the documentation table in this file
2. Update any hardcoded assertions in tests
3. Run full test suite to verify

### Adding New Error Types

When adding errors to existing fixtures:

1. Add comments explaining the error (`// @ts-expect-error` or `// biome-ignore`)
2. Update the error count in this documentation
3. Verify the fixture still serves its purpose

### Deprecating Fixtures

To deprecate a fixture:

1. Add `DEPRECATED.md` to fixture directory
2. Update this guide
3. Migrate dependent tests
4. Remove after migration complete
