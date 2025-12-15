# @devac/cli

Command-line interface for DevAC - analyze, query, and manage code graphs from your terminal.

## Installation

```bash
pnpm add @devac/cli
```

Or install globally:

```bash
pnpm add -g @devac/cli
```

## Commands

### analyze

Analyze a package and generate code graph seeds:

```bash
devac analyze /path/to/package

# Force full reanalysis (ignore cached results)
devac analyze /path/to/package --force

# Analyze with custom memory limit
devac analyze /path/to/package --memory 512MB
```

### watch

Watch for file changes and update seeds incrementally:

```bash
devac watch /path/to/package

# Force initial analysis
devac watch /path/to/package --force
```

### affected

Find symbols and files affected by changes:

```bash
# Analyze specific changed files
devac affected /path/to/package --files src/user.ts,src/auth.ts

# Limit dependency depth
devac affected /path/to/package --files src/user.ts --max-depth 5

# Output as JSON
devac affected /path/to/package --files src/user.ts --json
```

### validate

Validate code changes with typecheck, lint, and tests:

```bash
# Quick validation (fast checks only)
devac validate /path/to/package --changed src/user.ts --mode quick

# Full validation
devac validate /path/to/package --changed src/user.ts --mode full

# Skip specific checks
devac validate /path/to/package --changed src/user.ts --skip-lint
```

### mcp

Start the MCP server for AI assistant integration:

```bash
devac mcp start --package /path/to/package

# With custom transport options
devac mcp start --package /path/to/package --transport stdio
```

### Hub Commands

Manage the central hub for multi-package analysis:

```bash
# Initialize a new hub
devac hub init /path/to/hub

# Register a package with the hub
devac hub register /path/to/hub --package /path/to/package

# List registered packages
devac hub list /path/to/hub

# Refresh all package seeds
devac hub refresh /path/to/hub

# Check hub status
devac hub status /path/to/hub

# Unregister a package
devac hub unregister /path/to/hub --package /path/to/package
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
    meta.json           # Schema version and metadata
```

## Programmatic Usage

```typescript
import { analyzeCommand, watchCommand, mcpCommand } from "@devac/cli";

// Analyze a package
const result = await analyzeCommand({
  packagePath: "/path/to/package",
  force: false,
});

// Start watching
const watchResult = await watchCommand({
  packagePath: "/path/to/package",
});

// When done
await watchResult.controller?.stop();
```

## Related Packages

- [@devac/core](../devac-core) - Core analysis library
- [@devac/mcp](../devac-mcp) - MCP server implementation

## Documentation

- [CLI Reference](../../docs/cli-reference.md) - Full command documentation
- [Quick Start](../../docs/quick-start.md) - Getting started guide

## License

MIT
