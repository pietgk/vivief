# vivief Development Workflow

> **Version**: 1.0.0
> **Last Updated**: 2025-12-17
> **ADR**: [ADR-0011: Development Workflow](adr/0011-development-workflow.md)

This document describes the development workflow for vivief. For the rationale behind these choices, see ADR-0011.

---

## Table of Contents

1. [Overview](#overview)
2. [Local Quality Gates](#local-quality-gates)
3. [Issue-Driven Development](#issue-driven-development)
4. [Pull Requests](#pull-requests)
5. [Changesets](#changesets)
6. [Architecture Decision Records](#architecture-decision-records)
7. [Release Process](#release-process)
8. [Claude-Assisted Slash Commands](#claude-assisted-slash-commands)
9. [Claude Collaboration](#claude-collaboration)
10. [Quick Reference](#quick-reference)

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

## Local Quality Gates

### Pre-commit Hook

Runs automatically on `git commit`:

```bash
pnpm exec lint-staged
```

This applies Biome formatting and linting to staged files only, ensuring fast feedback.

**What it checks:**
- `*.{ts,tsx,js,jsx}` → `biome check --write`
- `*.{json,md}` → `biome format --write`

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

Use the task template when creating issues:

1. Go to **Issues** → **New Issue** → **Task**
2. Fill in:
   - **Description**: What needs to be done
   - **Acceptance Criteria**: How we know it's complete
   - **Affected Packages**: Which packages are involved
   - **Checklist**: Whether changeset/ADR is needed

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
"@devac/core": minor
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

### ADR Index

See [docs/adr/README.md](adr/README.md) for the full list of architectural decisions.

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
pnpm add @devac/core @devac/cli
```

---

## Claude-Assisted Slash Commands

When working with Claude Code, you can use these slash commands for guided workflows:

### Available Commands

| Command | Purpose |
|---------|---------|
| `/commit` | Full commit flow: draft message, create changeset, check ADR, commit |
| `/prepare-commit` | Same as /commit but stops before committing (review first) |
| `/draft-commit` | Just draft a commit message |
| `/draft-changeset` | Draft and create a changeset file |
| `/draft-adr` | Help create an Architecture Decision Record |
| `/prepare-pr` | Draft PR title and description |
| `/ship` | Full flow: commit → push → draft PR description |

### When to Use Each Command

**For quick commits:**
- `/draft-commit` - Just need a commit message, will handle changeset/ADR yourself

**For standard development:**
- `/commit` - Full guided workflow, executes commit automatically
- `/prepare-commit` - Same guidance but lets you review before committing

**For documentation:**
- `/draft-changeset` - Creating a changelog entry
- `/draft-adr` - Documenting an architectural decision

**For shipping:**
- `/prepare-pr` - Ready to open a PR, need description
- `/ship` - Complete flow from commit to PR

### Example Usage

```
User: /commit

Claude: Let me check your staged changes...

[Analyzes changes, drafts commit message]

Based on the changes, I suggest:

  feat(cli): add watch mode for incremental analysis

This modifies packages/devac-cli/src/. A changeset is needed.
Should I create one? (yes/no)
```

### Command Files Location

The slash commands are defined in `.claude/commands/`:

```
.claude/commands/
├── commit.md
├── prepare-commit.md
├── draft-commit.md
├── draft-changeset.md
├── draft-adr.md
├── prepare-pr.md
└── ship.md
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
| `.husky/pre-commit` | Pre-commit hook script |
| `.husky/pre-push` | Pre-push hook script |
| `.github/ISSUE_TEMPLATE/task.yml` | Issue template |
| `.github/pull_request_template.md` | PR template |
| `.github/workflows/ci.yml` | CI workflow |
| `docs/adr/` | Architecture Decision Records |
| `.changeset/` | Pending changesets |

---

## Document History

| Date | Change |
|------|--------|
| 2025-12-17 | Add Claude-assisted slash commands (/commit, /ship, etc.) |
| 2025-12-17 | Initial implementation - workflow fully operational |
