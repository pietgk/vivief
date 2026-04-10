# ADR 0041: CLI Command Structure (v4.0 Reorganization)

## Status

Accepted

## Context

DevAC CLI had grown to 50+ commands spread across multiple command groups (hub, workspace, architecture, etc.), making it difficult for users to discover and remember commands. Different concepts were scattered across different command names:

**Before (v3.x):**
- `devac analyze` - Analyze packages
- `devac hub init/register/refresh/sync` - Hub operations
- `devac workspace init/status/watch` - Workspace operations
- `devac validate` - Run validation
- `devac watch` - Watch mode
- `devac find-symbol/deps/dependents/affected` - Query operations
- `devac diagnostics` - Show diagnostics
- `devac doctor` - Health checks
- `devac status` - Status info

This led to:
1. Confusion about which command to use for related operations
2. Too many top-level commands to remember
3. Inconsistent mental model (some operations in `hub`, others standalone)

## Decision

Consolidate all commands into three core commands following a simple mental model:

```
devac sync     # Make data fresh (analyze, register, validate)
devac status   # See what's happening (health, diagnostics, doctor)
devac query    # Ask questions (symbol, deps, SQL, etc.)
```

Plus utility commands:
- `devac mcp` - Start MCP server
- `devac workflow` - CI/git integration

### Command Mapping

| Old Command | New Command |
|-------------|-------------|
| `devac analyze` | `devac sync` |
| `devac hub init/register/refresh` | `devac sync` (automatic) |
| `devac hub sync` | `devac sync --ci --issues` |
| `devac workspace init/status` | `devac sync` / `devac status` |
| `devac watch` | `devac sync --watch` |
| `devac validate` | `devac sync --validate` |
| `devac clean` | `devac sync --clean` |
| `devac find-symbol` | `devac query symbol` |
| `devac deps` | `devac query deps` |
| `devac dependents` | `devac query dependents` |
| `devac affected` | `devac query affected` |
| `devac query <sql>` | `devac query sql <sql>` |
| `devac diagnostics` | `devac status --diagnostics` |
| `devac doctor` | `devac status --doctor` |
| `devac verify` | `devac status --seeds --verify` |

### Query Subcommands

The `query` command has 13 subcommands:

```
devac query sql <query>        # Raw SQL
devac query symbol <name>      # Find symbols
devac query deps <entity>      # Dependencies
devac query dependents <entity> # Reverse dependencies
devac query file <path>        # File symbols
devac query call-graph <entity> # Call graph
devac query affected <files>   # Impact analysis
devac query effects            # Code effects
devac query repos              # List repos
devac query c4 [level]         # C4 diagrams
devac query context            # Workspace context
devac query rules              # Rules engine
devac query schema             # Database schema
```

### Status Flags

The `status` command absorbs all status-related operations via flags:

```
devac status                   # Default summary
devac status --brief           # One-liner
devac status --full            # Full details
devac status --diagnostics     # Validation errors
devac status --hub             # Hub health
devac status --seeds           # Seed freshness
devac status --seeds --verify  # Verify integrity
devac status --doctor          # Health checks
devac status --doctor --fix    # Auto-fix issues
devac status --changeset       # Changeset needed?
```

### Sync Flags

The `sync` command handles all data synchronization:

```
devac sync                     # Smart sync based on context
devac sync --validate          # With validation
devac sync --watch             # Continuous mode
devac sync --force             # Force full resync
devac sync --clean             # Remove stale data first
devac sync --ci --issues       # Include GitHub data
devac sync --docs              # Generate documentation
```

## Consequences

### Positive

1. **Simpler Mental Model**: Three verbs to remember (sync, status, query)
2. **Discoverable**: `--help` on each command shows all options
3. **Consistent**: All queries under `query`, all status under `status`
4. **Composable**: Flags can be combined (`--doctor --fix`)

### Negative

1. **Breaking Change**: Old commands no longer work
2. **Learning Curve**: Existing users need to relearn commands
3. **Longer Commands**: Some operations are now longer (e.g., `query symbol` vs `find-symbol`)

### Migration

No backwards compatibility layer was added per decision. Users should:
1. Update scripts to use new commands
2. Check `devac --help` for new command structure
3. Use `devac status` as default entry point

## Related

- ADR-0042: MCP Tool Naming Conventions
- [CLI README](../../packages/devac-cli/README.md)
