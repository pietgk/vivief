---
topic: devac-domain
status: canonical
depends-on: [vivief-identity]
human-version: ../fact/devac/overview.md
last-verified: 2026-03-30
---

## DevAC — Developer Analytics Centre

DevAC is the first and most implemented vivief domain. It provides fast, local code
graph storage using DuckDB + Parquet with multi-language support (TypeScript, Python,
C#), incremental updates, and cross-repository federation.

### Capabilities

| Area | What It Does |
|------|-------------|
| **Code Analysis** | Tree-sitter parsing to nodes, edges, external refs, effects |
| **Validation** | Pipeline: tsc, ESLint/Biome, test, coverage, LLM, WCAG/Axe a11y |
| **Workflow** | Issue-driven worktrees, PR flow via `devac-worktree` |
| **MCP Server** | 21 tools for AI assistants (query, status, diagnostics) |
| **Browser** | Playwright automation, Storybook accessibility scanning |
| **Federation** | Cross-repo queries via workspace hub (DuckDB central) |

### Package Map

```
devac-core       Core engine: DuckDB, parsers, storage, datom migration
devac-cli        CLI: sync, status, query commands
devac-mcp        MCP server: 21 tools for AI assistants
devac-worktree   Git worktree + Claude workflow for GitHub issues
browser-core     Playwright wrapper, AxeScanner, element refs
browser-cli      CLI for browser automation
browser-mcp      MCP server for browser automation
```

### Storage Architecture (Current)

Three-layer model being migrated to datom model:

1. **Package Seeds** — Parquet files in `.devac/seed/` per package
2. **Repository Manifest** — `.devac/manifest.json` aggregates packages
3. **Workspace Hub** — `<workspace>/.devac/central.duckdb` for cross-repo queries

Hub uses Single Writer Architecture: when MCP is running, it owns the hub exclusively;
CLI commands communicate via Unix socket IPC (`<workspace>/.devac/mcp.sock`).

### Data Model Migration

Current model (nodes + edges + effects + external_refs as separate tables) is being
migrated to the datom model where everything is `[E, A, V, Tx, Op]` tuples:

- A function node becomes datoms: `[entity, "kind", "function", tx, true]`,
  `[entity, "name", "handleRequest", tx, true]`, `[entity, "file", "src/api.ts", tx, true]`
- An edge becomes: `[entity, "calls", target_entity, tx, true]`
- Effects become: `[entity, "effect:db_write", "users_table", tx, true]`

Implementation in progress at `packages/devac-core/src/datom/`.

### Maturity

- 50+ Architecture Decision Records (ADRs)
- 849 tests across all packages
- 21 MCP tools in production use
- Full implementation docs in `fact/devac/`

### Why DevAC Is First

DevAC makes the platform's own development queryable and deterministic. The platform
bootstraps through its developer analytics domain — vivief creates itself using its
own concepts, and DevAC is the domain that makes that self-creation observable.
