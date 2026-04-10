# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

DevAC (vivief) is a federated code analysis system that parses codebases into queryable knowledge graphs using DuckDB + Parquet. It supports TypeScript, Python, and C# with incremental updates, cross-repository federation, and AI integration via MCP.

## Essential Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (Turborepo)
pnpm test             # Run all tests (Vitest)
pnpm typecheck        # Type check all packages
pnpm lint             # Lint (Biome)
pnpm lint:fix         # Lint and auto-fix
pnpm format           # Format (Biome)
pnpm clean            # Clean build artifacts + node_modules
```

### Package-specific commands

```bash
pnpm --filter @pietgk/devac-core build
pnpm --filter @pietgk/devac-core test
pnpm --filter @pietgk/devac-core typecheck
```

### Running a single test file

```bash
pnpm --filter @pietgk/devac-core exec vitest run __tests__/my-test.test.ts
```

### Running tests matching a pattern

```bash
pnpm --filter @pietgk/devac-core exec vitest run -t "pattern"
```

## Package Dependency Graph

```
@pietgk/devac-cli  ────┐
                       ├──> @pietgk/devac-core
@pietgk/devac-mcp  ────┘

@pietgk/devac-worktree  (standalone)
@pietgk/devac-eval      (depends on devac-core)

@pietgk/browser-cli  ────┐
                         ├──> @pietgk/browser-core
@pietgk/browser-mcp  ────┘
```

All publishable packages use **fixed versioning** — they share the same version number and are bumped together via changesets.

## Architecture

### Storage: Three-Layer Model

1. **Package Seeds** — Parquet files in `.devac/seed/` per analyzed package (nodes, edges, external_refs)
2. **Repository Manifest** — `.devac/manifest.json` aggregates packages within a repo
3. **Workspace Hub** — `<workspace>/.devac/central.duckdb` enables cross-repo queries

### Hub Concurrency (Single Writer)

DuckDB only supports one writer. When the MCP server is running, it owns the hub database exclusively. CLI commands automatically communicate via Unix socket IPC (`<workspace>/.devac/mcp.sock`). When MCP is not running, CLI accesses the hub directly. Use `createHubClient()` (not `CentralHub` directly) in CLI code — it handles routing automatically.

### Core Modules (devac-core/src/)

- **parsers/** — Language-specific AST parsing (TypeScript via Babel, Python via tree-sitter, C# via tree-sitter)
- **semantic/** — Compiler-grade resolution (ts-morph for TS, Pyright for Python, Roslyn for C#)
- **storage/** — DuckDB pool, Parquet I/O, seed read/write, Zod schemas as single source of truth for data model
- **analyzer/** — Orchestration of parse → resolve → write pipeline, entity ID generation
- **hub/** — Federation layer, central hub management, IPC
- **validation/** — TypeScript type checking, ESLint/Biome, test, coverage, WCAG accessibility validators
- **rules/** — Pattern matching engine for effects (domain rules, grouping, significance)
- **views/** — C4 architecture diagram generation (PlantUML, LikeC4)
- **effects/** — Hierarchical effect mapping loader
- **workspace/** — Multi-repo workspace discovery and watching
- **queries/** — Shared query layer used by both CLI and MCP

### Data Model

- **Nodes**: Code entities (function, class, interface, variable, type, enum, property, parameter, jsx_component, story)
- **Edges**: Relationships (CALLS, IMPORTS, EXTENDS, IMPLEMENTS, CONTAINS, RETURNS, TYPE_OF)
- **External Refs**: Import references to external packages
- **Entity ID format**: `{repo}:{package_path}:{kind}:{scope_hash}`

## Code Standards

- **TypeScript strict mode**, ESM with NodeNext module resolution
- **Biome** formatting: double quotes, semicolons, 2-space indent, 100 char line width
- **Vitest** for all testing; tests live in `__tests__/*.test.ts` within each package
- All `.js` extensions required in imports (NodeNext)

## Commit and Changeset Rules

- **Commit message format**: `type(scope): description` — types: feat, fix, docs, refactor, perf, test, chore
- **All source changes require a changeset**: run `pnpm changeset` before committing
- **Never use `--no-verify`** to bypass git hooks
- Pre-commit hook runs `lint-staged` (Biome check on staged files)
- Pre-push hook runs `pnpm typecheck` + tests for all packages (excluding performance tests)

## Validation Hooks (Claude Code / AI sessions)

DevAC has automatic validation hooks in Claude Code sessions:
- **UserPromptSubmit**: `devac status --inject` injects diagnostic counts into context when errors exist
- **Stop**: `devac validate --on-stop --mode quick` validates changed files (~5s, TypeScript + ESLint)

You don't need to manually run validation in those environments — the hooks handle it.

## Critical Safety Rules

- **Never use `sed -i ''` on `.git/config` on macOS** — BSD sed can empty the file. Always use `git config` commands instead.
- **Never overwrite plan files without reading them first** — they may contain hours of research.

## Adding New Features

1. Start in `@pietgk/devac-core` if it's core functionality
2. Export from the package's `src/index.ts`
3. Add tests alongside the implementation
4. Update CLI commands if user-facing

## Troubleshooting

- **DuckDB issues**: Requires Node.js 20+. Check memory limits in DuckDBPool options. Seeds stored in `.devac/seed/`.
- **Build issues**: `pnpm clean && pnpm install` for a fresh start. Ensure all imports use `.js` extensions. Verify tsconfig matches NodeNext.
- **Orphaned vitest processes**: `pnpm clean:orphaned-vitest`
