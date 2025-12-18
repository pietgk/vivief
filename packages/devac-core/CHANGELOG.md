# @pietgk/devac-core

## 0.1.1

### Patch Changes

- 144f370: Reorganize test fixtures into separate packages per language

  - Create `packages/fixtures-typescript` with proper tsconfig for type-checking
  - Create `packages/fixtures-python` for Python test fixtures
  - Create `packages/fixtures-csharp` for C# test fixtures
  - Rename intentionally broken files to `.txt` extension to prevent IDE errors
  - Update all tests to use new fixture package paths
  - Add ADR documenting the fixture organization decision

  This change improves developer experience by:

  - Type-checking valid TypeScript fixtures
  - Eliminating spurious IDE errors from intentionally broken files
  - Providing clear separation of fixtures by language
