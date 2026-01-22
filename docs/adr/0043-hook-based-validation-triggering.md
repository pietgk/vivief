# ADR-0043: Hook-Based Validation Triggering

## Status

Proposed

> **Note:** CLI commands in this ADR have been reorganized in v4.0. See `docs/cli-reference.md` for current commands.

## Context

DevAC has comprehensive validation infrastructure (TypeScript, ESLint, tests, coverage, WCAG) but requires manual triggering. Users must explicitly run `devac validate` or ask Claude about diagnostics.

The personal-assistant plugin demonstrates an effective pattern: **hooks for reliable context injection** combined with **instructions for intelligent action**. This enables proactive behavior without blocking workflows.

Analysis of this pattern is documented in [Personal Assistant Plugin Analysis](../vision/combine-reliable-context-injection-with-intelligent-instruction-following.md).

### Current Workflow (Manual)

1. Developer makes code changes
2. Developer asks Claude to check for issues OR manually runs `devac validate`
3. Claude reports issues
4. Developer asks Claude to fix them
5. Repeat until clean

### Desired Workflow (Automated)

1. Developer makes code changes
2. **Hook automatically injects diagnostic status** (UserPromptSubmit)
3. Claude sees issues and resolves them proactively
4. **Hook reminds about remaining issues** (Stop)
5. Claude continues until validation passes

## Decision

Implement hook-based validation triggering for Claude Code:

1. **UserPromptSubmit hook**: Inject diagnostic status (counts) on every message when issues exist
2. **Stop hook**: Inject resolution instructions when validation issues exist after code changes
3. **Progressive disclosure**: Three levels (counts → summary → details) to manage context size
4. **Instruction-driven resolution**: Claude decides when/how to fix, not forced by hooks

### Implementation Details

#### 1. Create `plugins/devac/hooks/hooks.json`

```json
{
  "hooks": [
    {
      "event": "UserPromptSubmit",
      "command": "devac status --inject",
      "blocking": false
    },
    {
      "event": "Stop",
      "command": "devac validate --on-stop",
      "blocking": false
    }
  ]
}
```

#### 2. Add `devac status --inject` command

Outputs hook-compatible JSON with diagnostic counts:

```json
{
  "diagnostics": {
    "errors": 3,
    "warnings": 5
  },
  "reminder": "There are 3 errors and 5 warnings. Use get_all_diagnostics to see details."
}
```

Only outputs when there are issues; silent otherwise.

#### 3. Add `devac validate --on-stop` command

Runs validation on recently edited files and outputs resolution instructions:

```
Validation found issues that should be resolved:
- 2 TypeScript errors in src/components/Button.tsx
- 1 ESLint warning in src/utils/helpers.ts

Consider running get_all_diagnostics to see details and fix these issues.
```

#### 4. Progressive disclosure in MCP tools

Add `level` parameter to `get_all_diagnostics`:
- `counts`: Just error/warning counts per source (fastest, smallest)
- `summary`: Counts + file paths affected (medium)
- `details`: Full diagnostic information (current behavior)

## Consequences

### Positive

- Proactive validation awareness without manual queries
- "Solve until none" workflow becomes natural
- Leverages existing MCP tools and skills
- Non-blocking (instructions, not forced actions)
- Low overhead (fast count queries)
- Matches established patterns from personal-assistant plugin

### Negative

- Hook overhead on every message (mitigated by fast count query)
- Requires devac CLI in PATH for hooks to work
- Session state not persisted (edited files list lost on restart)
- Users may find reminders intrusive (can disable hooks)

### Neutral

- Hooks are opt-in via plugin installation
- Doesn't replace manual validation—augments it

## Alternatives Considered

### 1. Blocking validation

Force validation before allowing responses.

**Rejected**: Too disruptive to workflow. Users expect Claude to respond immediately.

### 2. Notification only

Show diagnostic counts but no resolution instructions.

**Rejected**: Doesn't enable the "solve until none" workflow—just adds noise.

### 3. Full validation on every message

Run complete validation on UserPromptSubmit.

**Rejected**: Too slow (seconds), too much context. Counts are sufficient for awareness.

### 4. MCP resource polling

Have Claude poll diagnostics via MCP instead of hooks.

**Rejected**: Non-deterministic—Claude may not check. Hooks ensure reliable injection.

## References

- [Personal Assistant Plugin Analysis](../vision/combine-reliable-context-injection-with-intelligent-instruction-following.md) — Vision document
- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks) — Hook event types
- [gaps.md Phase 3](../spec/gaps.md) — Implementation tracking
- [comprehensive-review.md](../spec/comprehensive-review.md) — Strategic roadmap
