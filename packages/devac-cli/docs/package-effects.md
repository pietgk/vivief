# Package Effects: @pietgk/devac-cli

<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.

  NOTE: The verify command will show many "unmapped" patterns because
  effects extraction currently captures all FunctionCall AST nodes.
  This documentation focuses on architecturally meaningful effects.
-->

## Metadata
- **Package:** @pietgk/devac-cli
- **Last Updated:** 2026-01-01
- **Verified:** partial

## Store Operations
<!-- Pattern → Store effect mapping -->
| Pattern | Store Type | Operation | Provider | Target |
|---------|------------|-----------|----------|--------|
| `fs.writeFile` | filesystem | write | node-fs | config |
| `fs.mkdir` | filesystem | create | node-fs | directories |

## Retrieve Operations
<!-- Pattern → Retrieve effect mapping -->
| Pattern | Retrieve Type | Operation | Provider | Target |
|---------|---------------|-----------|----------|--------|
| `fs.access` | filesystem | check | node-fs | files |
| `fs.readdir` | filesystem | list | node-fs | directories |
| `glob` | filesystem | scan | fast-glob | source-files |

## Database Operations
<!-- DuckDB via devac-core -->
| Pattern | Operation | Provider | Description |
|---------|-----------|----------|-------------|
| `DuckDBPool` | construct | duckdb | Create connection pool |
| `pool.initialize` | connect | duckdb | Initialize connections |
| `pool.shutdown` | disconnect | duckdb | Close all connections |

## Hub Operations
<!-- Central hub federation -->
| Pattern | Operation | Description |
|---------|-----------|-------------|
| `hub.init` | initialize | Connect to central hub |
| `hub.close` | close | Disconnect from hub |
| `createCentralHub` | create | Create new central hub |

## External Calls
<!-- Pattern → Send effect mapping -->
| Pattern | Send Type | Service | Third Party |
|---------|-----------|---------|-------------|
| `child_process.*` | subprocess | shell | false |

## CLI Framework (Not Effects)
<!-- Commander.js patterns - internal framework, not meaningful effects -->
These are captured in extraction but are not architectural effects:
- `program.command`, `option`, `description`, `action` - CLI definition
- `register*Command` - Command registration

## Utility Patterns (Not Effects)
<!-- Common patterns that aren't I/O effects -->
These are high-frequency patterns but don't represent side effects:
- `path.join`, `path.resolve` - Path manipulation
- `console.log`, `console.error` - Logging
- `JSON.stringify`, `JSON.parse` - Serialization
- `Date.now` - Timestamps
- `process.cwd`, `process.exit` - Process operations

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| @pietgk/devac-cli | Container | typescript | vivief | Command-line interface for DevAC code analysis |
| commands | Component | typescript | @pietgk/devac-cli | CLI command implementations |
| hub | Component | typescript | @pietgk/devac-cli | Central hub federation operations |

## Future Improvements

The effects extraction currently captures all FunctionCall AST nodes.
For this documentation to be fully verifiable, the extractor should:

1. Filter out common utility patterns (path.*, JSON.*, console.*)
2. Focus on I/O and side-effect patterns
3. Recognize framework boilerplate (Commander.js, test frameworks)
