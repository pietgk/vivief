# ADR-0025: Unified Start-Issue Command

## Status

Accepted

## Context

The devac-worktree CLI and Claude slash commands had two separate ways to start work on an issue:

1. **`/devac:start-issue <number>`** - Created a branch in the current directory, detected existing context, entered plan mode
2. **`/devac:start-issue-on-new-worktree <issue-id>`** - Created an isolated git worktree via `devac-worktree start`

This caused confusion:
- Users had to remember which command to use for which scenario
- The naming was inconsistent (`start-issue` vs `start-issue-on-new-worktree`)
- Best practice (worktree isolation) required the longer, less discoverable command
- The `--skip-claude` flag had confusing double-negative semantics

## Decision

Consolidate into a single `/devac:start-issue` command with two modes:

### Command Structure

```
/devac:start-issue <issue-id> [quick]
```

- **Default (no argument)**: Creates isolated worktree via `devac-worktree start`
- **`quick` argument**: Creates branch in current directory (for small fixes)

### Flag Rename

Rename `--skip-claude` to `--new-session` with inverted semantics:

| Old | New | Meaning |
|-----|-----|---------|
| `--skip-claude` (opt-out) | `--new-session` (opt-in) | Launch Claude in worktree |
| Default: launch Claude | Default: don't launch | User decides when to start session |

### Rationale

1. **Worktree as default** - Encourages best practice (isolation) without extra typing
2. **Quick as opt-in** - Small fixes are the exception, not the rule
3. **Positive flag naming** - `--new-session` is clearer than `--skip-claude`
4. **User control** - Not auto-launching Claude lets users decide session context

## Consequences

### Positive

- Single command to remember
- Best practice (worktree) is the default
- Clearer flag semantics (`--new-session` vs `--skip-claude`)
- Reduced cognitive load for users

### Negative

- Existing muscle memory for `--skip-claude` flag breaks
- Users who relied on auto-launching Claude need to add `--new-session`

### Neutral

- `quick` mode is slightly more typing than the old `/devac:start-issue`
- Documentation and habits need updating

## References

- Commit: `1544991` feat(worktree): consolidate start-issue commands
- Related: [ADR-0014: Git Worktree + Claude Workflow](0014-worktree-claude-workflow.md)
