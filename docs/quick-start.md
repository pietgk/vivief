# Quick Start Guide

Get DevAC v2 analyzing your codebase in under 10 minutes.

## Prerequisites

- Node.js 18+
- A TypeScript, Python, or C# project to analyze

## Installation

```bash
# From the CodeGraph repository
cd CodeGraph
npm install
npm run build
```

## Basic Usage

### 1. Analyze a Package

```bash
# Navigate to your project
cd /path/to/your/project

# Run initial analysis
devac analyze

# Or specify a package path
devac analyze --package ./packages/auth
```

**Output:**
```
✓ Analyzed 156 files
  Nodes: 2,341
  Edges: 1,892
  External refs: 423
  Time: 3.2s
  Seeds written to: .devac/seed/
```

### 2. Query Your Code

```bash
# Find all exported functions
devac query "SELECT name, file_path FROM nodes WHERE kind='function' AND is_exported=true"

# Find who imports a specific module
devac query "SELECT source_file_path, imported_symbol FROM external_refs WHERE module_specifier LIKE '%react%'"
```

### 3. Watch for Changes

```bash
# Start watch mode - seeds update automatically on file save
devac watch
```

**Output:**
```
👀 Watching ./packages/auth for changes...

[10:32:15] src/auth.ts changed → updated in 145ms
[10:32:18] src/utils.ts changed → updated in 132ms
```

## Directory Structure After Analysis

```
your-project/
├── src/
│   ├── index.ts
│   └── ...
├── .devac/                     ← Created by DevAC
│   ├── meta.json               ← Schema version
│   └── seed/
│       ├── base/               ← Main branch data
│       │   ├── nodes.parquet
│       │   ├── edges.parquet
│       │   └── external_refs.parquet
│       └── branch/             ← Feature branch delta (if applicable)
└── package.json
```

## Common Commands

| Command | Description |
|---------|-------------|
| `devac analyze` | Parse and generate seeds |
| `devac analyze --if-changed` | Only re-analyze changed files |
| `devac analyze --force` | Force full re-analysis |
| `devac query "<sql>"` | Run DuckDB SQL query |
| `devac watch` | Watch for file changes |
| `devac verify` | Check seed integrity |
| `devac clean` | Remove all seeds |

## Multi-Repository Setup

### 1. Register Repositories with Hub

```bash
# From each repository
devac hub register

# Or register another repo
devac hub register ~/code/other-repo
```

### 2. Query Across Repos

```bash
# Find function across all registered repos
devac hub query "SELECT * FROM nodes WHERE name='handleLogin'"

# View registered repos
devac hub list
```

## Programmatic Usage

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

// Analyze a package
const orchestrator = createAnalysisOrchestrator(pool);
const result = await orchestrator.analyzePackage("./packages/auth");

console.log(`Analyzed ${result.filesAnalyzed} files`);
console.log(`Created ${result.totalNodes} nodes`);

// Query nodes
const reader = createSeedReader(pool, "./packages/auth");
const functions = await reader.query(`
  SELECT name, file_path 
  FROM nodes 
  WHERE kind = 'function' AND is_exported = true
`);

// Cleanup
await pool.shutdown();
```

## Quick SQL Queries

```sql
-- All classes in the codebase
SELECT name, file_path FROM nodes WHERE kind = 'class'

-- Functions with most lines
SELECT name, file_path, (end_line - start_line) as lines 
FROM nodes 
WHERE kind = 'function' 
ORDER BY lines DESC LIMIT 10

-- Imports from external packages
SELECT DISTINCT module_specifier, COUNT(*) as count
FROM external_refs 
WHERE module_specifier NOT LIKE './%'
GROUP BY module_specifier
ORDER BY count DESC

-- Call graph (who calls what)
SELECT 
  s.name as caller,
  t.name as callee
FROM edges e
JOIN nodes s ON e.source_entity_id = s.entity_id
JOIN nodes t ON e.target_entity_id = t.entity_id
WHERE e.edge_type = 'CALLS'
```

## Troubleshooting

### Seeds are out of date

```bash
# Verify integrity
devac verify

# If issues found, regenerate
devac analyze --force
```

### Watch mode not detecting changes

```bash
# Check if file extensions are supported
devac analyze --list-extensions

# Restart watch with verbose logging
DEBUG=devac:watcher devac watch
```

### Query returns no results

```bash
# Verify seeds exist
ls -la .devac/seed/base/

# Check node count
devac query "SELECT COUNT(*) FROM nodes"

# Verify file was analyzed
devac query "SELECT DISTINCT file_path FROM nodes"
```

---

*Next: [Data Model](./data-model.md) for understanding the schema*
