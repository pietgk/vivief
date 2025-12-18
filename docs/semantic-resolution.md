# Semantic Resolution

This document describes the semantic resolution system (Pass 2) that resolves cross-file symbol references.

## Overview

Semantic resolution is the second pass of the two-pass analysis pipeline. It takes unresolved external references from Pass 1 (structural parsing) and resolves them to actual entity IDs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SEMANTIC RESOLUTION (Pass 2)                                               │
│                                                                             │
│  external_refs.parquet                                                      │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ source: auth.ts:login                              │                    │
│  │ module: "./utils"                                  │                    │
│  │ symbol: "validate"                                 │                    │
│  │ target: ??? (UNRESOLVED)                           │                    │
│  └────────────────────────────────────────────────────┘                    │
│                           │                                                 │
│                           ▼                                                 │
│  ┌────────────────────────────────────────────────────┐                    │
│  │           SEMANTIC RESOLVER                        │                    │
│  │                                                    │                    │
│  │  TypeScript ──► ts-morph                          │                    │
│  │  Python ──────► Pyright (optional)                │                    │
│  │  C# ──────────► .NET SDK (optional)               │                    │
│  └────────────────────────────────────────────────────┘                    │
│                           │                                                 │
│                           ▼                                                 │
│  external_refs.parquet (UPDATED)                                           │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ source: auth.ts:login                              │                    │
│  │ module: "./utils"                                  │                    │
│  │ symbol: "validate"                                 │                    │
│  │ target: pkg:utils.ts:function:a1b2c3 (RESOLVED)   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### SemanticResolver Interface

All language resolvers implement a common interface:

```typescript
interface SemanticResolver {
  /** Language this resolver handles */
  readonly language: "typescript" | "python" | "csharp";
  
  /** Check if resolver is available (e.g., .NET SDK installed) */
  isAvailable(): Promise<boolean>;
  
  /** Build export index for a package */
  buildExportIndex(packagePath: string): Promise<ExportIndex>;
  
  /** Resolve a single import reference */
  resolveRef(ref: UnresolvedRef, index: ExportIndex): Promise<ResolvedRef | null>;
  
  /** Resolve all refs in a package (batched) */
  resolvePackage(packagePath: string, refs: UnresolvedRef[]): Promise<ResolutionResult>;
  
  /** Clear cached data for a package */
  clearCache(packagePath: string): void;
}
```

### Resolver Factory

The factory manages all language resolvers:

```typescript
import { getSemanticResolverFactory, getSemanticResolver } from "@pietgk/devac-core";

// Get factory with custom config
const factory = getSemanticResolverFactory({
  typescript: { enabled: true, timeoutMs: 30000 },
  python: { enabled: true },
  csharp: { enabled: true }
});

// Get specific resolver
const tsResolver = getSemanticResolver("typescript");
const pyResolver = getSemanticResolver("python");
const csResolver = getSemanticResolver("csharp");

// Get resolver for a file
const resolver = factory.getResolverForFile("src/auth.ts");
```

## Language Resolvers

### TypeScript Resolver

Uses **ts-morph** for compiler-grade symbol resolution.

**Features:**
- Package-scoped ts-morph Projects for performance
- 30s timeout per file (configurable)
- Handles all export patterns:
  - Named exports: `export function foo()`
  - Default exports: `export default class`
  - Re-exports: `export { foo } from "./mod"`
  - Barrel exports: `export * from "./mod"`
  - Type-only exports: `export type { User }`
  - Namespace exports: `export * as utils from "./mod"`

**Resolution accuracy:** ~99%

```typescript
import { TypeScriptSemanticResolver } from "@pietgk/devac-core";

const resolver = new TypeScriptSemanticResolver({
  enabled: true,
  timeoutMs: 30000,
  batchSize: 50,
  skipLibCheck: true
});

// Build export index
const index = await resolver.buildExportIndex("/path/to/package");

// Resolve references
const result = await resolver.resolvePackage("/path/to/package", unresolvedRefs);
console.log(`Resolved: ${result.resolved}/${result.total}`);
```

### Python Resolver

Uses regex-based parsing with optional **Pyright** enhancement.

**Features:**
- Regex-based export extraction (always available)
- `__all__` export list support
- Private symbol filtering (`_` prefix)
- Relative import resolution
- `.pyi` stub file support
- Pyright JSON output parsing (when available)

**Resolution accuracy:** ~90% (regex), ~95% (with Pyright)

```typescript
import { PythonSemanticResolver } from "@pietgk/devac-core";

const resolver = new PythonSemanticResolver({
  enabled: true,
  pyrightPath: "npx pyright"  // Optional, falls back to regex
});

// Check if Pyright is available
const hasPyright = await resolver.isAvailable();
console.log(`Pyright available: ${hasPyright}`);

// Build export index
const index = await resolver.buildExportIndex("/path/to/python/package");
```

### C# Resolver

Uses regex-based parsing with optional **.NET SDK** enhancement.

**Features:**
- Regex-based export extraction (always available)
- Public class, interface, struct, record detection
- Enum and delegate support
- File-scoped namespace support (C# 10+)
- Partial class support
- Abstract/sealed modifier detection
- Skips bin/obj directories automatically

**Resolution accuracy:** ~90% (regex), ~95% (with .NET SDK)

```typescript
import { CSharpSemanticResolver } from "@pietgk/devac-core";

const resolver = new CSharpSemanticResolver({
  enabled: true,
  dotnetPath: "dotnet"  // Optional
});

// Check if .NET SDK is available
const hasDotnet = await resolver.isAvailable();
console.log(`.NET SDK available: ${hasDotnet}`);
```

## Configuration

### Default Configuration

```typescript
const defaultSemanticConfig = {
  typescript: {
    enabled: true,
    timeoutMs: 30000,      // 30s per file timeout
    batchSize: 50,         // Files per batch
    skipLibCheck: true     // Skip lib.d.ts for speed
  },
  python: {
    enabled: true,
    pyrightPath: undefined  // Auto-detect via npx
  },
  csharp: {
    enabled: true,
    dotnetPath: undefined   // Auto-detect in PATH
  }
};
```

### Custom Configuration

```typescript
import { SemanticResolverFactory } from "@pietgk/devac-core";

const factory = new SemanticResolverFactory({
  typescript: {
    enabled: true,
    timeoutMs: 60000,  // Increase for large files
    batchSize: 100
  },
  python: {
    enabled: true,
    pyrightPath: "/usr/local/bin/pyright"
  },
  csharp: {
    enabled: false  // Disable C# resolution
  }
});
```

## CLI Usage

### Basic Resolution

```bash
# Analyze with semantic resolution
devac analyze --resolve

# Verbose output
devac analyze --resolve --verbose
```

### Watch Mode

In watch mode, semantic resolution is debounced to avoid excessive re-resolution:

```bash
devac watch --resolve
```

Resolution triggers after 5 seconds of file system stability.

## Resolution Flow

### 1. Build Export Index

For each package, build an index of all exported symbols:

```typescript
interface ExportIndex {
  packagePath: string;
  fileExports: Map<string, ExportInfo[]>;  // file -> exports
  moduleResolution: Map<string, string>;    // specifier -> file
  builtAt: Date;
}

interface ExportInfo {
  name: string;           // Symbol name
  kind: NodeKind;         // function, class, etc.
  filePath: string;       // Definition file
  entityId: string;       // Unique entity ID
  isDefault: boolean;     // Default export?
  isTypeOnly: boolean;    // Type-only export?
  originalFilePath?: string;  // For re-exports
}
```

### 2. Resolve References

For each unresolved reference, find the matching export:

```typescript
interface UnresolvedRef {
  sourceEntityId: string;    // Importing entity
  sourceFilePath: string;    // Import location
  moduleSpecifier: string;   // "./utils", "@org/pkg"
  importedSymbol: string;    // Symbol name
  isTypeOnly: boolean;       // Type import?
}

interface ResolvedRef {
  ref: UnresolvedRef;
  targetEntityId: string;    // Resolved target
  targetFilePath: string;    // Target file
  confidence: number;        // 0-1 confidence score
  method: "index" | "heuristic";
}
```

### 3. Update Storage

Update external_refs with resolution results:

```typescript
interface ResolutionResult {
  total: number;
  resolved: number;
  unresolved: number;
  resolvedRefs: ResolvedRef[];
  errors: ResolutionError[];
  timeMs: number;
  packagePath: string;
}
```

## Error Handling

### Graceful Degradation

If a tool is not available, the resolver falls back to regex-based parsing:

```typescript
// Python: Pyright not installed
const pyResolver = new PythonSemanticResolver();
const available = await pyResolver.isAvailable();
// Returns false, but buildExportIndex() still works with regex

// C#: .NET SDK not installed
const csResolver = new CSharpSemanticResolver();
const available = await csResolver.isAvailable();
// Returns false, but buildExportIndex() still works with regex
```

### Timeout Protection

TypeScript resolution has timeout protection to avoid hangs on complex files:

```typescript
// If a file takes >30s, it's skipped with a warning
const result = await resolver.resolvePackage(packagePath, refs);

// Errors include timeout information
for (const error of result.errors) {
  if (error.code === "TIMEOUT") {
    console.warn(`Timeout resolving ${error.ref.sourceFilePath}`);
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `TIMEOUT` | Resolution exceeded timeout |
| `MODULE_NOT_FOUND` | Import module not found |
| `SYMBOL_NOT_FOUND` | Symbol not exported from module |
| `PARSE_ERROR` | Failed to parse source file |
| `INTERNAL_ERROR` | Unexpected error |

## Performance

### Caching

Export indices are cached per package:

```typescript
// First call builds index
const index1 = await resolver.buildExportIndex("/pkg");

// Second call returns cached index
const index2 = await resolver.buildExportIndex("/pkg");
// index1 === index2 (same object)

// Clear cache after file changes
resolver.clearCache("/pkg");
```

### Batch Processing

References are resolved in batches for efficiency:

```typescript
// Resolve all refs at once
const result = await resolver.resolvePackage(packagePath, allRefs);

// More efficient than individual calls
for (const ref of allRefs) {
  await resolver.resolveRef(ref, index);  // Slower
}
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Pass 1 (structural) | <10s for 500 files |
| Pass 2 (semantic) | <30s for 500 files |
| Memory usage | <1GB |
| TypeScript accuracy | ≥99% |
| Python accuracy | ≥95% |
| C# accuracy | ≥95% |

## Querying Resolution Results

### Check Resolution Status

```sql
-- Resolution statistics
SELECT 
  COUNT(*) FILTER (WHERE target_entity_id IS NOT NULL) AS resolved,
  COUNT(*) FILTER (WHERE target_entity_id IS NULL) AS unresolved,
  COUNT(*) AS total
FROM external_refs
WHERE branch = 'main';

-- Unresolved imports
SELECT 
  source_file_path,
  module_specifier,
  imported_symbol
FROM external_refs
WHERE target_entity_id IS NULL
  AND branch = 'main'
ORDER BY source_file_path;
```

### Import Analysis

```sql
-- Most imported modules
SELECT 
  module_specifier,
  COUNT(*) AS import_count
FROM external_refs
WHERE branch = 'main'
GROUP BY module_specifier
ORDER BY import_count DESC
LIMIT 10;

-- Cross-package dependencies
SELECT DISTINCT
  source.file_path AS from_file,
  target.file_path AS to_file
FROM external_refs er
JOIN nodes source ON er.source_entity_id = source.entity_id
JOIN nodes target ON er.target_entity_id = target.entity_id
WHERE er.branch = 'main'
  AND source.file_path NOT LIKE target.file_path;
```

## Troubleshooting

### Common Issues

**1. TypeScript resolution hangs**
- Cause: Complex type inference
- Solution: Increase `timeoutMs` or add `skipLibCheck: true`

**2. Python imports not resolved**
- Cause: Pyright not installed
- Solution: Install Pyright (`npm install -g pyright`) or rely on regex fallback

**3. C# namespaces not found**
- Cause: File-scoped namespaces not detected
- Solution: Ensure C# 10+ syntax is used correctly

**4. Low resolution rate**
- Cause: External dependencies (npm packages, pip packages)
- Note: External packages are intentionally not resolved (they're external)

### Debug Logging

```bash
# Enable verbose output
devac analyze --resolve --verbose

# Output includes:
# - Export index build time
# - Resolution statistics per file
# - Error details for failed resolutions
```

## Related Documentation

- [Parsing Pipeline](./parsing-pipeline.md) - Two-pass architecture overview
- [AST Architecture](./ast-architecture.md) - Universal node/edge model
- [Data Model](./data-model.md) - Schema for nodes, edges, external_refs
