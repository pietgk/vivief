# ADR 0042: MCP Tool Naming Conventions

## Status

Accepted

## Context

The MCP server exposed tools with inconsistent naming that didn't align with the CLI command structure:

**Before (v3.x):**
- `find_symbol` - Find symbols
- `get_dependencies` - Get dependencies
- `get_dependents` - Get dependents
- `get_file_symbols` - Get file symbols
- `get_affected` - Get affected files
- `get_call_graph` - Get call graph
- `query_sql` - Execute SQL
- `get_schema` - Get schema
- `list_repos` - List repos
- `get_context` - Get context
- `get_workspace_status` - Get workspace status
- `get_validation_errors` - Get validation errors
- etc.

Issues:
1. Mixed naming patterns (`find_`, `get_`, `list_`, `query_`)
2. Didn't match CLI command structure
3. Hard to discover related tools

## Decision

Adopt a `{category}_{action}` naming pattern that aligns with CLI commands:

### Categories

1. **`query_*`** - Tools for querying the code graph (matches `devac query`)
2. **`status_*`** - Tools for status and diagnostics (matches `devac status`)

### Complete Tool List

#### Query Tools (14)

| Tool | CLI Equivalent | Description |
|------|----------------|-------------|
| `query_symbol` | `query symbol` | Find symbols by name |
| `query_deps` | `query deps` | Get dependencies |
| `query_dependents` | `query dependents` | Get reverse dependencies |
| `query_file` | `query file` | Get file symbols |
| `query_affected` | `query affected` | Get affected files |
| `query_call_graph` | `query call-graph` | Get call graph |
| `query_sql` | `query sql` | Execute SQL |
| `query_schema` | `query schema` | Get schema |
| `query_repos` | `query repos` | List repos |
| `query_context` | `query context` | Get context |
| `query_effects` | `query effects` | Query effects |
| `query_rules` | `query rules` | Run rules engine |
| `query_rules_list` | `query rules --list` | List rules |
| `query_c4` | `query c4` | Generate C4 diagrams |

#### Status Tools (7)

| Tool | CLI Equivalent | Description |
|------|----------------|-------------|
| `status` | `status` | Get workspace status |
| `status_diagnostics` | `status --diagnostics` | Get validation errors |
| `status_diagnostics_summary` | `status --diagnostics` | Get error summary |
| `status_diagnostics_counts` | `status --diagnostics` | Get error counts |
| `status_all_diagnostics` | `status --diagnostics` | All diagnostics |
| `status_all_diagnostics_summary` | `status --diagnostics` | All diagnostics summary |
| `status_all_diagnostics_counts` | `status --diagnostics` | All diagnostics counts |

### Naming Rationale

1. **Prefix by category**: Makes tools discoverable in sorted lists
2. **Matches CLI**: AI assistants can map between CLI and MCP easily
3. **Consistent underscores**: MCP convention (not camelCase)
4. **Action-oriented**: Clear what each tool does

### Tool Mapping (Old → New)

| Old Name | New Name |
|----------|----------|
| `find_symbol` | `query_symbol` |
| `get_dependencies` | `query_deps` |
| `get_dependents` | `query_dependents` |
| `get_file_symbols` | `query_file` |
| `get_affected` | `query_affected` |
| `get_call_graph` | `query_call_graph` |
| `get_schema` | `query_schema` |
| `list_repos` | `query_repos` |
| `get_context` | `query_context` |
| `get_workspace_status` | `status` |
| `get_validation_errors` | `status_diagnostics` |
| `get_validation_summary` | `status_diagnostics_summary` |
| `get_validation_counts` | `status_diagnostics_counts` |
| `get_all_diagnostics` | `status_all_diagnostics` |
| `get_diagnostics_summary` | `status_all_diagnostics_summary` |
| `get_diagnostics_counts` | `status_all_diagnostics_counts` |
| `query_effects` | `query_effects` (unchanged) |
| `run_rules` | `query_rules` |
| `list_rules` | `query_rules_list` |
| `generate_c4` | `query_c4` |

## Consequences

### Positive

1. **Discoverable**: Tools grouped by prefix in autocomplete
2. **Consistent**: All tools follow same pattern
3. **CLI Alignment**: Easy to map between CLI and MCP commands
4. **Self-documenting**: Category prefix indicates tool purpose

### Negative

1. **Breaking Change**: AI assistants using old names need updates
2. **Longer Names**: Some tool names are longer

### Migration

MCP clients (Claude Code, etc.) will receive updated tool names automatically when the MCP server is updated. No backwards compatibility layer was added.

## Related

- ADR-0041: CLI Command Structure
- [MCP README](../../packages/devac-mcp/README.md)
