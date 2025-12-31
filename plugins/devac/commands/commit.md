# /devac:commit - Full Commit Workflow

You are helping the user commit their staged changes following the vivief development workflow.

## Workflow Overview

This workflow uses deterministic CLI commands for validation and structured data, while you handle reasoning and drafting.

## Steps

### 1. Run pre-commit validation

```bash
devac workflow pre-commit --json
```

This returns:
- `ready`: Whether ready to commit (no blockers)
- `staged`: List of staged files
- `blockers`: Any blocking issues
- `validation.lint.passed`: Lint status
- `validation.types.passed`: Typecheck status
- `sensitiveFiles`: Any sensitive files detected
- `warnings`: Non-blocking issues

**If not ready**: Present blockers to user and ask how to proceed.

**If no staged files**: Ask if user wants to stage all changes with `git add -A`.

### 2. Get diff summary for context

```bash
devac workflow diff-summary --staged --include-content --json
```

This returns:
- `files`: All changed files
- `byPackage`: Changes grouped by package with line counts
- `byCategory`: Changes grouped by type (source, tests, docs, config)
- `stats`: Overall statistics
- `diff`: The actual diff content

Use this structured data to understand what changed.

### 3. Draft a conventional commit message

Based on the diff summary, draft a commit message:

```
type(scope): description

[optional body with more details]
```

Types:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **refactor**: Code restructuring without behavior change
- **perf**: Performance improvement
- **test**: Adding/updating tests
- **chore**: Maintenance tasks, dependencies, CI

Scope should be the package name when changes are focused (e.g., `core`, `cli`, `mcp`).

### 4. Check if changeset is needed

```bash
devac workflow check-changeset --json
```

This returns:
- `needsChangeset`: Whether a changeset is required
- `packagesNeedingChangeset`: Which packages need coverage
- `existingChangesets`: Any changesets already on this branch
- `changesetsCoverAll`: Whether existing changesets cover all changed packages

**If needsChangeset is true**:
- Ask user if this change should be released (affects package consumers)
- If yes, run `/devac:draft-changeset` to create a changeset
- Stage the changeset: `git add .changeset/`

### 5. Execute the commit

After user approves the message:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

[body if any]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 6. Summary

Provide a brief summary:
- What was committed
- Whether a changeset was created/needed
- Suggest running `/devac:ship` if ready to push and create PR

## Example Flow

```
User: /devac:commit

Claude: Let me run pre-commit validation...

[Runs: devac workflow pre-commit --json]

✓ Validation passed
  - 3 files staged
  - Lint: pass
  - Types: pass

[Runs: devac workflow diff-summary --staged --include-content --json]

Based on the changes in devac-cli/src, I suggest:

  feat(cli): add workflow commands for deterministic operations

  - Add check-changeset command
  - Add pre-commit validation command
  - Add diff-summary for structured output
  - Add prepare-ship command
  - Add install-local command

[Runs: devac workflow check-changeset --json]

⚠️ Changeset needed for @pietgk/devac-cli

This adds new functionality. Should I create a changeset? (yes/no)
```
