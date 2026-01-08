# DevAC Core Architecture

> **Package:** @pietgk/devac-core
> **Validated:** 2026-01-08
> **Status:** Verified

## Overview

DevAC Core is a federated code analysis engine that uses DuckDB + Parquet for fast, local code graph storage. It supports TypeScript, Python, and C# with incremental updates and cross-repository federation.

## C4 Context Diagram

```
                              CONTEXT
 +---------------------------------------------------------------------------+
 |                                                                           |
 |    +-------------+              +-------------------+                     |
 |    |  Developer  |------------->|    DevAC Core     |                     |
 |    |   [Person]  |   queries    |     [System]      |                     |
 |    +-------------+              +-------------------+                     |
 |                                         |                                 |
 |                            +------------+------------+                    |
 |                            |            |            |                    |
 |                            v            v            v                    |
 |                     +-----------+ +-----------+ +-----------+             |
 |                     |  Source   | |   File    | |  Central  |             |
 |                     |   Code    | |  System   | |    Hub    |             |
 |                     | [ExtSys]  | | [ExtSys]  | | [ExtSys]  |             |
 |                     +-----------+ +-----------+ +-----------+             |
 |                                                                           |
 +---------------------------------------------------------------------------+
```

### Context Relationships

| From | To | Label |
|------|-----|-------|
| Developer | DevAC Core | Uses for code analysis |
| DevAC Core | Source Code | Parses TS/Py/C# files |
| DevAC Core | File System | Reads/Writes Parquet seeds |
| DevAC Core | Central Hub | Federates cross-repo queries |

```likec4
// Context relationships
developer -> devac_core "Uses for code analysis"
devac_core -> source_code "Parses TS/Py/C# files"
devac_core -> filesystem "Reads/Writes Parquet seeds"
devac_core -> central_hub_db "Federates cross-repo queries"
```

## C4 Container Diagram

```
 +---------------------------------------------------------------------------+
 |                           DevAC Core System                               |
 +---------------------------------------------------------------------------+
 |                                                                           |
 |  +---------------------------------------------------------------------+  |
 |  |                       ANALYSIS LAYER                                |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |  |   Analyzer    |->|    Parsers    |  |     Semantic      |        |  |
 |  |  | [Container]   |  |  [Container]  |  |   [Container]     |        |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |         |                  |                    |                   |  |
 |  |         v                  v                    v                   |  |
 |  |    orchestrates       tree-sitter          resolves                 |  |
 |  +---------------------------------------------------------------------+  |
 |                                    |                                      |
 |                                    v                                      |
 |  +---------------------------------------------------------------------+  |
 |  |                       STORAGE LAYER                                 |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |  |  DuckDBPool   |<-|     Seeds     |  |     Effects       |        |  |
 |  |  | [Container]   |  |  [Container]  |  |   [Container]     |        |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |         |                  |                    |                   |  |
 |  |         v                  v                    v                   |  |
 |  |      queries           Parquet             Parquet                  |  |
 |  +---------------------------------------------------------------------+  |
 |                                    |                                      |
 |                                    v                                      |
 |  +---------------------------------------------------------------------+  |
 |  |                      FEDERATION LAYER                               |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |  |  CentralHub   |  |   HubClient   |  |  CrossRepoDetector|        |  |
 |  |  | [Container]   |  |  [Container]  |  |   [Container]     |        |  |
 |  |  +---------------+  +---------------+  +-------------------+        |  |
 |  |         |                  |                    |                   |  |
 |  |         v                  v                    v                   |  |
 |  |    single-writer       IPC/direct         discovery                 |  |
 |  +---------------------------------------------------------------------+  |
 |                                    |                                      |
 |                                    v                                      |
 |  +---------------------------------------------------------------------+  |
 |  |                      VALIDATION LAYER                               |  |
 |  |  +-------------------+  +---------------+  +-----------------+      |  |
 |  |  |ValidationCoord    |->|  Validators   |  | IssueEnricher   |      |  |
 |  |  |   [Container]     |  |  [Container]  |  |  [Container]    |      |  |
 |  |  +-------------------+  +---------------+  +-----------------+      |  |
 |  |         |                      |                  |                 |  |
 |  |         v                      v                  v                 |  |
 |  |    orchestrates           tsc/eslint         enriches               |  |
 |  +---------------------------------------------------------------------+  |
 |                                    |                                      |
 |                                    v                                      |
 |  +---------------------------------------------------------------------+  |
 |  |                        QUERY LAYER                                  |  |
 |  |  +-------------------+  +---------------+                           |  |
 |  |  | DataProvider      |  |    Views      |                           |  |
 |  |  |   [Container]     |  |  [Container]  |                           |  |
 |  |  +-------------------+  +---------------+                           |  |
 |  |         |                      |                                    |  |
 |  |         v                      v                                    |  |
 |  |     unified SQL           C4 diagrams                               |  |
 |  +---------------------------------------------------------------------+  |
 |                                    |                                      |
 |                                    v                                      |
 |  +---------------------------------------------------------------------+  |
 |  |                        SERVER LAYER                                 |  |
 |  |  +-------------------+  +---------------+                           |  |
 |  |  | DevacMCPServer    |  |   Commands    |                           |  |
 |  |  |   [Container]     |  |  [Container]  |                           |  |
 |  |  +-------------------+  +---------------+                           |  |
 |  |         |                      |                                    |  |
 |  |         v                      v                                    |  |
 |  |       MCP tools            CLI entry                                |  |
 |  +---------------------------------------------------------------------+  |
 |                                                                           |
 +---------------------------------------------------------------------------+
```

### Analysis Layer Relationships

| From | To | Label |
|------|-----|-------|
| Analyzer | Parsers | Delegates parsing by language |
| Analyzer | Semantic | Delegates resolution |
| Parsers | Source Code | Reads files via tree-sitter |
| Semantic | Source Code | Reads files for cross-file resolution |
| Analyzer | Storage | Writes analysis results |

```likec4
// Analysis layer relationships
devac_core.analyzer -> devac_core.parsers "Delegates parsing by language"
devac_core.analyzer -> devac_core.semantic "Delegates resolution"
devac_core.parsers -> source_code "Reads files via tree-sitter"
devac_core.semantic -> source_code "Reads files for cross-file resolution"
devac_core.analyzer -> devac_core.storage "Writes analysis results"
```

### Storage Layer Relationships

| From | To | Label |
|------|-----|-------|
| Seeds | DuckDBPool | Queries via |
| Seeds | File System | Reads/Writes Parquet |
| Effects | DuckDBPool | Queries via |
| Effects | File System | Reads/Writes Parquet |

```likec4
// Storage layer relationships
devac_core.seeds -> devac_core.duckdb_pool "Queries via"
devac_core.seeds -> filesystem "Reads/Writes Parquet"
devac_core.effects -> devac_core.duckdb_pool "Queries via"
devac_core.effects -> filesystem "Reads/Writes Parquet"
```

### Federation Layer Relationships

| From | To | Label |
|------|-----|-------|
| CentralHub | Storage | Reads package seeds |
| CentralHub | Central Hub DB | Writes to central.duckdb |
| HubClient | CentralHub | IPC or direct access |
| CrossRepoDetector | File System | Scans for sibling repos |

```likec4
// Federation layer relationships
devac_core.central_hub -> devac_core.storage "Reads package seeds"
devac_core.central_hub -> central_hub_db "Writes to central.duckdb"
devac_core.hub_client -> devac_core.central_hub "IPC via Unix socket"
devac_core.cross_repo_detector -> filesystem "Scans for sibling repos"
```

### Validation Layer Relationships

| From | To | Label |
|------|-----|-------|
| ValidationCoordinator | Validators | Orchestrates validation |
| Validators | Source Code | Runs tsc/eslint/vitest |
| IssueEnricher | Storage | Reads code graph for context |
| ValidationCoordinator | CentralHub | Reports validation errors |

```likec4
// Validation layer relationships
devac_core.validation_coordinator -> devac_core.validators "Orchestrates validation"
devac_core.validators -> source_code "Runs tsc/eslint/vitest"
devac_core.issue_enricher -> devac_core.storage "Reads code graph for context"
devac_core.validation_coordinator -> devac_core.central_hub "Reports validation errors"
```

### Query Layer Relationships

| From | To | Label |
|------|-----|-------|
| DataProvider | Storage | Queries local package seeds |
| DataProvider | CentralHub | Queries federated hub |
| Views | DataProvider | Gets code graph data |

```likec4
// Query layer relationships
devac_core.data_provider -> devac_core.storage "Queries local package seeds"
devac_core.data_provider -> devac_core.central_hub "Queries federated hub"
devac_core.diagram_views -> devac_core.data_provider "Gets code graph data"
```

### Server Layer Relationships

| From | To | Label |
|------|-----|-------|
| DevacMCPServer | DataProvider | Exposes as MCP tools |
| DevacMCPServer | CentralHub | Owns hub in single-writer mode |
| Commands | DataProvider | CLI entry point |
| Commands | ValidationCoordinator | Triggers validation |

```likec4
// Server layer relationships
devac_core.mcp_server -> devac_core.data_provider "Exposes as MCP tools"
devac_core.mcp_server -> devac_core.central_hub "Owns hub in single-writer mode"
devac_core.commands -> devac_core.data_provider "CLI entry point"
devac_core.commands -> devac_core.validation_coordinator "Triggers validation"
```

## Key Components

### Analysis Layer
- **LanguageRouter**: Routes files to appropriate parser
- **TypeScriptParser**: TS/TSX AST extraction via tree-sitter
- **PythonParser**: Python AST extraction via tree-sitter
- **CSharpParser**: C# AST extraction via tree-sitter
- **TypeScriptSemanticResolver**: Cross-file resolution for TS
- **PythonSemanticResolver**: Cross-file resolution for Python
- **CSharpSemanticResolver**: Cross-file resolution for C#

### Storage Layer
- **DuckDBPool**: Connection pooling with error recovery
- **SeedWriter/SeedReader**: Parquet I/O for code graph nodes/edges
- **EffectWriter/EffectReader**: Parquet I/O for extracted effects

### Federation Layer
- **CentralHub**: Single-writer cross-repo DuckDB database
- **HubClient**: IPC client for CLI when MCP owns hub
- **HubServer**: Unix socket server for IPC
- **HubStorage**: Low-level hub database operations
- **ManifestGenerator**: Generates .devac/manifest.json
- **CrossRepoDetector**: Discovers sibling repositories

### Validation Layer
- **ValidationCoordinator**: Orchestrates validation pipeline
- **TypecheckValidator**: TypeScript type checking
- **LintValidator**: ESLint validation
- **TestValidator**: Vitest test execution
- **CoverageValidator**: Code coverage analysis
- **IssueEnricher**: Adds code graph context to issues

### Query Layer
- **PackageDataProvider**: Queries single package seed
- **HubDataProvider**: Queries federated hub
- **Views**: C4 diagram generation

### Server Layer
- **DevacMCPServer**: MCP server with 18 tools
- **Commands**: CLI commands (analyze, query, validate, etc.)

## External Systems

| System | Type | Technology |
|--------|------|------------|
| Source Code | Input | TS/Py/C# files |
| File System | Storage | Parquet seeds in .devac/seed/ |
| Central Hub DB | Federation | DuckDB at ~/ws/.devac/central.duckdb |
| Tree-sitter | Parser | Language-specific grammars |
| DuckDB | Query Engine | In-memory analytical queries |

## All Relationships Summary

This section consolidates all relationships for easy model.c4 generation:

```likec4
// =====================================================
// ALL RELATIONSHIPS (copy to model.c4)
// =====================================================

// Context level
developer -> devac_core "Uses for code analysis"
devac_core -> source_code "Parses TS/Py/C# files"
devac_core -> filesystem "Reads/Writes Parquet seeds"
devac_core -> central_hub_db "Federates cross-repo queries"

// Analysis layer
devac_core.analyzer -> devac_core.parsers "Delegates parsing by language"
devac_core.analyzer -> devac_core.semantic "Delegates resolution"
devac_core.parsers -> source_code "Reads files via tree-sitter"
devac_core.semantic -> source_code "Reads files for cross-file resolution"
devac_core.analyzer -> devac_core.storage "Writes analysis results"

// Storage layer
devac_core.seeds -> devac_core.duckdb_pool "Queries via"
devac_core.seeds -> filesystem "Reads/Writes Parquet"
devac_core.effects -> devac_core.duckdb_pool "Queries via"
devac_core.effects -> filesystem "Reads/Writes Parquet"

// Federation layer
devac_core.central_hub -> devac_core.storage "Reads package seeds"
devac_core.central_hub -> central_hub_db "Writes to central.duckdb"
devac_core.hub_client -> devac_core.central_hub "IPC via Unix socket"
devac_core.cross_repo_detector -> filesystem "Scans for sibling repos"

// Validation layer
devac_core.validation_coordinator -> devac_core.validators "Orchestrates validation"
devac_core.validators -> source_code "Runs tsc/eslint/vitest"
devac_core.issue_enricher -> devac_core.storage "Reads code graph for context"
devac_core.validation_coordinator -> devac_core.central_hub "Reports validation errors"

// Query layer
devac_core.data_provider -> devac_core.storage "Queries local package seeds"
devac_core.data_provider -> devac_core.central_hub "Queries federated hub"
devac_core.diagram_views -> devac_core.data_provider "Gets code graph data"

// Server layer
devac_core.mcp_server -> devac_core.data_provider "Exposes as MCP tools"
devac_core.mcp_server -> devac_core.central_hub "Owns hub in single-writer mode"
devac_core.commands -> devac_core.data_provider "CLI entry point"
devac_core.commands -> devac_core.validation_coordinator "Triggers validation"
```

## Verification Checklist

- [x] All ASCII arrows have corresponding rows in relationships tables
- [x] All table rows have corresponding LikeC4 code in code blocks
- [x] All code blocks are consolidated in "All Relationships Summary" section
- [x] model.c4 relationships section matches the summary code block exactly
- [x] Count: 28 relationships (tables match code blocks match model.c4)
- [x] LikeC4 validation passes: `npx likec4 validate .` returns no errors
