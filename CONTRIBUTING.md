# Contributing to DevAC

This guide explains how to set up your development environment and contribute to DevAC.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.15.0
- Git

## Initial Setup

```bash
# Clone the repository
git clone https://github.com/pietgk/vivief.git
cd vivief

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development Workflow

### Local CLI Development

For testing CLI changes locally, link the packages globally:

```bash
# Link all CLI packages for local development
pnpm link --global --filter @pietgk/devac-cli
pnpm link --global --filter @pietgk/devac-mcp
pnpm link --global --filter @pietgk/devac-eval
```

After linking, you can use `devac`, `devac-mcp`, and `devac-eval` commands directly.

### Claude Code Plugin Setup

To use the DevAC workflow commands and skills in Claude Code:

```bash
# Option 1: Launch Claude Code with the plugin directory
claude --plugin-dir ./plugins/devac

# Option 2: Add to your Claude Code settings (~/.claude/settings.json)
{
  "plugins": ["./path/to/vivief/plugins/devac"]
}
```

Once activated, you'll have access to:

**Workflow Commands** (use `/devac:` prefix):
- `/devac:commit` - Full commit workflow with changeset/ADR checks
- `/devac:ship` - Commit, push, and create PR
- `/devac:start-issue` - Start work on a GitHub issue
- `/devac:devac-status` - Query DevAC health status

**Skills** (activate automatically based on your questions):
- Ask "What functions are in this file?" → code-analysis skill
- Ask "What will this change affect?" → impact-analysis skill
- Ask "What needs fixing?" → diagnostics-triage skill

See [plugins/devac/README.md](./plugins/devac/README.md) for the full list of commands and skills.

### Making Changes

1. Make changes in the appropriate package under `packages/`
2. Run type checking: `pnpm typecheck`
3. Run tests: `pnpm test`
4. Run linting: `pnpm lint`
5. Build: `pnpm build`

### Creating a Changeset

All changes to package source code require a changeset:

```bash
pnpm changeset
```

Follow the prompts. Since we use **fixed versioning**, all packages share the same version number and will be bumped together.

### Commit and Push

```bash
git add .
git commit -m "feat(package): description of change"
git push origin your-branch
```

## Package Structure

```
packages/
├── devac-core/      # Core analysis engine (library)
├── devac-cli/       # Command-line interface
├── devac-mcp/       # MCP server for AI assistants
├── devac-worktree/  # Git worktree workflow CLI
└── devac-eval/      # LLM evaluation framework
```

### Dependencies

- `devac-core` is the base library with no internal dependencies
- `devac-cli`, `devac-mcp`, `devac-eval` depend on `devac-core`
- `devac-worktree` is standalone

## Versioning

DevAC uses **fixed versioning** - all packages share the same major.minor version. When any package changes, all packages are bumped to the same version.

See [docs/RELEASING.md](docs/RELEASING.md) for details on the release process.

## Code Standards

- **Language**: TypeScript with strict mode
- **Module System**: ESM with NodeNext resolution
- **Formatting**: Biome (double quotes, semicolons, 2-space indent)
- **Testing**: Vitest

## Getting Help

- Open an issue for bugs or feature requests
- Check existing documentation in `docs/`
