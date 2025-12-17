# /ship - Complete Ship Flow

You are helping the user ship their changes through the complete workflow: commit, push, and prepare PR.

## Overview

This command combines multiple steps into one flow:
1. Commit staged changes (with changeset/ADR checks)
2. Push to remote
3. Prepare PR description
4. Optionally create PR

## Steps

### 1. Pre-flight checks

```bash
# Check for staged changes
git diff --cached --stat

# Check current branch
git branch --show-current
```

If on `main`, warn the user to create a feature branch first.

### 2. Commit flow

Run the `/commit` workflow:
- Analyze changes
- Draft commit message
- Check for changeset need
- Check for ADR need
- Execute commit

### 3. Push to remote

```bash
git push -u origin $(git branch --show-current)
```

If push fails due to no upstream, set it:
```bash
git push --set-upstream origin $(git branch --show-current)
```

### 4. Prepare PR

Run the `/prepare-pr` workflow:
- Analyze commits on branch
- Draft PR title and description
- Check changesets are included

### 5. Create PR (optional)

Ask if the user wants to create the PR now:

```bash
# Via GitHub CLI
gh pr create --title "title" --body "description"

# Or open in browser
gh pr create --web
```

## Example Flow

```
User: /ship

Claude: Starting ship flow...

## Step 1: Checking staged changes
3 files changed, 150 insertions(+), 20 deletions(-)

## Step 2: Committing
Suggested commit message:

  feat(cli): add watch mode for incremental analysis

This modifies packages/devac-cli/src/. A changeset is needed.
Creating changeset... Done.

Committing... Done.

## Step 3: Pushing
Pushing to origin/feature/watch-mode... Done.

## Step 4: Preparing PR

**Title:** feat(cli): add watch mode for incremental analysis

**Description:**
[Full PR description]

## Step 5: Create PR?

Would you like me to create the PR now?
- Yes, create it
- No, I'll do it manually
- Open GitHub in browser

---

To create manually:
gh pr create --title "feat(cli): add watch mode" --web
```

## Safety Features

- Warns if on `main` branch
- Confirms before each major step
- Shows what will be committed/pushed
- Validates commit message format

## Abort at Any Step

The user can say "stop" or "cancel" at any point to abort the flow.
