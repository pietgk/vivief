# Quick Start Guide

Get DevAC analyzing your codebase in under 10 minutes.

> **Looking to use DevAC with AI assistants?** See the comprehensive
> [Start Asking About Your Code](./start-asking-about-your-code-guide.md) guide.

## Prerequisites

- Node.js 20+
- A TypeScript, Python, or C# project to analyze

## Installation

### From GitHub Packages (Recommended)

```bash
# Configure npm for GitHub Packages (one-time setup)
echo "@pietgk:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# Install the CLI globally
npm install -g @pietgk/devac-cli

# Verify installation
devac --version
```

> **Note:** You need a GitHub Personal Access Token with `read:packages` scope.
> See [Creating a Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) for instructions.

### From Source

```bash
# Clone the repository
git clone https://github.com/pietgk/vivief.git
cd vivief

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI globally
(cd packages/devac-cli && pnpm link --global)
```

## Basic Usage

### 1. Check Status

After installation, verify DevAC is working and check your current context:

```bash
# Navigate to your project
cd /path/to/your/project

# Check status (also works with just `devac` with no arguments)
devac status

# Or simply:
devac
```

**Output:**
```
DevAC Status
  Context:      my-project
  DevAC Health: watch:inactive  hub:connected
  Seeds:        1 package analyzed
```

> **Tip:** Running `devac` with no arguments shows the brief status by default.

### 2. Analyze a Package

```bash
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

### 3. Query Your Code

```bash
# Find all exported functions
devac query "SELECT name, file_path FROM nodes WHERE kind='function' AND is_exported=true"

# Find who imports a specific module
devac query "SELECT source_file_path, imported_symbol FROM external_refs WHERE module_specifier LIKE '%react%'"
```

### 4. Watch for Changes

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
| `devac` | Show brief status (default action) |
| `devac status` | Show status (supports `--brief`, `--full`, `--json`) |
| `devac analyze` | Parse and generate seeds |
| `devac analyze --if-changed` | Only re-analyze changed files |
| `devac analyze --force` | Force full re-analysis |
| `devac query "<sql>"` | Run DuckDB SQL query |
| `devac watch` | Watch for file changes |
| `devac diagnostics` | Query all diagnostics from hub |
| `devac verify` | Check seed integrity |
| `devac clean` | Remove all seeds |

> **Tip:** Use `devac ws` as a shorthand for `devac workspace` commands (e.g., `devac ws status`).

## Multi-Repository Setup

For projects with multiple repositories in a parent directory:

```
~/ws/                    ← Parent directory (workspace)
├── api/                 ← Repository 1
├── web/                 ← Repository 2
├── shared/              ← Repository 3
└── api-ghapi-123-auth/  ← Worktree for issue #123
```

### Step 1: Generate Seeds for Each Repo

Each repository needs seeds before workspace-level monitoring works:

```bash
# Option A: Manual analysis per repo
cd ~/ws/api && devac analyze
cd ~/ws/web && devac analyze
cd ~/ws/shared && devac analyze

# Option B: Use watch mode (auto-analyzes if seeds missing)
cd ~/ws/api && devac watch &
cd ~/ws/web && devac watch &
cd ~/ws/shared && devac watch &
```

### Step 2: Check Workspace Status

```bash
# From parent directory
cd ~/ws

# See all repos and their seed status
devac workspace status
```

**Output:**
```
Workspace: /Users/you/ws
Hub: .devac/hub.duckdb

Repositories (3 main, 1 worktree):
  ✓ api          seeds: ✓  hub: registered
  ✓ web          seeds: ✓  hub: registered
  ✓ shared       seeds: ✓  hub: registered
  ↳ api-ghapi-123-auth  (issue: ghapi-123)

Worktrees by Issue:
  ghapi-123: api-ghapi-123-auth
```

### Step 3: Start Workspace Watcher

```bash
# From parent directory
cd ~/ws

# Start workspace-level monitoring
devac workspace watch
```

**How it works:**
1. `devac watch` (per-repo) monitors source files → updates seeds
2. `devac workspace watch` monitors seed files → refreshes hub
3. Hub enables cross-repo queries

### Step 4: Query Across Repos

```bash
# Find function across all registered repos
devac hub query "SELECT * FROM nodes WHERE name='handleLogin'"

# View registered repos
devac hub list
```

### Workflow Summary

| Task | Command | Run From |
|------|---------|----------|
| Check status | `devac` or `devac status` | Anywhere |
| Analyze single repo | `devac analyze` | Inside repo |
| Watch single repo | `devac watch` | Inside repo |
| Check workspace status | `devac ws status` | Parent directory |
| Watch workspace (seeds→hub) | `devac ws watch` | Parent directory |
| Query across repos | `devac hub query "..."` | Anywhere |
| View diagnostics | `devac diagnostics` | Anywhere |

> **Note:** `devac ws` is a shorthand for `devac workspace`.

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

*Next: [Data Model](./implementation/data-model.md) for understanding the schema*
