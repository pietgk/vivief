# DevAC (vivief)

Fast, local code analysis with DuckDB + Parquet storage.

> **vivief** = Vision View Effect - A federated code analysis system for understanding codebases at scale.

## Features

- **Multi-language support**: TypeScript, Python, C#
- **Fast storage**: DuckDB + Parquet for sub-second queries
- **Incremental updates**: Watch mode with <300ms updates
- **Cross-repo federation**: Central hub for multi-repository analysis
- **AI integration**: MCP server for AI assistants

## Installation

### From GitHub Packages (Recommended)

Install the CLIs globally from GitHub Packages:

```bash
# Configure npm for GitHub Packages (one-time setup)
echo "@pietgk:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# Install all CLIs globally
npm install -g @pietgk/devac-cli @pietgk/devac-mcp @pietgk/devac-worktree

# Verify installation
devac --version
devac-mcp --version
devac-worktree --version
```

> **Note:** You need a GitHub Personal Access Token with `read:packages` scope.
> See the [Getting Started Guide](./docs/start-asking-about-your-code-guide.md) for detailed setup instructions.

### From Source

```bash
# Clone the repository
git clone https://github.com/pietgk/vivief.git
cd vivief

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link all CLIs globally
(cd packages/devac-cli && pnpm link --global)
(cd packages/devac-mcp && pnpm link --global)
(cd packages/devac-worktree && pnpm link --global)

# Verify installation
devac --version
devac-mcp --version
devac-worktree --version
```

## Quick Start

```bash
# Analyze a package
devac analyze --package ./my-project

# Query the code graph
devac query "SELECT name, kind FROM nodes WHERE kind = 'function'"

# Watch for changes
devac watch --package ./my-project

# Find affected files
devac affected src/api/user.ts src/models/user.ts
```

## Packages

| Package | Description |
|---------|-------------|
| [@pietgk/devac-core](./packages/devac-core) | Core analysis engine |
| [@pietgk/devac-cli](./packages/devac-cli) | Command-line interface |
| [@pietgk/devac-mcp](./packages/devac-mcp) | MCP server for AI assistants |
| [@pietgk/devac-worktree](./packages/devac-worktree) | Issue-based worktree workflow |

## CLI Commands

### Analysis

```bash
# Analyze a package
devac analyze -p ./my-package

# Analyze only if files changed
devac analyze -p ./my-package --if-changed

# Force full reanalysis
devac analyze -p ./my-package --force
```

### Querying

```bash
# JSON output (default)
devac query "SELECT * FROM nodes LIMIT 10"

# CSV output
devac query "SELECT name, kind FROM nodes" --format csv

# Table output
devac query "SELECT name, kind FROM nodes" --format table
```

### Watch Mode

```bash
# Watch with verbose output
devac watch -p ./my-package --verbose

# Custom debounce interval
devac watch -p ./my-package --debounce 200
```

### Hub Commands (Federation)

```bash
# Initialize central hub
devac hub init

# Register a repository
devac hub register ./my-repo

# List registered repositories
devac hub list

# Check hub status
devac hub status

# Refresh manifests
devac hub refresh
```

### Context Discovery

DevAC can automatically discover related repositories in a parent directory workflow:

```bash
# Show current context (sibling repos, issue worktrees)
devac context

# Query across all repos in context
devac context query "SELECT name, kind FROM nodes WHERE kind = 'function'"

# Check CI status for all PRs in context
devac context ci

# Generate LLM review prompt for changes
devac context review
devac context review --focus security
```

**Parent Directory Mode**: When running from a directory containing multiple git repos (but not itself a repo), DevAC automatically detects all child repositories and enables cross-repo operations.

### Worktree Commands (devac-worktree)

Issue-based git worktree workflow with Claude integration:

```bash
# Create worktree and launch Claude for an issue (from inside a repo)
devac-worktree start 123

# Create worktrees in multiple sibling repos
devac-worktree start 123 --also web --also shared

# From a parent directory: create worktrees in specified repos
devac-worktree start 123 --repos api,web,shared

# List active worktrees
devac-worktree list

# Show status with PR info
devac-worktree status

# Resume work on existing worktree
devac-worktree resume 123

# Clean up merged worktrees
devac-worktree clean 123
devac-worktree clean-merged
```

**Parent Directory Workflow**: Use `--repos` when running from a parent directory to create worktrees in multiple repositories at once. Claude will launch in the parent directory for unified multi-repo development.

### Workspace Commands

Multi-repo workspace management for federated code analysis:

```bash
# From parent directory containing multiple repos
cd ~/ws

# Check status of all repos in workspace
devac workspace status

# Start workspace watcher (monitors seeds, auto-refreshes hub)
devac workspace watch

# Initialize workspace configuration
devac workspace init
```

**How it works:**
1. `devac watch` per-repo monitors source files → updates seeds
2. `devac workspace watch` monitors seed files → refreshes hub
3. Hub enables cross-repo queries via MCP or CLI

> **Note:** Repos must have seeds (run `devac analyze` or `devac watch` first) before `devac workspace watch` can detect changes.

### MCP Server

```bash
# Start MCP server (for AI integration)
devac mcp -p ./my-package
```

## Data Model

### Nodes

Code entities extracted from source files:

| Kind | Description |
|------|-------------|
| `function` | Functions and methods |
| `class` | Classes and structs |
| `interface` | Interfaces and protocols |
| `variable` | Variables and constants |
| `type` | Type aliases |
| `enum` | Enumerations |
| `property` | Class/object properties |
| `parameter` | Function parameters |

### Edges

Relationships between nodes:

| Type | Description |
|------|-------------|
| `CALLS` | Function calls |
| `IMPORTS` | Import statements |
| `EXTENDS` | Class inheritance |
| `IMPLEMENTS` | Interface implementation |
| `CONTAINS` | Parent-child containment |
| `RETURNS` | Return type |
| `TYPE_OF` | Type annotation |

### External Refs

References to external packages (npm, pip, NuGet):

```sql
SELECT * FROM external_refs 
WHERE module_specifier LIKE 'react%'
```

## Storage Structure

```
my-project/
└── .devac/
    ├── seed/
    │   ├── base/
    │   │   ├── nodes.parquet
    │   │   ├── edges.parquet
    │   │   └── external_refs.parquet
    │   └── branch/
    │       └── feature-x/
    │           └── ...
    └── manifest.json
```

## Claude Code Plugin

DevAC includes a Claude Code plugin that provides AI-powered code analysis skills and workflow commands.

### Plugin Features

**Analytics Layer Skills** (activate automatically):
- **code-analysis** - Analyze code structure, find symbols, explore hierarchies
- **impact-analysis** - Determine what changes will affect, find dependencies
- **codebase-navigation** - Navigate and locate code definitions
- **diagnostics-triage** - Triage and prioritize errors and warnings
- **multi-repo-context** - Work across multiple repositories

**Workflow Commands** (user-invoked):
- `/commit` or `/devac:commit` - Full commit workflow with changeset/ADR checks
- `/ship` or `/devac:ship` - Commit, push, and create PR
- `/start-issue` or `/devac:start-issue` - Start work on a GitHub issue
- `/devac-status` or `/devac:devac-status` - Query status across all Four Pillars

> **Note**: Command format depends on how the plugin is loaded. See below.

### How Plugin Loading Works

| Method | Command Format | When to Use |
|--------|---------------|-------------|
| **Install via Marketplace** | `/devac:commit` | Recommended - works globally |
| **Marketplace** (inside vivief) | `/commit` | Working inside this repository |
| **--plugin-dir** | `/devac:commit` | Development/testing |

### Activating the Plugin

**Option 1: Install via Marketplace (Recommended)**

Install globally to use in any project:

```bash
# Add the vivief marketplace (one-time setup)
claude plugin marketplace add pietgk/vivief

# Install the DevAC plugin
claude plugin install devac@vivief
```

Commands are available as `/devac:commit`, `/devac:ship`, etc.

**Option 2: Working inside the vivief repository**

The plugin loads automatically via the marketplace configuration. Commands work as `/commit`, `/ship`, etc. (no namespace).

**Option 3: Development/testing**

```bash
claude --plugin-dir /path/to/vivief/plugins/devac
```

Commands are namespaced as `/devac:commit`, `/devac:ship`, etc.

### Plugin Structure

```
plugins/devac/
├── .claude-plugin/plugin.json   # Plugin metadata
├── .mcp.json                    # MCP server config
├── commands/                    # 11 workflow commands
├── skills/                      # 5 Analytics Layer skills
└── README.md                    # Plugin documentation
```

See [plugins/devac/README.md](./plugins/devac/README.md) for detailed plugin documentation including how to use the plugin without the vivief repository.

## MCP Integration

For AI assistant integration, run the MCP server:

```bash
devac-mcp -p ./my-package
```

Available tools:
- `find_symbol` - Find symbols by name
- `get_dependencies` - Get outgoing edges
- `get_dependents` - Get incoming edges
- `get_affected` - Find affected files from changes
- `get_call_graph` - Function call graph
- `query_sql` - Execute SQL queries

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Requirements

- Node.js 20+
- pnpm 9+
- Python 3.8+ (for Python parsing)

## Documentation

Comprehensive documentation is available in the [docs/](./docs/) directory:

- **[Start Asking About Your Code](./docs/start-asking-about-your-code-guide.md)** - End-to-end guide for AI integration
- [Quick Start](./docs/quick-start.md) - Get up and running
- [Architecture Overview](./docs/implementation/overview.md) - System design
- [CLI Reference](./docs/cli-reference.md) - Command documentation
- [API Reference](./docs/api-reference.md) - Programmatic API
- [MCP Server](./docs/mcp-server.md) - AI assistant integration
- [Data Model](./docs/implementation/data-model.md) - Nodes, edges, refs schema
- [Storage System](./docs/implementation/storage.md) - DuckDB + Parquet internals

## License

MIT
