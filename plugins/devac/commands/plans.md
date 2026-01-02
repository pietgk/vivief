# /devac:plans - Manage Plan Files

You are helping the user manage their Claude plan files in ~/.claude/plans/

## Status Convention

Plans should include a status marker after the title:

```markdown
# Plan Title

> **Status: COMPLETED** (2026-01-01)
```

Valid statuses: `COMPLETED`, `IN_PROGRESS`, `PENDING`, `ABANDONED`

## Steps

### 1. List all plans

```bash
ls -la ~/.claude/plans/*.md 2>/dev/null
```

### 2. Get content of each plan

```bash
for f in ~/.claude/plans/*.md; do
  echo "=== $(basename "$f") ==="
  stat -f "%Sm" -t "%Y-%m-%d" "$f"
  head -15 "$f"
  echo "---"
done
```

### 3. Present a summary table

For each plan file, extract:
- **Title**: First `#` heading
- **Status**: Look for `> **Status:` line, or infer:
  - Contains "COMPLETED" anywhere → Completed
  - Age > 7 days with no status → Stale
  - Otherwise → Unknown
- **Last Modified**: From file stats
- **Recommendation**:
  - COMPLETED + >7 days old → "Delete"
  - IN_PROGRESS → "Continue"
  - Unknown + >7 days → "Review & decide"
  - ABANDONED → "Delete"

Show as:

```
## Plan Files Status

| # | File | Title | Modified | Status | Action |
|---|------|-------|----------|--------|--------|
| 1 | file.md | Title | Jan 2 | Status | Recommendation |
```

### 4. Offer actions

Ask user:

1. **Review** - Enter a number to read full plan content
2. **Mark complete** - Add status marker to a plan
3. **Delete** - Remove specific plans (comma-separated numbers)
4. **Bulk cleanup** - Delete all completed plans >7 days old
5. **Exit** - Done

### 5. Execute chosen action

**For deletion:**
```bash
rm ~/.claude/plans/<filename>.md
```

**For marking complete:**
- Read the file
- Add `> **Status: COMPLETED** (YYYY-MM-DD)` after the title
- Write back

**For review:**
- Read and display the full plan content

## Example Flow

```
User: /devac:plans

Claude: Let me check your plan files...

## Plan Files Status

| # | File | Title | Modified | Status |
|---|------|-------|----------|--------|
| 1 | quiet-nibbling-catmull.md | /devac:plans Command | Jan 2 | IN_PROGRESS |
| 2 | splendid-prancing-minsky.md | Effects Docs | Jan 1 | COMPLETED |
| 3 | federated-crunching-lighthouse.md | Issue #31 | Dec 29 | Unknown (5 days) |

**What would you like to do?**
1. Review a plan (enter number)
2. Mark a plan complete
3. Delete plans
4. Bulk cleanup completed >7 days
5. Exit
```
