# Personal Assistant Review & DevAC Integration Analysis

## Executive Summary

This analysis reviews the `personal-assistant` (Elle) plugin architecture and identifies transferable patterns to improve DevAC's validation pipeline triggering and diagnostics delivery to Claude.

---

## Part 1: Personal Assistant Architecture Review

### How It Works

The personal-assistant plugin transforms Claude into "Elle" - a persistent personal assistant with memory. The architecture cleverly combines **hook-based automation** with **instruction-based behavior**:

```
┌─────────────────┐    UserPromptSubmit    ┌──────────────────────┐
│  User Message   │ ───────────────────────▶│ load_context_system.py│
└─────────────────┘                         └──────────┬───────────┘
                                                       │
                                              ┌────────▼───────────┐
                                              │ Inject CLAUDE.md   │
                                              │ as additionalCtx   │
                                              └────────┬───────────┘
                                                       │
┌─────────────────┐                          ┌────────▼───────────┐
│ Elle Responds   │ ◀────────────────────────│   Claude Code      │
└────────┬────────┘                          └────────────────────┘
         │
         │ Claude follows CLAUDE.md instructions
         │ to update context before completing
         ▼
┌─────────────────┐
│ Update context  │ (instruction-based, not hook-blocked)
│ files as needed │
└─────────────────┘
         │
         │ Stop Event
         ▼
┌─────────────────┐
│play_notification│ ─────▶ Audio feedback (non-blocking)
└─────────────────┘
```

**Key Design Insight:** The system uses a **hook for input** (inject context) but **instructions for output** (update context). This is elegant because it leverages Claude's intelligence to decide WHEN and WHAT to update, rather than forcing updates every time.

**Key Files:**
- `/Users/grop/llm/ai-launchpad-marketplace/personal-assistant/hooks/load_context_system.py` - Context injection
- `/Users/grop/llm/ai-launchpad-marketplace/personal-assistant/hooks/hooks.json` - Hook registration
- `/Users/grop/llm/ai-launchpad-marketplace/personal-assistant/context-template/CLAUDE.md` - Operating instructions
- `/Users/grop/llm/ai-launchpad-marketplace/personal-assistant/context-template/context-update.md` - Update procedures

### Core Mechanisms

#### 1. Hook-Based Event System (hooks/hooks.json)
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "uv run python ${CLAUDE_PLUGIN_ROOT}/hooks/load_context_system.py"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "uv run python ${CLAUDE_PLUGIN_ROOT}/hooks/play_notification.py"
      }]
    }],
    "Notification": [
      {"matcher": "permission_prompt", "hooks": [...]},
      {"matcher": "idle_prompt", "hooks": [...]}
    ]
  }
}
```

**Note:** The Stop hook only plays a notification sound - context updates are instruction-driven, not hook-blocked.

#### 2. Context Injection via additionalContext
```python
# load_context_system.py output
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[Full CLAUDE.md content]"
  }
}
```

#### 3. Instruction-Based Context Updates (CLAUDE.md)
The injected CLAUDE.md contains instructions like:
```markdown
### Before Completing Your Response

After finishing the main task, take a moment to assess:
- **Did I learn something new about the user?** → Update the relevant context file
- **Did the user correct me?** → Add to `rules.md` immediately
- **Did a project status change?** → Update `projects.md`
```

This delegates the "when to update" decision to Claude's judgment.

#### 4. Progressive Disclosure Model
```
Level 1: Metadata (always loaded) - ~100 words
├── Plugin status, file frontmatter

Level 2: Core Context (loaded on substantive tasks)
├── CLAUDE.md, rules.md, identity.md, preferences.md
├── workflows.md, relationships.md, triggers.md, projects.md

Level 3: Detailed Resources (as needed)
├── session.md, journal.md, referenced project files
```

#### 5. "Future Self" Test for Filtering
```
Before storing, ask: "Would this change how I respond tomorrow?"

✅ STORE: "User prefers uv over pip"
❌ SKIP: "Installed dependencies with uv"
```

---

### Pros

| Category | Advantage |
|----------|-----------|
| **Memory Persistence** | Context survives sessions, stored at `~/.claude/.context/` |
| **Autonomous Updates** | No permission-seeking, just brief notifications |
| **Self-Improvement** | Rules system captures corrections, prevents repeated mistakes |
| **Hook + Instructions** | Hook for reliable injection, instructions for intelligent updates |
| **Progressive Loading** | Only loads what's needed, reduces noise |
| **External Storage** | Data survives plugin updates, user owns their data |
| **Structured Templates** | XML tags persist through edits |
| **Non-Blocking Stop** | Notification only, doesn't force updates |

### Cons

| Category | Limitation |
|----------|------------|
| **Python Dependency** | Requires `uv` runtime for hooks |
| **Instruction Compliance** | Relies on Claude following CLAUDE.md instructions |
| **Manual Onboarding** | Requires `/setup` and `/onboard` commands |
| **Single User** | No multi-user or team context |
| **No Update Validation** | Context updates aren't validated for correctness |
| **Hook Overhead** | Python script runs on every message |
| **No Caching** | CLAUDE.md reloaded fully each time |

---

## Part 2: Current DevAC State

### What DevAC Already Has

**Plugin Structure** (exists but minimal):
```
plugins/devac/
├── .claude-plugin/
│   └── plugin.json              # Basic metadata, NO hooks defined
├── skills/
│   ├── diagnostics-triage/      # Skill for diagnostic handling
│   │   └── SKILL.md             # Trigger patterns + MCP/CLI guidance
│   ├── code-analysis/
│   ├── impact-analysis/
│   └── ... (8 more skills)
└── commands/
    └── ... (CLI commands)
```

**Core Validation System**:
```
packages/devac-core/src/
├── validation/
│   ├── validation-coordinator.ts   # Orchestrates 5 validators
│   ├── issue-enricher.ts          # Adds CodeGraph context
│   └── validators/
│       ├── TypecheckValidator     # tsc
│       ├── LintValidator          # eslint
│       ├── TestValidator          # vitest/jest
│       ├── CoverageValidator      # coverage analysis
│       └── WcagValidator          # accessibility
├── hub/
│   ├── central-hub.ts             # DuckDB orchestration
│   └── hub-storage.ts             # unified_diagnostics table
└── context/
    ├── ci-hub-sync.ts             # GitHub CI → Hub
    ├── issues-hub-sync.ts         # GitHub Issues → Hub
    └── reviews-hub-sync.ts        # PR Reviews → Hub
```

### Existing diagnostics-triage Skill

The skill triggers on phrases like "what needs fixing", "show errors", "type errors" and guides Claude to use:
- `devac diagnostics` - Get overview
- `devac validate` - Run validators
- `devac query` - Advanced SQL queries
- MCP tools as alternative

**Current limitation:** User must explicitly ask - no proactive injection.

### MCP Tools Already Exposed

```typescript
// Diagnostics tools available to Claude
get_validation_errors()     // TypeScript, ESLint, test failures
get_validation_summary()    // Aggregated by source/file
get_validation_counts()     // Quick error/warning counts
get_all_diagnostics()       // Unified view (all sources)
get_diagnostics_summary()   // Group by repo/source/severity
```

### Current Gaps

| Gap | Impact |
|-----|--------|
| **No hooks in plugin.json** | DevAC plugin has no event-driven behavior |
| **No automatic triggering** | Validation runs only on explicit CLI command |
| **No proactive injection** | Claude doesn't see diagnostics until asked |
| **No progressive disclosure** | Full diagnostic dump vs. summary first |
| **Manual context injection** | User must ask for diagnostics |
| **No "right time" detection** | Doesn't trigger after edits, builds, or git operations |
| **No session awareness** | Each query is isolated, no session context |

---

## Part 3: Transferable Concepts

### Concept 1: UserPromptSubmit Hook for Diagnostics Status

**From Personal Assistant:**
```python
# On every message, inject CLAUDE.md with instructions
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[CLAUDE.md with operating instructions]"
  }
}
```

**For DevAC - inject diagnostic status + instructions:**
```python
# hooks/inject_diagnostics.py - runs on UserPromptSubmit
import json
import subprocess
import sys

def get_diagnostic_counts():
    """Query hub for current diagnostic counts."""
    result = subprocess.run(
        ["devac", "diagnostics", "--counts", "--json"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return json.loads(result.stdout)
    return {"errors": 0, "warnings": 0}

def main():
    # Consume stdin
    try:
        json.load(sys.stdin)
    except json.JSONDecodeError:
        pass

    counts = get_diagnostic_counts()

    # Only inject if there are issues
    if counts["errors"] > 0 or counts["warnings"] > 0:
        context = f"""<system-reminder>
## DevAC Diagnostics Status

**Current Issues:** {counts["errors"]} errors, {counts["warnings"]} warnings

If working on code changes, consider checking diagnostics:
- Use `get_diagnostics_summary(groupBy: "file")` to see affected files
- Use `get_all_diagnostics(severity: ["error"])` for error details
- After edits, run `devac validate --quick` to refresh

Don't address diagnostics unless the user asks or they're blocking the current task.
</system-reminder>"""

        output = {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": context
            }
        }
        print(json.dumps(output))

    sys.exit(0)

if __name__ == "__main__":
    main()
```

**Benefit:** Claude passively knows diagnostic state. Instruction-based (not forced) like Elle's context updates.

---

### Concept 2: Stop Hook - Solve Diagnostics Until None

**Key Insight from User:** Rather than blocking or just notifying, the preferred behavior is to **solve validation diagnostics until there are none**. This makes the Stop hook a trigger for proactive resolution.

**For DevAC - instruction-based resolution loop:**

The Stop hook doesn't block - it injects instructions that tell Claude to resolve issues:

```typescript
// devac validate --on-stop --json
// Returns instructions for Claude to resolve issues

interface ValidateOnStopOutput {
  hookSpecificOutput: {
    hookEventName: "Stop";
    additionalContext: string;  // Instructions to fix
  };
}

// Example output when issues exist:
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": `<system-reminder>
## Validation Issues Detected

Before completing, please address these issues:

**Errors (2):**
- src/api/auth.ts:45 - TS2345: Argument type mismatch
- src/api/auth.ts:89 - TS2322: Type 'string' not assignable

**Suggested approach:**
1. Use \`get_all_diagnostics(severity: ["error"])\` for details
2. Fix each error
3. Run \`devac validate --quick\` to verify fixes
4. Continue until no errors remain

If issues are intentional or out of scope, explain why and proceed.
</system-reminder>`
  }
}

// Example output when clean:
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": ""  // Empty = no injection
  }
}
```

**Key behaviors:**
1. **Non-blocking** - Claude can always proceed if issues are intentional
2. **Instruction-driven** - Tells Claude WHAT to do, not forces it
3. **Loop until clean** - Each fix triggers re-validation until no issues
4. **Contextual** - Only fires if files were edited this session

**Benefit:** Combines the best of both worlds - reliable trigger (hook) with intelligent action (instructions). Claude resolves issues autonomously until the codebase is clean.

---

### Concept 3: Progressive Disclosure for Diagnostics

**From Personal Assistant:**
```
Level 1: Always show (summary)
Level 2: On substantive tasks (core context)
Level 3: On demand (full details)
```

**For DevAC:**
```markdown
Level 1: Status Line (always visible)
┌─────────────────────────────────────────┐
│ DevAC: 3 errors, 5 warnings (2 files)   │
└─────────────────────────────────────────┘

Level 2: Summary on Request
┌─────────────────────────────────────────┐
│ ## Diagnostics Summary                  │
│ - src/api/auth.ts: 2 TS errors          │
│ - src/components/Form.tsx: 1 TS, 3 lint │
└─────────────────────────────────────────┘

Level 3: Full Details on Drill-Down
┌─────────────────────────────────────────┐
│ ## src/api/auth.ts                      │
│ Line 45: TS2345: Argument of type...    │
│ Line 89: TS2322: Type 'string' not...   │
│                                          │
│ ### Suggested Fix                       │
│ Add type guard at line 44...            │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
// Three MCP tools with increasing detail
get_diagnostics_status()   // Level 1: counts only
get_diagnostics_summary()  // Level 2: grouped by file
get_diagnostics_details()  // Level 3: full with suggestions
```

---

### Concept 4: Trigger Detection ("Right Time")

**From Personal Assistant:**
- Hooks fire on specific Claude Code events (UserPromptSubmit, Stop)
- System knows when to inject context vs. block completion

**For DevAC - When to Validate:**

| Event | Validation Type | Action |
|-------|-----------------|--------|
| `UserPromptSubmit` | None | Inject current status (Level 1) |
| `Stop` (files edited) | Quick (TS + ESLint) | Block if new errors |
| `git commit` | Full | Run all validators, fail commit on errors |
| `git push` | Full | Run all + CI checks locally |
| `build` command | Quick | Typecheck + lint affected files |
| `test` command | Tests | Run relevant tests |

**Implementation Approach:**
```json
// .claude-plugin/plugin.json
{
  "hooks": {
    "UserPromptSubmit": [
      {"type": "command", "command": "devac status --inject"}
    ],
    "Stop": [
      {"type": "command", "command": "devac validate --quick --on-stop"}
    ]
  }
}
```

Plus git hooks:
```bash
# .git/hooks/pre-commit
devac validate --quick --staged

# .git/hooks/pre-push
devac validate --full
```

---

### Concept 5: Autonomous Context Creation

**From Personal Assistant:**
- Session context built from conversation
- Rules captured from corrections
- No permission-seeking for updates

**For DevAC:**
```typescript
// Build context from code changes automatically
interface SessionContext {
  editedFiles: string[];
  newErrors: DiagnosticItem[];
  fixedErrors: DiagnosticItem[];
  relatedSymbols: Symbol[];
  affectedTests: string[];
}

// On session start or file change
function buildSessionContext(changedFiles: string[]): SessionContext {
  const affected = getAffectedFiles(changedFiles);
  const diagnostics = runQuickValidation(affected);
  const symbols = getFileSymbols(changedFiles);
  const tests = getRelatedTests(changedFiles);

  return {
    editedFiles: changedFiles,
    newErrors: diagnostics.filter(d => d.isNew),
    fixedErrors: diagnostics.filter(d => d.isFixed),
    relatedSymbols: symbols,
    affectedTests: tests
  };
}
```

---

### Concept 6: Self-Improvement via Pattern Capture

**From Personal Assistant:**
```markdown
# rules.md - checked FIRST
❌ NEVER commit without explicit approval
✅ ALWAYS run tests before suggesting fixes
```

**For DevAC - Capture Fix Patterns:**
```markdown
# .devac/patterns.md - learned from fixes

## Common Fix Patterns

### TS2345: Argument Type Mismatch
When you see: `Argument of type 'X' is not assignable to parameter of type 'Y'`
Check for:
1. Missing null check (if Y doesn't include null)
2. Wrong import (different type with same name)
3. Generic type parameter needed

### ESLint: no-unused-vars
Patterns that work:
1. If parameter required by interface → prefix with `_`
2. If import for type only → use `import type`
3. If destructuring → use rest pattern `{used, ...rest}`
```

**Auto-capture:** When Claude successfully fixes an issue, offer to capture the pattern.

---

## Part 4: Recommended Implementation

### User Preferences (from clarification)
- **Stop behavior:** Solve diagnostics until none (not block, not just notify)
- **Injection scope:** Every message if issues exist
- **Hook runtime:** TypeScript (devac CLI)

---

### Phase 1: Add Hooks to DevAC Plugin

**Create:** `plugins/devac/hooks/hooks.json`
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "devac status --inject"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "devac validate --on-stop"
      }]
    }]
  }
}
```

**Note:** Uses `devac` CLI directly (TypeScript). No Python wrapper needed.

---

### Phase 2: Add CLI Commands for Hooks

**File:** `packages/devac-cli/src/commands/status.ts`

Add `--inject` flag that outputs hook-compatible JSON:

```typescript
// devac status --inject
// Queries hub for diagnostic counts, outputs additionalContext

async function statusInject(): Promise<void> {
  const counts = await hub.getValidationCounts();

  if (counts.errors === 0 && counts.warnings === 0) {
    // No output = no injection
    return;
  }

  const context = `<system-reminder>
## DevAC Diagnostics Status

**Current Issues:** ${counts.errors} errors, ${counts.warnings} warnings

When working on code:
- Use \`get_diagnostics_summary(groupBy: "file")\` to see affected files
- Use \`get_all_diagnostics(severity: ["error"])\` for details
- After edits, run \`devac validate --quick\` to verify

Address diagnostics when they affect your current task.
</system-reminder>`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context
    }
  }));
}
```

**File:** `packages/devac-cli/src/commands/validate.ts`

Add `--on-stop` flag that runs validation and outputs resolution instructions:

```typescript
// devac validate --on-stop
// Runs quick validation, outputs instructions to resolve

async function validateOnStop(): Promise<void> {
  // Run quick validation on recently edited files
  const result = await runQuickValidation();

  if (result.errors.length === 0) {
    // Clean - no output
    return;
  }

  // Build resolution instructions
  const errorList = result.errors
    .slice(0, 5)  // Top 5 for brevity
    .map(e => `- ${e.file}:${e.line} - ${e.code}: ${e.message}`)
    .join("\n");

  const context = `<system-reminder>
## Validation Issues Detected

Before completing, please resolve these issues:

**Errors (${result.errors.length}):**
${errorList}
${result.errors.length > 5 ? `\n... and ${result.errors.length - 5} more` : ""}

**Resolution approach:**
1. Use \`get_all_diagnostics(severity: ["error"])\` for full details
2. Fix each error in the affected files
3. Run \`devac validate --quick\` to verify fixes
4. Continue fixing until no errors remain

If any issues are intentional, explain why and proceed.
</system-reminder>`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: context
    }
  }));
}
```

---

### Phase 3: Progressive Disclosure in MCP Tools

**File:** `packages/devac-mcp/src/tools/diagnostics.ts`

Add `level` parameter to `get_all_diagnostics`:

```typescript
interface GetAllDiagnosticsParams {
  // ... existing params
  level?: "counts" | "summary" | "details";  // NEW
}

// level: "counts" → { errors: 5, warnings: 12 }
// level: "summary" → grouped by file with counts
// level: "details" → full diagnostic info (current behavior)
```

---

### Phase 4: Update diagnostics-triage Skill

**File:** `plugins/devac/skills/diagnostics-triage/SKILL.md`

Add section about hook-injected context:

```markdown
## Automatic Context Injection

When the DevAC plugin is active, diagnostic status is automatically injected:

- **On every message:** If errors/warnings exist, you'll see a DevAC status reminder
- **On stop:** If validation issues exist, you'll receive resolution instructions

When you see these reminders, use the suggested MCP tools to investigate and resolve.
```

---

## Key Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `plugins/devac/hooks/hooks.json` | **Create** | Register Claude Code hooks |
| `packages/devac-cli/src/commands/status.ts` | **Modify** | Add `--inject` flag |
| `packages/devac-cli/src/commands/validate.ts` | **Modify** | Add `--on-stop` flag |
| `packages/devac-mcp/src/tools/diagnostics.ts` | **Modify** | Add `level` parameter |
| `plugins/devac/skills/diagnostics-triage/SKILL.md` | **Modify** | Document auto-injection |

---

## Comparison: Personal Assistant vs. DevAC Approach

| Aspect | Personal Assistant | DevAC (Recommended) |
|--------|-------------------|---------------------|
| **Runtime** | Python (`uv run`) | TypeScript (`devac`) |
| **Context Source** | File-based (`~/.claude/.context/`) | Hub-based (DuckDB) |
| **Injection Trigger** | Every message | Every message (if issues) |
| **Stop Behavior** | Non-blocking (sound only) | Non-blocking (resolution instructions) |
| **Resolution** | Manual context updates | Auto-fix loop until clean |
| **Progressive Disclosure** | 3 levels in instructions | 3 levels via MCP param |

---

## Verification

After implementation, test:

1. **UserPromptSubmit hook:**
   - Introduce a TypeScript error
   - Start a new Claude Code session
   - Verify status reminder appears in context

2. **Stop hook:**
   - Edit a file introducing an error
   - Complete a response
   - Verify resolution instructions appear
   - Fix the error, verify instructions stop appearing

3. **Progressive disclosure:**
   - Call `get_all_diagnostics(level: "counts")` - verify minimal output
   - Call `get_all_diagnostics(level: "summary")` - verify grouped output
   - Call `get_all_diagnostics(level: "details")` - verify full output

---

## Summary

The personal-assistant plugin demonstrates several elegant patterns that can improve DevAC:

1. **Hook for input, instructions for output** - Inject diagnostic status automatically, let Claude decide when to act
2. **Non-blocking resolution loop** - Stop hook triggers fixing until clean, not blocking
3. **Progressive disclosure** - Summary always, details on demand
4. **Native tooling** - Use `devac` CLI directly in hooks (TypeScript)
5. **Leverage existing infrastructure** - Hub already has diagnostic data, just expose it earlier

**Key Insight:** The personal-assistant's power comes from *reliable context injection* combined with *intelligent instruction-following*. DevAC already has the intelligence (MCP tools, skills) - it just needs the reliable injection via hooks to enable the "solve until none" workflow.
