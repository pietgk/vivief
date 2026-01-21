# @pietgk/devac-cli

Command-line interface for DevAC - analyze, query, and manage code graphs from your terminal.

## Installation

```bash
pnpm add -g @pietgk/devac-cli
```

## Command Structure

DevAC CLI uses three primary commands:

| Command | Description |
|---------|-------------|
| `devac sync` | Analyze packages and register repos with hub |
| `devac status` | Show DevAC status, health, and diagnostics |
| `devac query <subcommand>` | Query the code graph |

Plus utility commands:
- `devac mcp` - Start MCP server for AI assistants
- `devac workflow` - CI/git integration commands

## Quick Start

```bash
# Check current status
devac status

# Analyze and register packages
devac sync

# Query the code graph
devac query symbol MyClass
devac query deps entity:fn:login
devac query "SELECT * FROM nodes LIMIT 10"
```

## Sync Command

Analyze packages and register repos with the hub:

```bash
# Smart sync based on context (workspace/repo/package)
devac sync

# With validation (typecheck, lint)
devac sync --validate

# Continuous watch mode
devac sync --watch

# Force full resync
devac sync --force

# Include CI and GitHub issues data
devac sync --ci --issues

# Generate documentation
devac sync --docs

# Clean stale data first
devac sync --clean
```

## Status Command

Show DevAC status, health, and diagnostics:

```bash
# Default summary view
devac status

# One-liner output
devac status --brief

# Full details
devac status --full

# Show validation errors/warnings
devac status --diagnostics

# Show hub health
devac status --hub

# Show seed freshness
devac status --seeds

# Verify seed integrity
devac status --seeds --verify

# Run health checks
devac status --doctor

# Auto-fix issues
devac status --doctor --fix

# Check if changeset needed
devac status --changeset

# JSON output
devac status --json
```

## Query Command

Query the code graph with subcommands:

### Query Subcommands

| Subcommand | Description |
|------------|-------------|
| `query sql <query>` | Execute raw SQL |
| `query symbol <name>` | Find symbols by name |
| `query deps <entityId>` | Get dependencies |
| `query dependents <entityId>` | Get reverse dependencies |
| `query file <path>` | Get symbols in a file |
| `query call-graph <entityId>` | Get call graph |
| `query affected <files...>` | Get affected files |
| `query effects` | Query code effects |
| `query repos` | List registered repos |
| `query c4 [level]` | Generate C4 diagrams |
| `query context` | Discover workspace context |
| `query rules` | Run rules engine |
| `query schema` | Get database schema |

### Examples

```bash
# Find a symbol
devac query symbol UserService

# Get dependencies
devac query deps myrepo:src/auth:fn:login

# Raw SQL query
devac query sql "SELECT name, kind FROM nodes WHERE is_exported = true"

# Find affected files
devac query affected src/auth.ts src/user.ts

# Get call graph
devac query call-graph myrepo:src/api:fn:handleRequest --direction callees

# Generate C4 diagram
devac query c4 context --format plantuml
```

## MCP Command

Start the MCP server for AI assistant integration:

```bash
# Hub mode (default) - federated queries across all repos
devac mcp

# Package mode - single package queries
devac mcp --package /path/to/package
```

## Workflow Command

CI/git integration commands:

```bash
# Pre-commit validation
devac workflow pre-commit

# Full pre-ship validation
devac workflow prepare-ship

# Check if changeset needed
devac workflow check-changeset

# Build and link CLI locally
devac workflow install-local

# Plugin development mode
devac workflow plugin-dev
devac workflow plugin-global
```

## Configuration

DevAC can be configured via `devac.config.json` in your package root:

```json
{
  "extensions": [".ts", ".tsx", ".js", ".jsx"],
  "ignore": ["node_modules", "dist", "**/*.test.ts"],
  "memoryLimit": "256MB"
}
```

## Output

Seeds are stored in `.devac/seed/` within your package:

```
.devac/
  seed/
    base/
      nodes.parquet      # Symbol definitions
      edges.parquet      # Symbol relationships
      external_refs.parquet  # Import references
      effects.parquet    # Code effects (v3.0)
    meta.json           # Schema version and metadata
```

## Full Documentation

- **[CLI Reference](../../docs/cli-reference.md)** - Complete command documentation
- **[Quick Start Guide](../../docs/quick-start.md)** - Getting started

## Related Packages

- [@pietgk/devac-core](../devac-core) - Core analysis library
- [@pietgk/devac-mcp](../devac-mcp) - MCP server implementation

## License

MIT
