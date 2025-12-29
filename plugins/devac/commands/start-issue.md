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

### 2. Present issue summary

Show the user what they're working on:
- Issue title and number
- Key requirements
- Acceptance criteria
- Affected packages

### 3. Create a branch

Generate branch name from issue:
```bash
# Format: {issue-number}-{short-description}
git checkout -b <issue-number>-<slug>
```

Example: `42-add-watch-mode`

### 4. Enter plan mode

Propose an implementation approach:
- Identify files to modify
- Suggest implementation order
- Note any dependencies or considerations
- Ask clarifying questions if needed

## Example Flow

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

## Implementation Plan

1. Add chokidar dependency for file watching
2. Create watcher module in cli/src/commands/
3. Integrate with existing analyze command
4. Add tests for watcher behavior
5. Update CLI help text

Shall I proceed with this plan, or would you like to discuss the approach first?
```

## When to Use

Use `/devac:start-issue` when:
- You want to start work on an existing GitHub issue
- You need the issue context loaded into the conversation
- You want to create a properly named branch automatically
