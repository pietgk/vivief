# API Reference

Programmatic API for using DevAC v2 in your code.

## Quick Start

```typescript
import {
  DuckDBPool,
  createSeedWriter,
  createSeedReader,
  createAnalysisOrchestrator,
} from "@pietgk/devac-core";

// Initialize
const pool = new DuckDBPool();
await pool.initialize();

// Analyze
const orchestrator = createAnalysisOrchestrator(pool);
await orchestrator.analyzePackage("./packages/auth");

// Query
const reader = createSeedReader(pool, "./packages/auth");
const functions = await reader.readNodes({ kind: "function" });

// Cleanup
await pool.shutdown();
```

## Core Exports

### Types

```typescript
// Node types
import type {
  ParsedNode,
  NodeKind,
  ExportKind,
} from "@pietgk/devac-core";

// Edge types
import type {
  ParsedEdge,
  EdgeType,
} from "@pietgk/devac-core";

// External reference types
import type {
  ParsedExternalRef,
  ImportKind,
} from "@pietgk/devac-core";

// Configuration
import type {
  DevacConfig,
  PoolConfig,
  WatchOptions,
} from "@pietgk/devac-core";
```

## DuckDBPool

Connection pool for DuckDB operations.

```typescript
import { DuckDBPool } from "@pietgk/devac-core";

const pool = new DuckDBPool({
  maxConnections: 4,      // Maximum concurrent connections
  minConnections: 1,      // Keep warm
  idleTimeoutMs: 60000,   // Close idle after 1 minute
  acquireTimeoutMs: 30000 // Acquisition timeout
});

await pool.initialize();

// Execute query
const result = await pool.execute(async (conn) => {
  return await conn.all("SELECT * FROM nodes LIMIT 10");
});

// Get pool stats
const stats = pool.stats();
// { totalConnections: 4, activeConnections: 1, idleConnections: 3, waitingRequests: 0 }

// Shutdown
await pool.shutdown();
```

### Default Pool

```typescript
import { getDefaultPool, shutdownDefaultPool } from "@pietgk/devac-core";

// Get/create default pool
const pool = getDefaultPool();

// Shutdown default pool
await shutdownDefaultPool();
```

## SeedWriter

Atomic writes to Parquet files.

```typescript
import { createSeedWriter, SeedWriter } from "@pietgk/devac-core";

const writer: SeedWriter = createSeedWriter(pool, "/path/to/package");

// Write parse results
await writer.writeFile({
  filePath: "src/auth.ts",
  sourceFileHash: "abc123...",
  nodes: [
    {
      entityId: "repo:pkg:function:hash",
      branch: "main",
      filePath: "src/auth.ts",
      fileContentHash: "abc123",
      kind: "function",
      name: "handleLogin",
      scopedName: "handleLogin",
      startLine: 10,
      startColumn: 0,
      endLine: 25,
      endColumn: 1,
      language: "typescript",
      isExported: true,
    }
  ],
  edges: [...],
  externalRefs: [...],
  metadata: {
    parseTimeMs: 45,
    language: "typescript",
    nodeCount: 23,
    edgeCount: 15,
    refCount: 8,
  }
});

// Update file (delete old + write new)
await writer.updateFile(parseResult);

// Delete file's data
await writer.deleteFile("src/auth.ts");
```

### Write Options

```typescript
interface WriteOptions {
  branch?: string;        // Target branch (default: detected from git)
  forceBase?: boolean;    // Write to base/ even on feature branch
}

await writer.writeFile(result, { branch: "feature-auth" });
```

## SeedReader

Query access to seed files.

```typescript
import { createSeedReader, SeedReader } from "@pietgk/devac-core";

const reader: SeedReader = createSeedReader(pool, "/path/to/package");

// Read all nodes
const nodes = await reader.readNodes();

// Read with filter
const functions = await reader.readNodes({
  kind: "function",
  isExported: true,
  branch: "main"
});

// Read edges
const edges = await reader.readEdges({
  edgeType: "CALLS"
});

// Read external refs
const refs = await reader.readExternalRefs({
  isResolved: false
});

// Custom SQL query
const result = await reader.query(`
  SELECT name, file_path, (end_line - start_line) as lines
  FROM nodes 
  WHERE kind = 'function'
  ORDER BY lines DESC
  LIMIT 10
`);

// Verify integrity
const integrity = await reader.verifyIntegrity();
if (!integrity.valid) {
  console.error("Issues:", integrity.errors);
}
```

### Query Multiple Packages

```typescript
import { queryMultiplePackages } from "@pietgk/devac-core";

const result = await queryMultiplePackages(pool, [
  "/path/to/packages/auth",
  "/path/to/packages/core",
], `SELECT * FROM nodes WHERE is_exported = true`);
```

## AnalysisOrchestrator

Coordinates the analysis pipeline.

```typescript
import { createAnalysisOrchestrator, AnalysisOrchestrator } from "@pietgk/devac-core";

const orchestrator: AnalysisOrchestrator = createAnalysisOrchestrator(pool, {
  debounceMs: 100,        // Batch collection window
  semanticSettleMs: 5000, // Wait before semantic resolution
  maxConcurrency: 4,      // Parallel parse limit
});

// Analyze entire package
const result = await orchestrator.analyzePackage("/path/to/package");
console.log(`Analyzed ${result.filesAnalyzed} files`);
console.log(`Created ${result.totalNodes} nodes`);

// Analyze single file
const fileResult = await orchestrator.analyzeFile({
  type: "change",
  filePath: "src/auth.ts",
  packagePath: "/path/to/package",
  timestamp: Date.now()
});

// Analyze batch
const batchResult = await orchestrator.analyzeBatch([
  { type: "change", filePath: "src/auth.ts", ... },
  { type: "add", filePath: "src/utils.ts", ... },
]);

// Trigger semantic resolution
const resolution = await orchestrator.resolveSemantics("/path/to/package");
console.log(`Resolved ${resolution.resolved}/${resolution.total} refs`);

// Get status
const status = orchestrator.getStatus();
// { mode: "idle" | "analyzing" | "resolving", currentFile: "...", progress: { ... } }
```

### Result Types

```typescript
interface PackageResult {
  packagePath: string;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  totalNodes: number;
  totalEdges: number;
  totalRefs: number;
  totalTimeMs: number;
  errors: Array<{ filePath: string; error: string }>;
}

interface AnalysisResult {
  filePath: string;
  success: boolean;
  nodeCount: number;
  edgeCount: number;
  refCount: number;
  parseTimeMs: number;
  writeTimeMs: number;
  error?: string;
}
```

## LanguageRouter

Routes files to appropriate parsers.

```typescript
import { createLanguageRouter, LanguageRouter } from "@pietgk/devac-core";
import { TypeScriptParser, PythonParser, CSharpParser } from "@pietgk/devac-core";

const router: LanguageRouter = createLanguageRouter([
  new TypeScriptParser(),
  new PythonParser(),
  new CSharpParser(),
]);

// Get parser for file
const parser = router.getParser("src/auth.ts");
if (parser) {
  const result = await parser.parse("src/auth.ts");
}

// Get supported extensions
const extensions = router.getSupportedExtensions();
// [".ts", ".tsx", ".js", ".jsx", ".py", ".cs"]

// Register additional parser
router.registerParser(new CustomParser());
```

### Default Router

```typescript
import { getDefaultRouter, resetDefaultRouter } from "@pietgk/devac-core";

const router = getDefaultRouter(); // Pre-configured with TS, Python, C#
resetDefaultRouter(); // Reset to fresh instance
```

## Entity ID Generation

```typescript
import {
  generateEntityId,
  parseEntityId,
  isValidEntityId,
  entityIdsMatch,
} from "@pietgk/devac-core";

// Generate entity ID
const entityId = generateEntityId({
  repo: "repo-api",
  packagePath: "packages/auth",
  kind: "function",
  filePath: "src/auth.ts",
  scopedName: "handleLogin"
});
// "repo-api:packages/auth:function:a1b2c3d4"

// Parse entity ID
const parsed = parseEntityId(entityId);
// { repo: "repo-api", packagePath: "packages/auth", kind: "function", scopeHash: "a1b2c3d4" }

// Validate
const valid = isValidEntityId(entityId);

// Compare
const match = entityIdsMatch(id1, id2);
```

## File Operations

### Atomic Write

```typescript
import { writeFileAtomic, writeJsonAtomic } from "@pietgk/devac-core";

// Atomic file write
await writeFileAtomic("/path/to/file.txt", "content");

// Atomic JSON write
await writeJsonAtomic("/path/to/data.json", { key: "value" });
```

### Hash Computation

```typescript
import {
  computeFileHash,
  computeFileHashes,
  hasFileChanged,
  findChangedFiles,
} from "@pietgk/devac-core";

// Single file hash
const hash = await computeFileHash("/path/to/file.ts");

// Multiple file hashes
const hashes = await computeFileHashes(["/path/a.ts", "/path/b.ts"]);

// Check if changed
const changed = await hasFileChanged("/path/to/file.ts", previousHash);

// Find all changed files
const changedFiles = await findChangedFiles("/path/to/package", storedHashes);
```

### Cleanup

```typescript
import {
  cleanupPackageSeeds,
  findOrphanedSeeds,
  removeAllSeeds,
  cleanupOrphanedFiles,
} from "@pietgk/devac-core";

// Clean package seeds
await cleanupPackageSeeds("/path/to/package");

// Find orphaned seed files
const orphans = await findOrphanedSeeds("/path/to/package");

// Remove all seeds
await removeAllSeeds("/path/to/package");

// Clean orphaned temp files
const result = await cleanupOrphanedFiles("/path/to/seed");
// { tempFilesRemoved: 3, staleLockFilesRemoved: 1, errors: [] }
```

## File Locking

```typescript
import { withSeedLock, acquireLock, releaseLock, isLockStale } from "@pietgk/devac-core";

// Recommended: use withSeedLock for automatic lock management
await withSeedLock("/path/to/seed", async () => {
  // Safe to write here
  await writer.writeFile(result);
});

// Manual lock management (advanced)
await acquireLock("/path/to/.devac.lock", { timeout: 30000 });
try {
  // Critical section
} finally {
  await releaseLock("/path/to/.devac.lock");
}

// Check if lock is stale
const stale = await isLockStale("/path/to/.devac.lock");
```

## CLI Commands (Programmatic)

```typescript
import {
  analyzeCommand,
  queryCommand,
  verifyCommand,
  cleanCommand,
} from "@pietgk/devac-core";

// Run analyze programmatically
const analyzeResult = await analyzeCommand({
  package: "./packages/auth",
  ifChanged: true,
  force: false,
});

// Run query
const queryResult = await queryCommand({
  sql: "SELECT * FROM nodes LIMIT 10",
  format: "json",
});

// Verify seeds
const verifyResult = await verifyCommand({
  package: "./packages/auth",
});

// Clean seeds
const cleanResult = await cleanCommand({
  package: "./packages/auth",
  dryRun: false,
});
```

## CentralHub

Cross-repo federation and M2M connection discovery.

```typescript
import { CentralHub, createCentralHub } from "@pietgk/devac-core";

const hub = await createCentralHub("/path/to/workspace");

// Initialize hub
await hub.initialize();

// Register a repository
await hub.registerRepo({
  repoId: "my-repo",
  repoPath: "/path/to/repo",
  seedPath: "/path/to/repo/.devac/seed"
});

// Find M2M connections across all repos
const m2mResult = await hub.findM2MConnections();
console.log(`Found ${m2mResult.totalCount} M2M connections`);

for (const conn of m2mResult.connections) {
  console.log(`${conn.sourceRepo} → ${conn.targetService}: ${conn.method} ${conn.route}`);
}

// Filter by source repo
const filtered = await hub.findM2MConnections({
  sourceRepo: "api-service"
});

// Filter by target service
const authCalls = await hub.findM2MConnections({
  targetService: "auth"
});

// Clean up
await hub.dispose();
```

### M2M Connection Types

```typescript
interface M2MConnection {
  /** Source repo making the call */
  sourceRepo: string;
  /** Source entity ID (function making the call) */
  sourceEntityId: string;
  /** Target service name extracted from URL pattern */
  targetService: string;
  /** HTTP method */
  method: string | null;
  /** Route pattern being called */
  route: string;
  /** File where the call is made */
  sourceFile: string;
  /** Line number of the call */
  sourceLine: number;
}

interface M2MQueryResult {
  connections: M2MConnection[];
  totalCount: number;
  matchedCount: number;
}
```

### Hub Query Methods

```typescript
// Query all repos with SQL
const result = await hub.queryAll(`
  SELECT * FROM nodes WHERE kind = 'function'
`);

// List registered repos
const repos = await hub.listRepos();

// Get repo status
const status = await hub.getRepoStatus("my-repo");
```

## Constants

```typescript
import {
  VERSION,
  NODES_SCHEMA,
  EDGES_SCHEMA,
  EXTERNAL_REFS_SCHEMA,
  PARQUET_OPTIONS,
  DEFAULT_EXTENSION_MAP,
} from "@pietgk/devac-core";

console.log(VERSION); // "2.0.0"
```

---

*See [Specification](./spec/) for full design documentation*
