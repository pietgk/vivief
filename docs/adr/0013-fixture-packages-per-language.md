# ADR 0013: Fixture Packages Per Language

## Status

Accepted

## Date

2025-12-18

## Context

Test fixtures in `test-fixtures/` were excluded from TypeScript type-checking via
tsconfig exclude patterns. This caused several problems:

1. Valid TypeScript fixtures weren't type-checked, so real errors could slip in
2. The IDE showed errors for intentionally broken files (`error.ts`, `invalid.ts`)
3. Sample files were not part of a proper package structure, making them
   difficult to configure for type-checking
4. Mixed languages (TypeScript, Python, C#) in a single directory made it
   unclear which files should be type-checked

## Decision

Reorganize test fixtures into separate workspace packages per language, with each
language using its idiomatic project structure and type-checking tools:

### Package Structure

```
packages/
├── fixtures-typescript/   # TypeScript fixtures
│   ├── package.json       # npm package with tsc typecheck script
│   ├── tsconfig.json      # TypeScript configuration
│   └── src/               # TypeScript/TSX fixture files
├── fixtures-python/       # Python fixtures
│   ├── package.json       # npm package for turbo integration (pyright)
│   ├── pyproject.toml     # Python project configuration
│   └── *.py               # Python fixture files (snake_case naming)
└── fixtures-csharp/       # C# fixtures
    ├── package.json       # npm package for turbo integration (dotnet build)
    ├── Fixtures.csproj    # .NET project file
    └── *.cs               # C# fixture files
```

### Language-Specific Type Checking

Each language uses its native type-checking toolchain:

| Language   | Tool          | Command                    | Config File       |
|------------|---------------|----------------------------|-------------------|
| TypeScript | tsc           | `tsc --noEmit`             | tsconfig.json     |
| Python     | pyright       | `pyright`                  | pyproject.toml    |
| C#         | dotnet        | `dotnet build`             | Fixtures.csproj   |

All packages have a `package.json` with a `typecheck` script, enabling uniform
orchestration via `turbo run typecheck`.

### TypeScript Fixtures Configuration

- Intentionally broken files renamed to `.txt` extension to prevent IDE errors
  - `error.ts.txt` and `invalid.ts.txt` contain intentionally broken syntax for parser error handling tests
- Parser test files with edge cases excluded from type-checking via tsconfig.json:
  - `sample-advanced-types.ts` - Complex type constructs that may not fully type-check
  - `sample-decorators.ts` - Decorator patterns for parser testing
  - `sample-edge-cases.ts` - Edge case syntax patterns
  - `sample-generics.ts` - Generic type patterns
  - `sample-modules.ts` - Module import/export patterns
- Test-generated files excluded from type-checking (created dynamically by tests):
  - `error.ts`, `invalid.ts` - Intentionally broken syntax for error handling tests
  - `hello.ts`, `valid.ts`, `pending.ts`, `new-file.ts` - Simple test files
  - `perf-test.ts`, `perf-test-warm.ts`, `watch-perf-test.ts` - Performance test files
  - `rapid-*.ts` - Rapid change test files
- Relaxed type-checking settings (strict: false, noImplicitAny: false) for fixture flexibility
- React types included for JSX/TSX fixtures

### Python Fixtures Configuration

- Uses Python 3.11+ for modern features (match statements, type unions)
- pyright in basic mode with lenient settings for parser test files
- Files use snake_case naming convention (e.g., `sample_class.py`)

### C# Fixtures Configuration

- Targets .NET 8.0 with C# 12 language features
- Excludes sample-project/ subdirectory from compilation
- Allows unsafe code blocks for advanced fixture scenarios

### Test Updates

Tests updated to use language-specific fixture paths:
```typescript
const TS_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-typescript/src");
const PY_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-python");
const CS_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-csharp");
```

Note: Python and C# fixtures are in the package root (no `src/` subdirectory)
following their respective language conventions.

## Consequences

### Positive

- All fixtures are type-checked using native language tooling
- IDE shows appropriate errors/warnings for each language
- Clear separation of fixtures by language
- Uniform `pnpm typecheck` works across all languages via turbo
- Each language follows its idiomatic project structure
- Easy to add new languages in the future

### Negative

- Tests need to specify which fixture directory to use
- Slightly more complex directory structure
- Snapshot tests needed updating due to path changes in entity IDs
- Python type checking requires pyright npm package

### Neutral

- Parser test files with intentional edge cases have lenient type-checking
  settings but remain validated for syntax correctness

## Alternatives Considered

1. **Single fixtures directory with complex tsconfig excludes**: Rejected because
   it's fragile and hard to maintain as fixtures grow
2. **Inline fixtures in tests only**: Rejected because it would require
   duplicating complex fixture code across tests
3. **Symlinks to fixtures**: Previously used, but didn't solve the type-checking
   problem and added complexity
4. **npm package.json for all languages**: Initially attempted, but shoe-horned
   Python and C# into a TypeScript-centric context. Revised to use idiomatic
   project structures (pyproject.toml, .csproj) while keeping package.json for
   turbo integration only
