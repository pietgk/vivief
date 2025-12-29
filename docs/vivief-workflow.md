# vivief Development Workflow

> **Version**: 1.4.0
> **Last Updated**: 2025-12-29
> **ADRs**: [ADR-0011: Development Workflow](adr/0011-development-workflow.md), [ADR-0012: Claude-Assisted Slash Commands](adr/0012-claude-assisted-slash-commands.md)

This document describes the development workflow for vivief. For the rationale behind these choices, see ADR-0011.

---

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Model](#conceptual-model)
3. [Local Quality Gates](#local-quality-gates)
4. [Issue-Driven Development](#issue-driven-development)
5. [Pull Requests](#pull-requests)
6. [Changesets](#changesets)
7. [Architecture Decision Records](#architecture-decision-records)
8. [Release Process](#release-process)
9. [Claude-Assisted Slash Commands](#claude-assisted-slash-commands)
10. [Skills (Auto-Invoked)](#skills-auto-invoked)
11. [Claude Collaboration](#claude-collaboration)
12. [Multi-Repo Development](#multi-repo-development)
13. [Quick Reference](#quick-reference)

---

## Overview

vivief uses an issue-driven development workflow with automated quality gates:

```
Issue → Branch → Implement → PR → Merge → Release
```

Every meaningful change should include:
- Code changes
- Changeset (if user-facing)
- ADR (if architectural decision)

---

## Conceptual Model

DevAC provides a layered architecture where Claude and humans can interact through different interfaces, all sharing the same underlying implementation.

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER / LLM INTERFACE                          │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌──────────────────┐   ┌────────────────┐
│ Slash Commands  │  │     Skills       │   │  Direct Use    │
│ (Workflows)     │  │ (Auto-Invoked)   │   │  (Scripting)   │
├─────────────────┤  ├──────────────────┤   ├────────────────┤
│ /devac:commit   │  │ code-analysis    │   │ Terminal/CI    │
│ /devac:ship     │  │ impact-analysis  │   │ Bash scripts   │
│ /devac:start-.. │  │ diagnostics      │   │ pnpm scripts   │
└─────────────────┘  └────────────────┬─┘   └────────────────┘
         │                    │       │              │
         │                    │       │              │
         └────────────────────┴───────┴──────────────┘
                              │
                              ▼
┌──────────────────────────────────────────┬─────────────────────┐
│      CLI (devac, devac-worktree)         │   MCP (devac-mcp)   │
│  Preferred - low context overhead        │  Alternative access │
│  devac analyze | devac query | etc.      │  AI tool protocol   │
└──────────────────────────────────────────┴─────────────────────┘
         │                                          │
         │  (direct import)            (direct import)
         │                                          │
         └────────────────────┬─────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    SHARED CORE (devac-core)                     │
│   Storage, Parsers, DuckDB/Parquet, Query Engine, Analysis     │
└────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **CLI and MCP are peer implementations** - Both import from `devac-core` directly and behave identically
2. **CLI is the preferred access method** - Lower context overhead, works without MCP server running
3. **Skills/Commands use CLI directly** - They invoke `devac` commands via Bash, not MCP tools
4. **MCP is an alternative** - Useful when already configured, but not required for Claude workflows

### When to Use What

| Layer | Invoked By | Use When | Context Cost |
|-------|-----------|----------|--------------|
| **CLI** | Bash, scripts, skills | All DevAC operations | Low |
| **MCP** | AI tool calls | When MCP server configured | Higher |
| **Commands** | `/command` | Guided workflows with LLM reasoning | N/A |
| **Skills** | Auto by LLM | Context-aware answers to questions | N/A |

### Why CLI Over MCP?

- **No server required**: Skills work even when MCP server isn't running
- **Lower context**: CLI output is more compact than MCP tool responses
- **Same behavior**: Both use devac-core, so results are identical
- **Better for automation**: Scripts and CI can use CLI directly

---

## Local Quality Gates

### Pre-commit Hook

Runs automatically on `git commit`:

```bash
pnpm exec lint-staged
```

This applies Biome formatting and linting to staged files only, ensuring fast feedback.

**What it checks:**
- `*.{ts,tsx,js,jsx}` → `biome check --write`
- `*.json` → `biome format --write`

### Commit Message Hook

Runs automatically on `git commit` (after message is entered):

```bash
# Validates conventional commit format
pattern="^(feat|fix|docs|refactor|perf|test|chore)(\(.+\))?: .+"
```

**What it enforces:**
- Message must start with valid type
- Optional scope in parentheses
- Colon and space before description
- Non-empty description

**Valid examples:**
```
feat(cli): add watch mode
fix: resolve memory leak
docs: update README
```

**Invalid examples:**
```
added new feature     # Missing type
feat:                 # Empty description
Fix bug               # Wrong capitalization
```

### Pre-push Hook

Runs automatically on `git push`:

```bash
pnpm typecheck
pnpm test
```

This runs the full TypeScript validation and test suite before code reaches the remote.

### Bypassing Hooks (Emergency Only)

```bash
git commit --no-verify  # Skip pre-commit
git push --no-verify    # Skip pre-push
```

Use sparingly - CI will still enforce these checks.

---

## Issue-Driven Development

### Creating Issues

There are three ways to create issues:

#### Option 1: GitHub UI (for humans)

1. Go to **Issues** → **New Issue** → **Task**
2. Fill in:
   - **Description**: What needs to be done
   - **Context**: Current state and why this is needed
   - **Acceptance Criteria**: How we know it's complete
   - **Affected Packages**: Which packages are involved
   - **Constraints**: Changeset/ADR requirements
   - **Open Questions**: Any clarifications needed

#### Option 2: `/devac:issue` command (Claude-assisted)

Use the `/devac:issue` slash command for guided issue creation:

```
User: /devac:issue

Claude: I'll help you create a GitHub issue. Let me ask about:
- What needs to be done
- Why it's needed
- Acceptance criteria
- Affected packages
- Any constraints or questions

[Interactive gathering and issue creation via gh CLI]
```

This creates properly formatted issues directly via `gh issue create`.

#### Option 3: `/devac:start-issue` command (start from existing)

If an issue already exists, use `/devac:start-issue` to begin work:

```
User: /devac:start-issue #42

Claude: Fetching issue #42...
[Presents summary, creates branch, proposes implementation plan]
```

This fetches the issue, creates a branch, and enters plan mode.

### Branch Naming

```
{issue-number}-{short-description}

Examples:
  42-add-python-parser
  15-fix-duckdb-memory-leak
  7-changelog-automation
```

### Commit Messages

Use conventional commits:

```
type(scope): description

Types:
  feat     - New feature
  fix      - Bug fix
  docs     - Documentation only
  refactor - Code change without feature/fix
  perf     - Performance improvement
  test     - Adding tests
  chore    - Maintenance tasks

Examples:
  feat(core): add Python AST parser
  fix(cli): handle empty package.json gracefully
  docs: update MCP server documentation
```

---

## Pull Requests

### PR Template

When creating a PR, a template will appear with:

- **Description**: What the PR does
- **Related Issue**: Links to the issue
- **Type of Change**: Bug fix, feature, breaking change, etc.
- **Checklist**: Code standards, tests, changesets, documentation

### CI Checks

PRs trigger these automated checks:

| Check | Description |
|-------|-------------|
| `build` | Lint, typecheck, build, test |
| `changeset-check` | Verifies changeset exists for package changes |

### Changeset Enforcement

If your PR modifies files in `packages/*/src/`:
- CI will check for a `.changeset/*.md` file
- If missing, the check fails with instructions
- Add a changeset with `pnpm changeset`

---

## Changesets

### When to Create a Changeset

| Scenario | Changeset? | Type |
|----------|------------|------|
| New user-facing feature | Yes | `minor` |
| Bug fix | Yes | `patch` |
| Breaking API change | Yes | `major` |
| Internal refactor | No | - |
| Documentation only | No | - |
| Dev dependency update | No | - |
| Test additions | No | - |

### Creating a Changeset

```bash
pnpm changeset
```

This will:
1. Ask which packages changed
2. Ask the bump type (major/minor/patch)
3. Ask for a description
4. Create a file in `.changeset/`

### Good Changeset Example

```markdown
---
"@pietgk/devac-core": minor
---

Add Python AST parser with support for function definitions, class declarations, 
and import statements. Enables cross-language analysis in polyglot repositories.
```

---

## Architecture Decision Records

### When to Create an ADR

| Decision Type | ADR? |
|--------------|------|
| Choice of database/storage | Yes |
| Package structure decision | Yes |
| API design pattern | Yes |
| Major dependency choice | Yes |
| Algorithm selection (non-trivial) | Yes |
| Bug fix approach | No |
| Code style preference | No |
| Minor refactoring | No |

### Creating an ADR

1. Copy the template:
   ```bash
   cp docs/adr/template.md docs/adr/NNNN-title-with-dashes.md
   ```

2. Fill in all sections:
   - **Status**: Proposed → Accepted
   - **Context**: Why this decision is needed
   - **Decision**: What we're doing
   - **Consequences**: Positive, negative, neutral

3. Update `docs/adr/README.md` with the new entry

4. Include in your PR

### Current ADRs

There are currently **12 ADRs** documenting architectural decisions. Key workflow-related ADRs:
- **[ADR-0011](adr/0011-development-workflow.md)**: Development Workflow - documents the quality gate system
- **[ADR-0012](adr/0012-claude-assisted-slash-commands.md)**: Claude-Assisted Slash Commands - documents the slash command system

See [docs/adr/README.md](adr/README.md) for the full list.

---

## Release Process

### Publishing to GitHub Packages

vivief packages are published to GitHub Packages (not npm).

### Version and Release

```bash
# Apply changesets and bump versions
pnpm changeset version

# Review CHANGELOG.md updates
git diff

# Commit version changes
git add .
git commit -m "chore: version packages"
git push

# Build and publish
pnpm release
```

### Consuming Packages

Users can install from GitHub Packages:

```bash
# Configure npm/pnpm to use GitHub Packages for @devac scope
echo "@devac:registry=https://npm.pkg.github.com" >> .npmrc

# Install
pnpm add @pietgk/devac-core @pietgk/devac-cli
```

---

## Claude-Assisted Slash Commands

When working with Claude Code, you can use these slash commands for guided workflows. Commands are provided by the DevAC plugin and use the `devac:` namespace.

### Available Commands

| Command | Purpose |
|---------|---------|
| `/devac:issue` | Create a new GitHub issue with Claude assistance |
| `/devac:start-issue` | Start work on an existing issue (fetch, branch, plan) |
| `/devac:start-issue-on-new-worktree` | Start issue in an isolated git worktree |
| `/devac:commit` | Full commit flow: draft message, create changeset, check ADR, commit |
| `/devac:prepare-commit` | Same as /commit but stops before committing (review first) |
| `/devac:draft-commit` | Just draft a commit message |
| `/devac:draft-changeset` | Draft and create a changeset file |
| `/devac:draft-adr` | Help create an Architecture Decision Record |
| `/devac:prepare-pr` | Draft PR title and description |
| `/devac:ship` | Full flow: commit → push → draft PR description |
| `/devac:devac-status` | Query DevAC Four Pillars and Analytics Layer status |

### When to Use Each Command

**For issue management:**
- `/devac:issue` - Create a new issue with guided prompts
- `/devac:start-issue` - Begin work on an existing issue (fetches, branches, plans)
- `/devac:start-issue-on-new-worktree` - Same as /devac:start-issue but in an isolated git worktree

**For quick commits:**
- `/devac:draft-commit` - Just need a commit message, will handle changeset/ADR yourself

**For standard development:**
- `/devac:commit` - Full guided workflow, executes commit automatically
- `/devac:prepare-commit` - Same guidance but lets you review before committing

**For documentation:**
- `/devac:draft-changeset` - Creating a changelog entry
- `/devac:draft-adr` - Documenting an architectural decision

**For shipping:**
- `/devac:prepare-pr` - Ready to open a PR, need description
- `/devac:ship` - Complete flow from commit to PR

**For status checks:**
- `/devac:devac-status` - Check DevAC health across all Four Pillars

### Example Usage

```
User: /devac:commit

Claude: Let me check your staged changes...

[Analyzes changes, drafts commit message]

Based on the changes, I suggest:

  feat(cli): add watch mode for incremental analysis

This modifies packages/devac-cli/src/. A changeset is needed.
Should I create one? (yes/no)
```

### Command Files Location

The slash commands are defined in the DevAC plugin at `plugins/devac/commands/`:

```
plugins/devac/commands/
├── issue.md
├── start-issue.md
├── start-issue-on-new-worktree.md
├── commit.md
├── prepare-commit.md
├── draft-commit.md
├── draft-changeset.md
├── draft-adr.md
├── prepare-pr.md
├── ship.md
└── devac-status.md
```

**Command Namespace**: Plugin commands use the `devac:` namespace prefix (e.g., `/devac:commit`). This is the standard Claude Code plugin approach - commands from plugins are namespaced by plugin name to avoid conflicts.

---

## Skills (Auto-Invoked)

Skills are Claude Code capabilities that activate automatically based on your conversation. Unlike slash commands, you don't invoke them directly - Claude recognizes when they're relevant and uses them.

### Available Skills

| Skill | Triggers | Purpose |
|-------|----------|---------|
| code-analysis | "analyze code", "find functions", "show hierarchy" | Analyze code structure and find symbols |
| impact-analysis | "what will this affect", "dependencies", "call graph" | Determine change impact and blast radius |
| codebase-navigation | "find where", "locate definition", "navigate to" | Navigate and explore the codebase |
| diagnostics-triage | "what needs fixing", "show errors", "triage issues" | Triage diagnostics by priority |
| multi-repo-context | "cross-repo", "all repos", "workspace status" | Work across multiple repositories |

### How Skills Work

Skills use CLI commands via Bash to query DevAC:

```bash
# Code analysis
devac find-symbol UserService
devac file-symbols src/auth/

# Impact analysis
devac affected src/core/auth.ts
devac deps src/services/user.ts

# Diagnostics
devac hub diagnostics
devac hub diagnostics --severity error

# Multi-repo
devac hub status
devac hub repos
```

### Skills vs Commands

| Aspect | Skills | Commands |
|--------|--------|----------|
| Invocation | Automatic by Claude | Explicit `/command` |
| Purpose | Answer questions | Execute workflows |
| Interaction | Single response | Multi-step dialogue |
| Example | "What calls this function?" | `/commit` |

### Skill Files Location

Skills are defined in the DevAC plugin at `plugins/devac/skills/`:

```
plugins/devac/skills/
├── code-analysis/SKILL.md
├── impact-analysis/SKILL.md
├── codebase-navigation/SKILL.md
├── diagnostics-triage/SKILL.md
└── multi-repo-context/SKILL.md
```

---

## Claude Collaboration

### Workflow with Claude

```
┌─────────────────────────────────────────────────────────────┐
│  1. CREATE ISSUE                                            │
│     - Describe the task with context                        │
│     - Tag with changeset/ADR requirements                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PLAN WITH CLAUDE                                        │
│     - Share issue description                               │
│     - Claude proposes implementation approach               │
│     - Identify if ADR is needed                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. IMPLEMENT                                               │
│     - Create branch: {issue-number}-{description}           │
│     - Claude helps write/review code                        │
│     - Local hooks validate on commit/push                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. DOCUMENT                                                │
│     - Create changeset: pnpm changeset                      │
│     - Create ADR if needed                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. MERGE                                                   │
│     - Push branch, create PR                                │
│     - CI validates                                          │
│     - Squash merge to main                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Prompt Pattern for Claude

When starting a task:

```markdown
## Task: [Issue Title]
Issue: #{number}

## Context
[Relevant details about what exists and what's needed]

## Constraints
- Changeset required: yes/no
- ADR consideration: yes/no/maybe
- Breaking change allowed: yes/no

## Questions
1. [Specific questions about approach]
```

### Claude Response Pattern

Claude should structure responses as:

```markdown
## Plan
[High-level approach]

## Implementation
[Code changes with explanations]

## Changeset Draft (if needed)
[Changeset content]

## ADR Consideration
[Draft ADR or explanation of why not needed]

## Verification
- [ ] Tests pass
- [ ] Types check
- [ ] Lint passes
```

---

## Multi-Repo Development

When working on issues that span multiple repositories, use `devac-worktree` and `devac context` commands for a streamlined workflow.

### Complete Multi-Repo Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. START ISSUE                                                  │
│  ─────────────────                                               │
│  devac-worktree start 123 --repos api,web                        │
│  → Creates api-123-feature/ and web-123-feature/                 │
│  → Claude launches in parent directory                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. WORK (Claude works across repos)                             │
│  ─────────────────────────────────────                           │
│  Claude can edit files in both worktrees:                        │
│    api-123-feature/src/auth/handler.ts                           │
│    web-123-feature/src/hooks/useAuth.ts                          │
│                                                                  │
│  Run commands from parent dir:                                   │
│    git -C api-123-feature status                                 │
│    npm --prefix web-123-feature test                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. CHECK CI STATUS                                              │
│  ──────────────────                                              │
│  devac context ci                                                │
│  → Shows PR status for all repos:                                │
│    api-123-feature: PR #45 ✓ passing                             │
│    web-123-feature: PR #46 ⏳ pending                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. REVIEW CHANGES                                               │
│  ────────────────                                                │
│  devac context review                                            │
│  → Gathers diffs from all repos                                  │
│  → Generates LLM review prompt                                   │
│  → Copy prompt to Claude for review                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. CREATE CHANGESETS                                            │
│  ────────────────────                                            │
│  cd api-123-feature && pnpm changeset                            │
│  cd web-123-feature && pnpm changeset                            │
│  → Create changeset in each repo with changes                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. COMMIT & PUSH                                                │
│  ───────────────                                                 │
│  git -C api-123-feature add . && git -C api-123-feature commit   │
│  git -C api-123-feature push                                     │
│  (repeat for each repo)                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. CLEANUP (after PRs merged)                                   │
│  ──────────                                                      │
│  devac-worktree clean 123                                        │
│  → Checks all PRs are merged                                     │
│  → Cleans all worktrees for issue #123                           │
└─────────────────────────────────────────────────────────────────┘
```

### When to Use Multi-Repo Workflow

| Scenario | Approach |
|----------|----------|
| Change in one repo only | Standard single-repo workflow |
| Change spans 2+ repos | Use `--repos` from parent directory |
| Starting in a repo, need to add another | Use `--also` from inside the repo |
| Coordinated release across repos | Create changesets in each repo |

### Choosing --also vs --repos

**Use `--also`** when:
- You're already inside a git repository
- You want to add worktrees to sibling repos incrementally
- Example: `devac-worktree start 123 --also web`

**Use `--repos`** when:
- You're in a parent directory (not inside any repo)
- You want to create all worktrees at once
- You want Claude to work across all repos in a single session
- Example: `devac-worktree start 123 --repos api,web,shared`

### Parent Directory Commands

When Claude runs from the parent directory, use these patterns:

```bash
# Git operations
git -C api-123-feature status
git -C api-123-feature add . && git -C api-123-feature commit -m "feat: add auth"

# npm/pnpm operations
npm --prefix api-123-feature test
npm --prefix api-123-feature run build
pnpm --filter ./api-123-feature test

# Check context
devac context              # Show all repos and worktrees
devac context ci           # CI status for all PRs
devac context review       # Generate review prompt
```

### ADR Considerations for Multi-Repo Changes

When making changes that affect multiple repositories:
- Consider if an ADR is needed to document the cross-repo architecture decision
- Update ADR-0014 if the worktree workflow itself changes
- Create repo-specific ADRs for significant changes in each repo

### See Also

- [devac-worktree Reference](./devac-worktree.md) - Full command reference
- [CLI Reference - Context Commands](./cli-reference.md#context-commands) - devac context commands
- [ADR-0014](./adr/0014-worktree-claude-workflow.md) - Worktree workflow architecture

---

## Quick Reference

### Daily Development

```bash
# Start work on issue #42
git checkout -b 42-add-feature
git push -u origin 42-add-feature

# Make changes, commit (pre-commit hook runs automatically)
git add .
git commit -m "feat(core): add awesome feature"

# Create changeset if needed
pnpm changeset

# Push (pre-push hook runs typecheck + tests)
git push

# Create PR on GitHub
```

### Manual Checks

```bash
pnpm lint          # Run Biome linting
pnpm lint:fix      # Auto-fix lint issues
pnpm typecheck     # TypeScript validation
pnpm test          # Run all tests
pnpm build         # Build all packages
```

### Release

```bash
pnpm changeset version  # Apply changesets, bump versions
git add . && git commit -m "chore: version packages"
git push
pnpm release            # Build and publish
```

### Useful Paths

| Path | Description |
|------|-------------|
| `.husky/pre-commit` | Pre-commit hook (lint-staged) |
| `.husky/commit-msg` | Commit message validation hook |
| `.husky/pre-push` | Pre-push hook (typecheck + test) |
| `.github/ISSUE_TEMPLATE/task.yml` | Issue template |
| `.github/pull_request_template.md` | PR template |
| `.github/workflows/ci.yml` | CI workflow |
| `plugins/devac/commands/` | Claude slash commands (source) |
| `plugins/devac/skills/` | Claude skills (auto-invoked) |
| `docs/adr/` | Architecture Decision Records |
| `.changeset/` | Pending changesets |

---

## Document History

| Date | Version | Change |
|------|---------|--------|
| 2025-12-29 | 1.4.0 | Add Conceptual Model, complete slash commands table, add Skills section |
| 2025-12-19 | 1.3.0 | Add multi-repo development section with devac-worktree and devac context |
| 2025-12-17 | 1.2.0 | Add /issue and /start-issue commands, expand issue creation docs |
| 2025-12-17 | 1.1.0 | Add commit-msg hook docs, fix lint-staged config, update ADR references |
| 2025-12-17 | 1.0.0 | Add Claude-assisted slash commands (/commit, /ship, etc.) |
| 2025-12-17 | 1.0.0 | Initial implementation - workflow fully operational |
