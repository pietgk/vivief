# CLAUDE.md

This file provides guidance to AI coding agents working with the DevAC monorepo.

## Project Overview

DevAC is a code analysis tool that uses DuckDB + Parquet for fast, local code graph storage. It supports TypeScript, Python, and C# with incremental updates and cross-repository federation.

## Repository Structure

```
devac/
├── packages/
│   ├── devac-core/     # Core analysis engine (DuckDB, parsers, storage)
│   ├── devac-cli/      # Command-line interface
│   └── devac-mcp/      # MCP server for AI assistants
├── turbo.json          # Turborepo configuration
├── biome.json          # Linting and formatting
└── pnpm-workspace.yaml # Workspace definition
```

## Package Dependencies

```
@devac/cli  ────┐
                ├──> @devac/core
@devac/mcp  ────┘
```

- **@devac/core**: Standalone, no internal dependencies
- **@devac/cli**: Depends on @devac/core
- **@devac/mcp**: Depends on @devac/core

## Essential Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting and formatting
pnpm lint
pnpm lint:fix
pnpm format

# Clean build artifacts
pnpm clean
```

## Working with Packages

```bash
# Build specific package
pnpm --filter @devac/core build

# Run tests for specific package
pnpm --filter @devac/cli test

# Run CLI locally
pnpm --filter @devac/cli exec devac --help

# Run MCP server locally
pnpm --filter @devac/mcp exec devac-mcp --help
```

## Code Standards

- **Language**: TypeScript with strict mode
- **Module System**: ESM with NodeNext resolution
- **Formatting**: Biome (double quotes, semicolons, 2-space indent)
- **Testing**: Vitest
- **Package Manager**: pnpm with workspaces

## Key Technical Concepts

### Storage Architecture

DevAC uses a three-layer storage model:
1. **Package Seeds**: Parquet files in `.devac/seed/` per package
2. **Repository Manifest**: `.devac/manifest.json` aggregates packages
3. **Central Hub**: `~/.devac/central.duckdb` for cross-repo queries

### Data Model

- **Nodes**: Code entities (functions, classes, variables, etc.)
- **Edges**: Relationships (CALLS, IMPORTS, EXTENDS, etc.)
- **External Refs**: Import references to external packages

### Entity IDs

Format: `{repo}:{package_path}:{kind}:{scope_hash}`

Example: `myrepo:packages/api:function:abc123`

## CLI Commands

| Command | Description |
|---------|-------------|
| `devac analyze` | Analyze package and generate seeds |
| `devac query <sql>` | Execute SQL against seeds |
| `devac watch` | Watch for changes and update incrementally |
| `devac validate` | Validate code changes |
| `devac affected <files>` | Find affected files |
| `devac hub init` | Initialize central hub |
| `devac hub register` | Register repository |
| `devac mcp` | Start MCP server |

## MCP Tools

The MCP server provides these tools for AI assistants:
- `find_symbol`: Find symbols by name
- `get_dependencies`: Get symbol dependencies
- `get_dependents`: Get reverse dependencies
- `get_affected`: Find affected files from changes
- `query_sql`: Execute read-only SQL queries

## Development Workflow

1. Make changes in the appropriate package
2. Run `pnpm typecheck` to verify types
3. Run `pnpm test` to run tests
4. Run `pnpm lint` to check formatting
5. Build with `pnpm build`

## Adding New Features

When adding features:
1. Start with @devac/core if it's core functionality
2. Export from the package's `src/index.ts`
3. Add tests alongside the implementation
4. Update CLI commands if user-facing

## Troubleshooting

### DuckDB Issues
- Ensure Node.js 20+ is installed
- Check memory limits in DuckDBPool options
- Seeds are stored in `.devac/seed/` directory

### Build Issues
- Run `pnpm clean && pnpm install` for fresh start
- Check that all .js extensions are in imports
- Verify tsconfig.json settings match NodeNext

## See Also

- `README.md` - Project documentation
- `README-CodeGraph.md` - Tree-sitter patterns from v1
