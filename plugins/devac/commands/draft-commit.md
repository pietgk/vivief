# /draft-commit - Draft a Commit Message

You are helping the user draft a conventional commit message for their staged changes.

## Purpose

This is a focused command that only drafts the commit message - no changeset creation, no ADR checks, no committing.

## Steps

### 1. Check for staged changes
```bash
git diff --cached --stat
```

If nothing is staged, inform the user.

### 2. Analyze the changes
```bash
git diff --cached
```

Consider:
- What type of change is this?
- Which package(s) are affected?
- What is the main purpose?

### 3. Draft the commit message

Output a conventional commit message:

```
type(scope): short description

- Detail 1
- Detail 2
```

**Types:**
| Type | Description |
|------|-------------|
| feat | New feature |
| fix | Bug fix |
| docs | Documentation only |
| refactor | Code restructuring |
| perf | Performance improvement |
| test | Adding/updating tests |
| chore | Maintenance, deps, CI |

**Scope:** Optional, use package name if changes are focused (e.g., `core`, `cli`, `mcp`)

### 4. Output for easy copying

```
## Suggested Commit Message

feat(cli): add watch mode for incremental analysis

- Adds file watcher using chokidar
- Debounces rapid file changes
- Integrates with analysis orchestrator

---

Copy the above message and run:
git commit -m "feat(cli): add watch mode for incremental analysis"

Or for multi-line:
git commit
```

## Notes

- This command only drafts the message
- For full workflow with changeset/ADR checks, use `/commit` or `/prepare-commit`
- For just creating a changeset, use `/draft-changeset`
