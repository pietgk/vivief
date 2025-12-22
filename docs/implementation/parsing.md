# Parsing Pipeline

This document covers the two-pass analysis pipeline: how source code becomes queryable graph data.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TWO-PASS ANALYSIS PIPELINE                                                 │
│                                                                             │
│  SOURCE FILES                                                               │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PASS 1: STRUCTURAL (Per-File, Parallel)                            │   │
│  │                                                                      │   │
│  │  • Fast: <50ms per file (TypeScript)                                │   │
│  │  • Independent: No cross-file knowledge needed                      │   │
│  │  • Parallel: Multiple files simultaneously                          │   │
│  │  • Output: nodes, edges, external_refs (unresolved)                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PASS 2: SEMANTIC (Cross-File, Batched)                             │   │
│  │                                                                      │   │
│  │  • Deferred: Run after structural pass                              │   │
│  │  • Batched: Process multiple files together                         │   │
│  │  • Cross-file: Resolves imports to actual target nodes              │   │
│  │  • Output: Updated external_refs with resolution info               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  PARQUET FILES                                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Analysis Orchestrator

The orchestrator coordinates the entire analysis flow:

```typescript
import { createAnalysisOrchestrator } from "./analyzer/analysis-orchestrator";
import { createLanguageRouter } from "./analyzer/language-router";
import { createSeedWriter } from "./storage/seed-writer";
import { DuckDBPool } from "./storage/duckdb-pool";

// Create dependencies
const pool = new DuckDBPool();
await pool.initialize();
const router = createLanguageRouter();
const writer = createSeedWriter(pool, "/path/to/package");

// Create orchestrator
const orchestrator = createAnalysisOrchestrator(router, writer, pool, {
  batchSize: 50,      // Files per batch (default: 50)
  concurrency: 10,    // Parallel file operations (default: 10)
  repoName: "my-repo", // Repository name for entity IDs
  branch: "main",     // Branch name (default: "main")
  verbose: false      // Enable verbose logging
});

// Analyze a package
const result = await orchestrator.analyzePackage("/path/to/package");

// Analyze a single file
const fileResult = await orchestrator.analyzeFile({
  type: "change",
  filePath: "src/auth.ts",
  packagePath: "/path/to/package",
  timestamp: Date.now()
});
```

### Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLI MODE                                                                   │
│                                                                             │
│  devac analyze                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   File       │ ──►│   Language   │ ──►│   Parser     │                  │
│  │   Scanner    │    │   Router     │    │   (batched)  │                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  ▼                          │
│                                           ┌──────────────┐                  │
│                                           │   Seed       │                  │
│                                           │   Writer     │                  │
│                                           └──────────────┘                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  WATCH MODE                                                                 │
│                                                                             │
│  ┌──────────────┐                                                          │
│  │   File       │ (chokidar events)                                         │
│  │   Watcher    │─────┐                                                     │
│  └──────────────┘     │                                                     │
│                       ▼                                                     │
│              ┌──────────────────┐                                           │
│              │   Debounce       │ (100ms settle)                            │
│              │   Buffer         │                                           │
│              └────────┬─────────┘                                           │
│                       ▼                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Batch      │ ──►│   Language   │ ──►│   Parser     │                  │
│  │   Collector  │    │   Router     │    │   (parallel) │                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  ▼                          │
│                                           ┌──────────────┐                  │
│                                           │   Seed       │                  │
│                                           │   Writer     │                  │
│                                           └──────┬───────┘                  │
│                                                  │                          │
│                                    (5s settle)   ▼                          │
│                                           ┌──────────────┐                  │
│                                           │   Semantic   │ (background)     │
│                                           │   Resolver   │                  │
│                                           └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Language Router

Routes files to appropriate parsers based on extension:

```typescript
import { createLanguageRouter } from "./analyzer/language-router";

const router = createLanguageRouter([
  new TypeScriptParser(),
  new PythonParser(),
  new CSharpParser()
]);

// Get parser for file
const parser = router.getParser("src/auth.ts");
// Returns TypeScriptParser

// Get supported extensions
const extensions = router.getSupportedExtensions();
// [".ts", ".tsx", ".js", ".jsx", ".py", ".cs"]
```

### Extension Mapping

| Extension | Parser | Notes |
|-----------|--------|-------|
| `.ts`, `.tsx` | TypeScriptParser | Babel for structural |
| `.js`, `.jsx`, `.mjs`, `.cjs` | TypeScriptParser | Same parser |
| `.py` | PythonParser | Python subprocess |
| `.cs` | CSharpParser | tree-sitter |

## Language Parsers

Each parser implements the same interface:

```typescript
interface LanguageParser {
  readonly language: string;
  readonly extensions: string[];
  
  parse(filePath: string): Promise<StructuralParseResult>;
  
  resolveImport?(
    importSpec: string,
    fromFile: string
  ): Promise<string | null>;
}

interface StructuralParseResult {
  filePath: string;
  sourceFileHash: string;
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  externalRefs: ParsedExternalRef[];
  metadata: {
    parseTimeMs: number;
    language: string;
    nodeCount: number;
    edgeCount: number;
    refCount: number;
  };
}
```

### TypeScript Parser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TYPESCRIPT PARSER                                                          │
│                                                                             │
│  Strategy: Babel for fast structural parsing                               │
│                                                                             │
│  source.ts ──► Babel AST ──► Extract Nodes/Edges ──► ParseResult           │
│                                                                             │
│  Extracts:                                                                  │
│  • Functions (named, arrow, async)                                         │
│  • Classes (methods, properties, constructors)                             │
│  • Interfaces, type aliases, enums                                         │
│  • Imports/exports                                                         │
│  • React components (JSX)                                                  │
│  • Call relationships                                                       │
│                                                                             │
│  Performance: <50ms for typical files                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Python Parser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PYTHON PARSER                                                              │
│                                                                             │
│  Strategy: Python subprocess with native ast module                        │
│                                                                             │
│  source.py ──► Python subprocess ──► JSON output ──► ParseResult           │
│                                                                             │
│  Extracts:                                                                  │
│  • Functions (def, async def, lambdas)                                     │
│  • Classes (methods, properties)                                           │
│  • Imports (import, from...import)                                         │
│  • Decorators                                                              │
│  • Call relationships                                                       │
│                                                                             │
│  Performance: 200-500ms (subprocess overhead)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### C# Parser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  C# PARSER                                                                  │
│                                                                             │
│  Strategy: tree-sitter-c-sharp                                             │
│                                                                             │
│  source.cs ──► tree-sitter AST ──► Extract Nodes/Edges ──► ParseResult     │
│                                                                             │
│  Extracts:                                                                  │
│  • Classes, structs, records                                               │
│  • Methods, properties, fields                                             │
│  • Interfaces                                                              │
│  • Using statements                                                        │
│  • Namespaces                                                              │
│                                                                             │
│  Performance: <50ms for typical files                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Entity ID Generation

Unique identifiers for code elements:

```typescript
import { generateEntityId } from "./analyzer/entity-id-generator";

const entityId = generateEntityId({
  repo: "repo-api",
  packagePath: "packages/auth",
  kind: "function",
  filePath: "src/auth.ts",
  scopedName: "handleLogin"
});
// "repo-api:packages/auth:function:a1b2c3d4"
```

### Qualified Name Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  QUALIFIED NAME RULES                                                       │
│                                                                             │
│  Code Pattern                      Qualified Name                           │
│  ─────────────────────────────────────────────────                          │
│  function handleLogin() {}         handleLogin                              │
│                                                                             │
│  class AuthService {                                                        │
│    login() {}                      AuthService.login                        │
│  }                                                                          │
│                                                                             │
│  function outer() {                                                         │
│    function inner() {}             outer.inner                              │
│  }                                                                          │
│                                                                             │
│  const fetch = () => {}            fetch                                    │
│                                                                             │
│  users.map(u => u.name)            users.map.$arg0                         │
│                                                                             │
│  const callbacks = [                                                        │
│    () => {},                        callbacks.$0                            │
│    () => {}                         callbacks.$1                            │
│  ]                                                                          │
│                                                                             │
│  class Foo {                                                                │
│    [key]() {}                      Foo.[key]                               │
│  }                                                                          │
│                                                                             │
│  Why scoped names (not line numbers)?                                       │
│  • Code above function changes → entity_id STABLE                          │
│  • Merge/rebase shifts lines → entity_id STABLE                           │
│  • Same code on different branches → SAME entity_id                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Semantic Resolution

Resolves external references after structural pass:

```typescript
import { createSemanticResolver } from "./resolver/semantic-resolver";

const resolver = createSemanticResolver(pool);
const result = await resolver.resolvePackage("/path/to/package");
// { total: 423, resolved: 398, unresolved: 25, errors: [] }
```

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SEMANTIC RESOLUTION PIPELINE                                               │
│                                                                             │
│  1. Read external_refs.parquet (unresolved imports)                        │
│     │                                                                       │
│     ▼                                                                       │
│  2. For each unresolved ref:                                                │
│     ├── Query local package nodes (same package exports)                   │
│     ├── Query sibling packages (monorepo cross-package)                    │
│     └── Query central hub (cross-repo dependencies)                        │
│     │                                                                       │
│     ▼                                                                       │
│  3. Update external_refs with resolution results                           │
│     ├── is_resolved = true/false                                           │
│     └── resolved_entity_id = matched entity (if found)                     │
│     │                                                                       │
│     ▼                                                                       │
│  4. Write updated external_refs.parquet                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resolution Priority

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RESOLUTION ORDER                                                           │
│                                                                             │
│  1. LOCAL PACKAGE                                                           │
│     import { auth } from './auth'                                          │
│     → Query: same package nodes.parquet                                    │
│                                                                             │
│  2. SIBLING PACKAGES (Monorepo)                                            │
│     import { User } from '@myorg/types'                                    │
│     → Query: packages/types/.devac/seed/nodes.parquet                      │
│                                                                             │
│  3. CENTRAL HUB (Cross-Repo)                                               │
│     import { Schema } from '@shared/schema'                                │
│     → Query: central hub for registered repos                              │
│                                                                             │
│  4. UNRESOLVED                                                              │
│     import React from 'react'                                              │
│     → External dependency, marked unresolved                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Incremental Updates

Content-hash based change detection:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INCREMENTAL UPDATE FLOW                                                    │
│                                                                             │
│  Step 1: Compute current file hashes (~20ms)                               │
│  ───────────────────────────────────────────                                │
│  For each source file: currentHash = sha256(content)                       │
│                                                                             │
│  Step 2: Compare with stored hashes (from Parquet)                         │
│  ─────────────────────────────────────────────────                          │
│  Query: SELECT DISTINCT file_path, file_content_hash FROM nodes.parquet    │
│  changedFiles = files where currentHash != storedHash                      │
│  newFiles = files not in storedHashes                                      │
│  deletedFiles = storedHashes not in current files                          │
│                                                                             │
│  Step 3: Selective parsing                                                  │
│  ────────────────────────                                                   │
│  IF no changes:                                                             │
│    SKIP - no regeneration needed (~20-50ms total)                          │
│  ELSE:                                                                      │
│    Parse ONLY changed/new files                                            │
│    Merge into package Parquet                                              │
│                                                                             │
│  TIMING                                                                     │
│  ──────                                                                     │
│  No changes:         ~20-50ms (hash check only)                            │
│  1 file changed:     ~150-300ms (parse 1, merge, write)                    │
│  10 files changed:   ~300-500ms (parse 10, merge, write)                   │
│  Full regeneration:  ~5-10s (parse all, write)                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Error Handling

### Error Categories

| Error Type | Behavior | Recovery |
|------------|----------|----------|
| Parse error | Continue with partial results | Re-parse on next change |
| Write failure | Atomic write prevents corruption | Retry or regenerate |
| Read failure | Return error to caller | Delete corrupt, regenerate |
| Timeout | Skip file, log warning | Retry next time |

### Parse Error Handling

```typescript
interface ParseResult {
  success: boolean;
  nodes: Node[];
  edges: Edge[];
  refs: ExternalRef[];
  errors: ParseError[];  // Collected, not thrown
}

// Partial results are valid
// A file with syntax errors may still have parseable content
```

## Performance Targets

| Operation | Target (p50) | Target (p95) |
|-----------|--------------|--------------|
| Hash check (no changes) | <50ms | <100ms |
| Structural parse (TS) | <50ms | <200ms |
| Structural parse (Python) | <200ms | <500ms |
| Package Parquet write | <100ms | <200ms |
| Single file change (warm) | <300ms | <500ms |
| Batch changes (10 files) | <500ms | <800ms |

---

*Next: [Federation](./federation.md) for multi-repo setup*
