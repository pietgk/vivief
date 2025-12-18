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

Install the CLI globally from GitHub Packages:

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

# Link CLI globally
pnpm --filter @pietgk/devac-cli link --global
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
- [Architecture Overview](./docs/architecture-overview.md) - System design
- [CLI Reference](./docs/cli-reference.md) - Command documentation
- [API Reference](./docs/api-reference.md) - Programmatic API
- [MCP Server](./docs/mcp-server.md) - AI assistant integration
- [Data Model](./docs/data-model.md) - Nodes, edges, refs schema
- [Storage System](./docs/storage-system.md) - DuckDB + Parquet internals

## License

MIT
