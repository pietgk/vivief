# /devac:start-issue - Start Work on an Existing Issue

You are helping the user start work on an existing GitHub issue.

## Usage

```
/devac:start-issue <issue-number>
```

## Steps

### 1. Fetch issue details

```bash
gh issue view <issue-number>
```

Extract:
- Title
- Description
- Labels
- Acceptance criteria

### 2. Detect current context

Check if we're already set up for this issue:

```bash
# Get current branch
git branch --show-current

# Check for existing plan files
ls .claude/plans/*.md 2>/dev/null
```

**Context Detection Logic:**
- If current branch starts with `<issue-number>-` → Already on issue branch
- If a plan file mentions the issue number → Has existing plan
- Otherwise → Fresh start needed

### 3. Take appropriate action

**If already on issue branch:**
- Skip branch creation
- Show "Already on branch X ✓"
- Check for existing plan file

**If existing plan found:**
- Reference the plan file
- Ask: "Continue with existing plan, or start fresh?"

**If fresh start (different branch, no plan):**
- Create branch: `git checkout -b <issue-number>-<slug>`
- Enter plan mode

### 4. Present summary and next steps

Show:
- Issue title and requirements
- Current branch status
- Available plan (if any)
- Proposed next action

## Example Flows

### Already in worktree (most common after /devac:start-issue-on-new-worktree)

```
User: /devac:start-issue 31

Claude: Fetching issue #31...

## Issue #31: Workspace Analysis Status & Registration

**Branch:** Already on `31-workspace-analysis-status-registration` ✓
**Plan:** Found `.claude/plans/structured-bouncing-eich.md`

### Summary
Create `devac status` (read-only) and enhance `devac hub register`
with `--analyze` flag.

Ready to implement. Would you like to:
1. Review the plan first
2. Start with Task 1
3. Modify the plan
```

### On issue branch, no plan yet

```
User: /devac:start-issue 31

Claude: Fetching issue #31...

## Issue #31: Workspace Analysis Status & Registration

**Branch:** Already on `31-workspace-analysis-status-registration` ✓
**Plan:** None found

[Enters plan mode to design implementation]
```

### Fresh start (no worktree, different branch)

```
User: /devac:start-issue 42

Claude: Fetching issue #42...

## Issue #42: Add watch mode for incremental analysis

**Description:**
Add a `--watch` flag to the analyze command that monitors file changes.

**Acceptance Criteria:**
- [ ] `devac analyze --watch` starts file watcher
- [ ] Changes trigger incremental re-analysis
- [ ] Watcher can be stopped with Ctrl+C

**Labels:** enhancement, devac-cli

---

Creating branch `42-add-watch-mode`...

[Enters plan mode to design implementation]
```

## When to Use

Use `/devac:start-issue` when:
- Starting work on a GitHub issue
- Resuming work in an existing worktree
- Loading issue context into conversation

## Key Behaviors

1. **No redundant branch creation** - Detects if already on issue branch
2. **Plan awareness** - Finds and references existing plan files
3. **Smooth resume flow** - Works naturally after `start-issue-on-new-worktree`
4. **Backward compatible** - Fresh start still works as before
