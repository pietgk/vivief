# ADR-0014: Git Worktree + Claude CLI Workflow

## Status

Accepted (Extended 2025-01 with context discovery, multi-repo support, CI/review integration, workspace-aware issue IDs)

## Context

When working on multiple GitHub issues simultaneously with Claude CLI, developers face a workflow friction:

1. **Claude CLI cwd sandboxing**: The Claude CLI is sandboxed to its starting directory and cannot follow when a user creates a new git worktree via `git worktree add` or `cd` into a different directory.

2. **Manual worktree management**: Creating worktrees for each issue requires repetitive steps:
   - Fetch issue details from GitHub
   - Create appropriately named branch
   - Create worktree in consistent location
   - Install dependencies
   - Start new Claude CLI session
   - Remember to clean up after PR is merged

3. **Context loss**: When starting a new Claude session in a worktree, the issue context (title, description, labels) must be manually provided again.

4. **Cleanup burden**: After merging PRs, worktrees and branches accumulate and need manual cleanup.

## Decision

Create a new `devac-worktree` CLI package that automates the git worktree + Claude CLI workflow:

### Package Structure

- **Standalone package**: `packages/devac-worktree` with no dependency on `devac-core`
- **Single binary**: `devac-worktree` command
- **External dependencies**: `gh` CLI (GitHub), `git`, `claude` CLI

### Commands

| Command | Purpose |
|---------|---------|
| `start <issue>` | Create worktree, install deps, write context, launch Claude |
| `list` | List active worktrees |
| `status` | Show worktrees with issue/PR state |
| `resume <issue>` | Resume work on existing worktree |
| `clean <issue>` | Remove worktree after PR merged |
| `clean-merged` | Clean all worktrees with merged PRs |

### Issue ID Format (Extended)

The `<issue>` parameter requires the full issue ID format:

```
gh<repoDirectoryName>-<issueNumber>
```

- `gh` = GitHub source prefix
- `repoDirectoryName` = repository DIRECTORY name (the folder name, NOT org/repo)
- `issueNumber` = issue number

**Examples:**
- `ghvivief-123` → repo directory "vivief", issue #123
- `ghapi-42` → repo directory "api", issue #42
- `ghmonorepo-3.0-99` → repo directory "monorepo-3.0", issue #99

This format enables workspace-aware operation - the CLI can be run from anywhere in the workspace and will:
1. Find the workspace root (directory containing `.devac/` or multiple repos)
2. Locate the target repository by name
3. Get GitHub owner/repo from the git remote
4. Fetch issue details using the resolved owner/repo
5. Create the worktree in the workspace

**Note:** Non-`gh` inputs are assumed to be Jira format (support coming soon).

### State Management

- **State file**: `~/.devac/worktrees.json` tracks active worktrees
- **Issue context**: `~/.devac/issue-context.md` provides context to Claude
- **Worktree location**: `../<repo>-<issue>` sibling directories

### Workflow

**From anywhere in workspace:**
```
devac-worktree start ghvivief-42
  ├── Find workspace root
  ├── Locate 'vivief' repo in workspace
  ├── Get GitHub owner/repo from git remote
  ├── Fetch issue #42 from GitHub (pietgk/vivief)
  ├── Create branch: 42-fix-login-bug
  ├── Create worktree: ~/ws/vivief-42-fix-login-bug/
  ├── Install dependencies (pnpm/npm/yarn)
  ├── Write issue context to ~/.devac/issue-context.md
  └── Launch claude CLI in worktree

# ... developer works with Claude ...

devac-worktree clean ghvivief-42
  ├── Verify PR is merged
  ├── Remove worktree
  └── Delete branch
```

### Context Discovery (Extended)

The context discovery system uses **convention-based detection** instead of JSON state files:

**Worktree Naming Convention:**
```
{repo}-{issue#}-{slug}
Examples:
  api-123-auth        → repo: api, issue: 123, slug: auth
  web-45-fix-login    → repo: web, issue: 45, slug: fix-login
```

**Discovery Algorithm:**
1. Check if current directory is a git repo or parent directory
2. Scan sibling directories for git repositories
3. Parse directory names to identify worktrees vs main repos
4. Group worktrees by issue number
5. Match worktrees to their main repositories

**Why Convention-Based:**
- No state files to get out of sync
- Works even if worktrees were created manually
- Self-describing directory structure
- No migration needed for existing worktrees

### Multi-Repo Workflows (Extended)

Two modes for working across repositories:

**`--also` Flag (Sibling Mode):**
```bash
# Add worktrees in sibling repos
devac-worktree start ghapi-123 --also web --also shared
```
- Creates worktrees in sibling directories
- Claude launches in current repo's worktree

**`--repos` Flag (Parent Directory Mode):**
```bash
# From parent directory, create worktrees in multiple repos
cd ~/projects
devac-worktree start ghapi-123 --repos api,web,shared
```
- Use when in a parent directory containing repos
- Creates worktrees for all specified repos
- Claude launches in parent directory (can see all repos)

**Decision Rationale:**
- Parent directory workflow enables single Claude session for cross-repo work
- `--also` is additive (can be used multiple times)
- `--repos` is explicit (full list required)

### CI Integration (Extended)

The `devac context ci` command checks CI status across all issue worktrees:

```bash
devac context ci
# Shows CI status for all PRs associated with current issue
```

**Implementation:**
- Uses `gh pr view` and `gh pr checks` for PR status
- Groups by repository when in issue worktree
- Shows passing/failing/pending with check details

### Review Integration (Extended)

The `devac context review` command generates LLM review prompts:

```bash
devac context review --focus security
# Generates review prompt with diffs from all issue worktrees
```

**Features:**
- Gathers diffs from all worktrees for the issue
- Supports focus areas: security, performance, tests, all
- Formats output for copy/paste to LLMs
- Includes context about file changes and patterns

### MCP Context Caching (Extended)

The MCP server provides a `get_context` tool with intelligent caching:

**Caching Strategy:**
- In-memory cache keyed by path
- Default TTL: 30 seconds
- Force refresh via `refresh: true` parameter
- Automatic invalidation on significant time passage

**Rationale:**
- Context discovery involves filesystem operations
- Repeated calls during conversation benefit from caching
- Short TTL ensures freshness for active development
- Force refresh allows explicit cache busting

### Integration Points

- **GitHub CLI**: All GitHub operations via `gh` command
- **Claude CLI**: Launched as child process in worktree directory
- **Package managers**: Auto-detect pnpm/npm/yarn from lockfiles

## Consequences

### Positive

- Single command to start working on any issue
- Automatic context handoff to Claude sessions
- Consistent worktree naming and location
- Easy cleanup of completed work
- No manual branch/worktree management
- Works with any repository (not tied to devac-core)
- **Multi-repo support**: Work on issues spanning multiple repositories
- **Convention-based discovery**: No state files to get out of sync
- **CI visibility**: Check PR status across all repos in one command
- **Review automation**: Generate LLM review prompts for cross-repo changes
- **MCP integration**: AI assistants can discover context automatically
- **Workspace-aware**: Full issue ID format (`ghrepo-123`) works from anywhere in workspace

### Negative

- Requires `gh` CLI to be installed and authenticated
- Requires `claude` CLI to be installed
- Additional package to maintain
- Convention-based naming is required for automatic discovery

### Neutral

- Worktrees created as sibling directories (not inside repo)
- State synced with actual git worktrees on each command
- Context file is global (one issue at a time focus)
- MCP context caching with 30-second TTL
- Parent directory workflow requires leaving the repo context

## References

- GitHub Issue (original): https://github.com/pietgk/vivief/issues/12
- GitHub Issue (context discovery): https://github.com/pietgk/vivief/issues/19
- GitHub Issue (workspace-aware issue IDs): https://github.com/pietgk/vivief/issues/39
- Git worktrees: https://git-scm.com/docs/git-worktree
- GitHub CLI: https://cli.github.com/
- Claude CLI: https://claude.ai/cli
- [vivief Workflow Guide](../vivief-workflow.md) - Complete workflow documentation
- [devac-worktree Reference](./devac-worktree.md)
- [CLI Reference - Context Commands](./cli-reference.md#context-commands)
