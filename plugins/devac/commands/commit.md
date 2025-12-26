# /commit - Full Commit Workflow

You are helping the user commit their staged changes following the vivief development workflow.

## Steps

### 1. Check for staged changes
Run `git diff --cached --stat` to see what's staged. If nothing is staged, inform the user and ask if they want to stage all changes with `git add -A`.

### 2. Analyze the changes
Run `git diff --cached` to understand the actual code changes. Consider:
- What type of change is this? (feat, fix, docs, refactor, perf, test, chore)
- Which package(s) are affected?
- What is the main purpose of these changes?

### 3. Draft a conventional commit message
Based on your analysis, draft a commit message following this format:
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

Scope is optional but recommended when changes are focused on a specific package (e.g., `core`, `cli`, `mcp`).

### 4. Check if changeset is needed
Check if any files in `packages/*/src/` were modified:
```bash
git diff --cached --name-only | grep -E "^packages/.*/src/"
```

If package source files changed:
- Ask the user if this change should be released (affects package consumers)
- If yes, run `/draft-changeset` to create a changeset
- If no (internal change only), skip the changeset

### 5. Check if ADR is needed
Ask the user: "Does this change involve an architectural decision that should be documented?"

Examples of when an ADR is needed:
- Choosing between different technical approaches
- Adding new dependencies
- Changing data models or APIs
- Modifying system architecture

If yes, offer to run `/draft-adr` after the commit.

### 6. Execute the commit
After user approves the commit message:
```bash
git commit -m "type(scope): description"
```

### 7. Summary
Provide a brief summary:
- What was committed
- Whether a changeset was created
- Whether an ADR should be created
- Suggest running `/prepare-pr` if ready to open a PR

## Example Flow

```
User: /commit

Claude: Let me check your staged changes...

[Shows staged files summary]

Based on the changes, I suggest this commit message:

  feat(cli): add watch mode for incremental analysis

  - Adds file watcher using chokidar
  - Debounces rapid file changes
  - Integrates with analysis orchestrator

I see you modified files in packages/devac-cli/src/. This will need a changeset for the release.
Should I create one? (yes/no)

Also, does this change involve an architectural decision that should be documented as an ADR?
```
