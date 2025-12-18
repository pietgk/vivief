# @pietgk/devac-core

Core library for DevAC - a federated code analysis system that extracts, stores, and queries code structure using DuckDB and Parquet.

## Installation

```bash
pnpm add @pietgk/devac-core
```

## Features

- **Multi-language parsing**: TypeScript, Python, C# support
- **DuckDB + Parquet storage**: Efficient columnar storage for code graphs
- **Federated queries**: Query across multiple packages and repositories
- **Incremental updates**: Only re-analyze changed files
- **Symbol resolution**: Track dependencies between symbols

## Quick Start

```typescript
import {
  DuckDBPool,
  TypeScriptParser,
  SeedWriter,
  SeedReader,
} from "@pietgk/devac-core";

// Initialize DuckDB pool
const pool = new DuckDBPool({ memoryLimit: "256MB" });
await pool.initialize();

// Parse a TypeScript file
const parser = new TypeScriptParser();
const result = await parser.parse("src/index.ts", {
  repoName: "my-repo",
  packagePath: "/path/to/package",
  branch: "main",
});

// Write to Parquet seeds
const writer = new SeedWriter(pool, "/path/to/package");
await writer.writeFile(result);

// Query the code graph
const reader = new SeedReader(pool, "/path/to/package");
const nodes = await reader.readNodes();
console.log(`Found ${nodes.rowCount} symbols`);

// Cleanup
await pool.shutdown();
```

## Core Components

### Parsers

- `TypeScriptParser` - Parse TypeScript/JavaScript files
- `PythonParser` - Parse Python files
- `CSharpParser` - Parse C# files

### Storage

- `DuckDBPool` - Connection pool for DuckDB with error recovery
- `SeedWriter` - Write parsed data to Parquet files
- `SeedReader` - Query Parquet seed files

### Analysis

- `SymbolAffectedAnalyzer` - Analyze impact of file changes
- `SemanticResolver` - Resolve cross-file symbol references
- `RenameDetector` - Detect renamed symbols across commits

### Central Hub

- `CentralHub` - Coordinate multi-package analysis
- `HubStorage` - Store and query hub metadata

## Data Model

DevAC uses three core data structures:

### Nodes

Represent code symbols (functions, classes, variables, etc.):

```typescript
interface ParsedNode {
  entity_id: string;      // Unique identifier
  name: string;           // Symbol name
  kind: string;           // function, class, method, etc.
  source_file: string;    // File path
  start_line: number;
  end_line: number;
  is_exported: boolean;
  // ... more fields
}
```

### Edges

Represent relationships between nodes:

```typescript
interface ParsedEdge {
  source_entity_id: string;
  target_entity_id: string;
  edge_type: string;  // CALLS, CONTAINS, EXTENDS, IMPLEMENTS, etc.
}
```

### External References

Track unresolved imports:

```typescript
interface ParsedExternalRef {
  source_entity_id: string;
  module_specifier: string;
  imported_symbol: string;
  is_resolved: boolean;
  target_entity_id?: string;
}
```

## API Reference

See the full [API Reference](../../docs/api-reference.md) for detailed documentation.

## Related Packages

- [@pietgk/devac-cli](../devac-cli) - Command-line interface
- [@pietgk/devac-mcp](../devac-mcp) - MCP server for AI assistants

## License

MIT
