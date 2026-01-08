# Architecture Reasoning: @pietgk/devac-core

> **Generated:** 2026-01-08
> **Method:** Code graph analysis via devac CLI

## Queries Used

### Structure Discovery
```sql
-- Get node kinds distribution
SELECT DISTINCT kind, COUNT(*)::INT as count
FROM nodes
GROUP BY kind
ORDER BY count DESC

-- Result: function(1039), method(757), interface(625), type(274), module(263), property(241), class(139)
```

### Module Organization
```sql
-- Get top-level modules in src/
SELECT DISTINCT split_part(file_path, '/', 2) as module
FROM nodes
WHERE file_path LIKE 'src/%'
GROUP BY module
ORDER BY COUNT(*) DESC

-- Result: commands, workspace, hub, storage, parsers, validation, context, utils, views, semantic, types, watcher, analyzer, rules, effects, config, benchmark, runner, judge, reporter, cli, tools
```

### Key Classes
```sql
-- Get exported classes with file paths
SELECT name, qualified_name, kind, file_path
FROM nodes
WHERE is_exported = true AND kind = 'class' AND file_path LIKE 'src/%'
ORDER BY file_path
```

### External Dependencies
```sql
-- Get npm package usage
SELECT module_specifier, COUNT(*)::INT as count
FROM external_refs
WHERE module_specifier NOT LIKE '.%'
GROUP BY module_specifier
ORDER BY count DESC LIMIT 30

-- Key dependencies: duckdb-async, commander, tree-sitter, chokidar, execa, @modelcontextprotocol/sdk
```

### Relationship Types
```sql
-- Get edge type distribution
SELECT edge_type, COUNT(*)::INT as count
FROM edges
GROUP BY edge_type
ORDER BY count DESC

-- Result: CALLS(12174), CONTAINS(3073), EXTENDS(30), PARAMETER_OF(3), IMPLEMENTS(1)
```

## Inferences Made

### Layer Groupings

Based on file path analysis and class responsibilities:

1. **Analysis Layer** - Files in `src/analyzer/`, `src/parsers/`, `src/semantic/`
   - LanguageRouter routes to language-specific parsers
   - Each parser uses tree-sitter for AST extraction
   - Semantic resolvers handle cross-file references

2. **Storage Layer** - Files in `src/storage/`
   - DuckDBPool provides connection pooling
   - SeedWriter/SeedReader handle Parquet I/O for code graph
   - EffectWriter/EffectReader handle effect data

3. **Federation Layer** - Files in `src/hub/`, `src/context/`
   - CentralHub is the single-writer database owner
   - HubClient provides IPC access when MCP server runs
   - CrossRepoDetector finds sibling repositories

4. **Validation Layer** - Files in `src/validation/`
   - ValidationCoordinator orchestrates multiple validators
   - Individual validators for tsc, eslint, vitest, coverage
   - IssueEnricher adds code graph context

5. **Query Layer** - `src/data-provider.ts`, `src/views/`
   - PackageDataProvider for single-package queries
   - HubDataProvider for federated queries
   - Views for C4 diagram generation

6. **Server Layer** - `src/server.ts`, `src/commands/`
   - DevacMCPServer exposes 18 MCP tools
   - Commands provide CLI entry points

### Relationship Inference

- Analyzer -> Parsers/Semantic: Based on import analysis and logical flow
- Storage components -> DuckDBPool: Based on class usage patterns
- CentralHub -> Storage: Based on manifest generation and seed reading logic
- HubClient -> CentralHub: Based on IPC architecture (ADR-0024)
- Validators -> Source Code: Based on external process execution (tsc, eslint, vitest)

## Gaps in Data

- **Effects table not populated**: `query_effects` MCP tool returns "Table effects does not exist"
  - Effect extraction may not have been run, or uses different storage
  - Could not verify effect-based relationships

- **MCP SQL queries failing**: The MCP `query_sql` tool couldn't find tables even though CLI works
  - Workaround: Used `devac query -p packages/devac-core` directly
  - Bug: MCP server can list repos but can't query seed tables

## Assumptions

- **Single-writer architecture**: CentralHub owns the database when MCP is running
  - Based on ADR-0024 documentation in CLAUDE.md
  - HubClient routes via IPC or direct access based on MCP state

- **Tree-sitter for all parsers**: All language parsers use tree-sitter
  - Based on dependency on `tree-sitter` and `tree-sitter-c-sharp`
  - Confirmed by parser class naming patterns

- **Parquet for all seeds**: All code graph data stored as Parquet
  - Based on SeedWriter/SeedReader class presence
  - Consistent with DuckDB's Parquet integration

## Verification Notes

- **Relationship count**: 24 relationships total
- **Parity verified**: Markdown tables = LikeC4 code blocks = model.c4 relationships
- **External systems**: 3 identified (Source Code, File System, Central Hub DB)
