# /prepare-commit - Prepare Commit Without Executing

You are helping the user prepare a commit by drafting the message, creating changesets, and checking for ADR needs - but NOT executing the commit itself.

## Purpose

This command is for users who want to:
- Review everything before committing
- Make manual adjustments to the commit message
- Run `git commit` themselves

## Steps

### 1. Check for staged changes
Run `git diff --cached --stat` to see what's staged. If nothing is staged, inform the user.

### 2. Analyze the changes
Run `git diff --cached` to understand the actual code changes.

### 3. Draft a conventional commit message
Create a commit message following this format:
```
type(scope): description

[optional body with more details]
```

Output the message clearly so the user can copy it.

### 4. Check if changeset is needed
Check if any files in `packages/*/src/` were modified:
```bash
git diff --cached --name-only | grep -E "^packages/.*/src/"
```

If package source files changed and user confirms:
- Create the changeset file using `/draft-changeset`
- Stage it: `git add .changeset/`

### 5. Check if ADR is needed
Ask if an architectural decision should be documented.

### 6. Output summary

```
## Ready to Commit

**Suggested commit message:**
```
feat(cli): add watch mode for incremental analysis
```

**Changeset:** Created and staged (.changeset/cool-pandas-dance.md)

**ADR:** Not needed for this change

**To commit, run:**
```bash
git commit -m "feat(cli): add watch mode for incremental analysis"
```

Or simply copy the message and run `git commit`.
```

## Key Difference from /commit

- `/commit` executes `git commit` automatically after approval
- `/prepare-commit` prepares everything but lets the user commit manually
