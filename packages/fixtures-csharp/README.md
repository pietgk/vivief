# @pietgk/devac-fixtures-csharp

C# test fixtures for DevAC parser testing.

## Project Structure

This is a proper .NET project that compiles with `dotnet build`.

```
fixtures-csharp/
├── Fixtures.csproj         # .NET project file
├── package.json            # npm integration for turbo
├── sample-class.cs         # Class definitions, methods, properties
├── sample-interface.cs     # Interface definitions
├── sample-records.cs       # C# record types
├── sample-generics.cs      # Generic types and methods
├── sample-async.cs         # Async/await patterns
├── sample-attributes.cs    # C# attributes
├── sample-extension.cs     # Extension methods
├── sample-linq.cs          # LINQ queries
├── sample-namespace-modern.cs  # File-scoped namespaces
├── sample-partial.cs       # Partial classes
├── sample-csharp-12.cs     # C# 12 features
└── sample-project/         # Sample .NET project for project parsing tests
```

## Type Checking / Compilation

Run compilation check with:

```bash
pnpm --filter @pietgk/devac-fixtures-csharp typecheck
```

This uses `dotnet build` to verify all C# fixtures compile correctly.

## Usage in Tests

```typescript
import path from "path";

// Note: files are at package root, not in src/
const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-csharp");
const filePath = path.join(FIXTURES_DIR, "sample-class.cs");
```

## Requirements

- .NET SDK 8.0 or later must be installed
- Run `dotnet restore` if NuGet packages need to be restored
