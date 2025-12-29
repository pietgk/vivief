# /devac:issue - Create a New GitHub Issue

You are helping the user create a new GitHub issue with proper structure and context.

## Steps

### 1. Gather issue details

Ask the user about:
- **Title**: What is this issue about? (brief, descriptive)
- **Description**: What needs to be done?
- **Context**: Current state and why this is needed
- **Acceptance criteria**: How do we know it's complete?

### 2. Determine issue type

- **Bug**: Something isn't working as expected
- **Feature**: New functionality to add
- **Task**: General work item
- **Documentation**: Docs improvement

### 3. Identify affected packages

Ask which packages are involved:
- `devac-core`
- `devac-cli`
- `devac-mcp`
- `devac-worktree`

### 4. Check for constraints

- Does this need a changeset?
- Might this need an ADR?
- Are there breaking change considerations?

### 5. Create the issue

Use GitHub CLI to create:

```bash
gh issue create \
  --title "Brief descriptive title" \
  --body "$(cat <<'EOF'
## Description

[What needs to be done]

## Context

[Current state and why this is needed]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Affected Packages

- [ ] devac-core
- [ ] devac-cli

## Constraints

- Changeset required: yes/no
- ADR consideration: yes/no
EOF
)"
```

## Example Flow

```
User: /devac:issue

Claude: I'll help you create a GitHub issue. Let me ask a few questions:

1. What's this issue about? (brief title)
2. What needs to be done? (description)
3. Why is this needed? (context)
4. How will we know it's complete? (acceptance criteria)
5. Which packages are affected?

[User provides answers]

Creating issue...

## Issue Created

**#123**: Add watch mode for incremental analysis

View at: https://github.com/org/repo/issues/123

To start working on this:
```
/devac:start-issue 123
```
```

## When to Use

Use `/devac:issue` when:
- You have a new task or feature to track
- You want properly structured issue documentation
- You need to capture requirements before starting work
