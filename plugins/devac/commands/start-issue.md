# /devac:start-issue - Start Work on a GitHub Issue

You are helping the user start work on a GitHub issue.

## Usage

```
/devac:start-issue <issue-id> [quick]
```

## Arguments

- `<issue-id>`: Full issue ID in format `gh<repoDir>-<number>` (e.g., `ghvivief-42`)
- `quick` (optional): Work in current directory with a branch instead of creating a worktree

## Issue ID Format

**IMPORTANT:** Always use the full issue ID format:

```
gh<repoDirectoryName>-<issueNumber>
│ │                    │
│ │                    └─ Issue number (e.g., 42, 123)
│ │
│ └─ Repository DIRECTORY name (the folder name, NOT org/repo)
│    Examples: "vivief", "monorepo-3.0", "app"
│
└─ Source prefix: "gh" for GitHub
```

**Examples:**
- `ghvivief-42` → repo directory "vivief", issue #42
- `ghmonorepo-3.0-123` → repo directory "monorepo-3.0", issue #123
- `ghapp-7` → repo directory "app", issue #7

**Handling User Input:**

| User Provides | What to Do |
|--------------|------------|
| `ghvivief-42` | Use as-is (GitHub format) |
| `https://github.com/org/vivief/issues/42` | Extract → `ghvivief-42` |
| `42` alone | Ask: "Which repo?" then form `gh<repoDir>-42` |
| `CORE-123` or `core-123` (Jira-style) | CLI will show "Jira support coming soon" |
| Any non-`gh` input | Assumed to be Jira, shows "coming soon" message |

**Note:** The CLI assumes any input NOT starting with `gh` is a Jira ticket (support coming soon). Mixed case inputs are uppercased in the error message (e.g., `core-123` → `CORE-123`).

## Execution Logic

**FIRST**: Check if `quick` argument was provided.

| Argument | Mode | Action |
|----------|------|--------|
| No `quick` | Worktree Mode (DEFAULT) | Run `devac-worktree start <issue-id>` |
| `quick` present | Quick Mode | Create branch with `git checkout -b` |

**IMPORTANT**: Without the `quick` argument, you MUST use `devac-worktree start`. Do NOT create a branch manually with `git checkout -b`.

## Modes

### Default: Worktree Mode (Recommended)

Creates an isolated worktree for the issue. Fully automated via CLI.

**Step 1: Create worktree**

```bash
devac-worktree start <issue-id>
```

This handles:
- Creates worktree at `../<repo>-<issue>-<slug>/`
- Installs dependencies
- Does NOT auto-launch Claude (default behavior)

**Step 2: Detect context for session guidance**

```bash
# Check if we're at workspace level or inside a repo
git rev-parse --show-toplevel 2>/dev/null
```

**If at workspace level** (command fails = not in a git repo):
> Worktree created at `<path>`
> You can work on it from this session - no need to start a new Claude.

**If inside a repo** (command succeeds):
> Worktree created at `<path>`
> Options:
> 1. Start Claude in worktree: `cd <path> && claude`
> 2. Start Claude at workspace: `cd ~/ws && claude` (access all repos)
> 3. Continue here (suboptimal - limited access to worktree)

**Step 3: Fetch issue with comments and enter plan mode**

Run the `gh` command from within the worktree directory (where git context is available):

```bash
cd <worktree-path> && gh issue view <issue-number> --json number,title,body,comments,labels
```

The worktree path is printed in Step 1 output (e.g., `~/ws/vivief-42-add-feature/`).

Create a plan file at `.claude/plans/<generated-name>.md` with:

```markdown
# Plan: [Issue Title]

> **Issue:** [#<number>](https://github.com/<owner>/<repo>/issues/<number>)
> **Status:** IN_PROGRESS
> **Created:** <date>

## From Issue

[Extracted from issue body and comments]
- Key requirements
- Acceptance criteria
- Context from discussion

## Implementation Plan

[Your designed approach]
- Task 1
- Task 2
```

Then enter plan mode to design the implementation.

### Quick Mode

For small fixes in the current directory. Creates a branch only.

**Step 1: Fetch issue details**

```bash
gh issue view <issue-number>
```

Extract:
- Title
- Description
- Labels
- Acceptance criteria

**Step 2: Detect current context**

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

**Step 3: Take appropriate action**

**If already on issue branch:**
- Skip branch creation
- Show "Already on branch X ✓"
- Check for existing plan file

**If existing plan found:**
- Reference the plan file
- Ask: "Continue with existing plan, or start fresh?"

**If fresh start:**
- Create branch: `git checkout -b <issue-number>-<slug>`
- Fetch issue with comments: `gh issue view <issue-number> --json number,title,body,comments,labels`
- Create plan file with issue link
- Enter plan mode

**Step 4: Present summary and next steps**

Show:
- Issue title and requirements
- Current branch status
- Available plan (if any)
- Enter plan mode for implementation design

## Issue-as-Plan Philosophy

### Two-Level Planning

| Level | Location | Purpose | Lifespan |
|-------|----------|---------|----------|
| **Long-term** | GitHub Issue | Requirements, acceptance criteria, discussion | Until issue closed |
| **Short-term** | `.claude/plans/*.md` | Implementation details, tasks, progress | Until work shipped |

### Why This Works

- **Issue is canonical** - requirements live in GitHub, not duplicated
- **Plan links back** - always traceable to source
- **Comments = context** - discussion informs implementation
- **Plan is temporary** - shipped work = delete plan

## Examples

### Worktree mode (default, recommended)

```
User: /devac:start-issue ghvivief-42

Claude: Creating worktree for issue #42...

[Runs: devac-worktree start ghvivief-42]

✓ Worktree created at ~/ws/vivief-42-add-watch-mode/
✓ Branch: 42-add-watch-mode
✓ Dependencies installed

You're at workspace level - you can work on it from this session.

Fetching issue details...

## Issue #42: Add watch mode for incremental analysis

**Labels:** enhancement, devac-cli

**Description:**
Add a `--watch` flag to the analyze command that monitors file changes.

**Acceptance Criteria:**
- [ ] `devac analyze --watch` starts file watcher
- [ ] Changes trigger incremental re-analysis
- [ ] Watcher can be stopped with Ctrl+C

Creating plan file...

[Enters plan mode with issue content as foundation]
```

### Quick mode (branch in current dir)

```
User: /devac:start-issue ghvivief-42 quick

Claude: Fetching issue #42...

## Issue #42: Add watch mode for incremental analysis

**Branch:** Creating `42-add-watch-mode`...
**Plan:** Creating `.claude/plans/42-add-watch-mode.md`

[Enters plan mode with issue content as foundation]
```

### Already on issue branch

```
User: /devac:start-issue ghvivief-31 quick

Claude: Fetching issue #31...

## Issue #31: Workspace Analysis Status & Registration

**Branch:** Already on `31-workspace-analysis-status-registration` ✓
**Plan:** Found `.claude/plans/structured-bouncing-eich.md`

Ready to implement. Would you like to:
1. Review the plan first
2. Start with Task 1
3. Modify the plan
```

## When to Use

| Scenario | Mode |
|----------|------|
| New feature work | Default (worktree) |
| Multi-issue parallel work | Default (worktree) |
| Small bug fix | `quick` |
| Quick typo/doc fix | `quick` |
| Issue spans multiple repos | Default (worktree) with `--repos` |

## See Also

- `devac-worktree start` - CLI for worktree creation
- `devac-worktree status` - Check worktree and PR status
- `devac-worktree clean` - Remove merged worktrees
