# Plan: Fix git-crypt support and default branch detection

> **Issue:** [#183](https://github.com/pietgk/vivief/issues/183)
> **Status:** IN_PROGRESS
> **Created:** 2026-01-19

## From Issue

### Problem 1: Hardcoded "main" Branch
The code hardcodes "main" as the base branch in `packages/devac-worktree/src/commands/start.ts`:
- Line ~445: `git worktree add -b <branch> <path> "main"`
- Line ~439-442: `git fetch origin main:main` with `reject: false` (silently ignores if origin/main doesn't exist)

**Impact:** When a repo uses "development" as default branch and has an old empty "main", worktrees get created from the wrong commit.

### Problem 2: Git-Crypt Catch-22
When creating worktrees in git-crypt repos:
1. Worktree creation triggers the git-crypt smudge filter
2. Smudge filter fails because worktree isn't "unlocked"
3. Can't unlock because working directory is "dirty"
4. **DEADLOCK**

### Validated Workaround
The symlink approach works:
```bash
# 1. Create worktree with --no-checkout
git worktree add --no-checkout -b branch ../worktree-path development

# 2. Create symlink to share git-crypt state
ln -s ../../git-crypt .git/worktrees/worktree-path/git-crypt

# 3. Now checkout works
cd ../worktree-path && git checkout HEAD .
```

## Implementation Plan

### Task 1: Add default branch detection
- Detect default branch dynamically using `git symbolic-ref refs/remotes/origin/HEAD`
- Fallback to checking common branch names: main, master, development, develop
- Add `--base` CLI flag to allow explicit override

### Task 2: Add git-crypt detection and handling
- Detect git-crypt repos by checking for `.git-crypt/` directory or `.gitattributes` with git-crypt filter
- When detected, use `--no-checkout` flag for worktree creation
- Create symlink from `.git/worktrees/<name>/git-crypt` to main repo's `.git/git-crypt`
- Then run `git checkout HEAD .` to populate files

### Task 3: Remove silent failures
- Change `reject: false` to proper error handling
- Provide clear error messages when base branch not found

### Task 4: Testing
- Add tests for default branch detection
- Add tests for git-crypt detection
- Add integration test for the full worktree creation flow

## Files to Modify

| File | Change |
|------|--------|
| `packages/devac-worktree/src/commands/start.ts` | Default branch detection, git-crypt handling |
| `packages/devac-worktree/src/index.ts` | Add `--base` CLI flag |
| `packages/devac-worktree/__tests__/` | Add tests |
