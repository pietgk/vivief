---
description: Query DevAC status across all Four Pillars and the Analytics Layer
---

# DevAC Status Command

Query unified status across all Four Pillars (Infra, Validators, Extractors, Workflow) and the Analytics Layer.

## What This Command Does

This command provides a comprehensive view of the DevAC ecosystem health:

1. **Infra Pillar (DevAC Health)**
   - Hub initialization status
   - Connected repositories
   - Database health

2. **Validators Pillar (Diagnostics)**
   - TypeScript errors
   - ESLint warnings
   - Test failures

3. **Extractors Pillar (Seeds)**
   - Indexed symbols
   - Call graph completeness
   - Last analysis timestamp

4. **Workflow Pillar (Work Activity)**
   - Current branch status
   - Uncommitted changes
   - Active issues

## Instructions

Use the DevAC MCP tools to gather status from each pillar:

### Step 1: Check Hub Status (Infra)
Use `get_context` to verify the hub is initialized and list connected repos with `list_repos`.

### Step 2: Check Diagnostics (Validators)
Use `get_diagnostics_summary` to get an overview of current issues across the workspace.

### Step 3: Check Seeds (Extractors)
Use `query_sql` to check the health of the Seeds database:
```sql
SELECT 
  (SELECT COUNT(*) FROM symbols) as total_symbols,
  (SELECT COUNT(*) FROM files) as total_files,
  (SELECT MAX(updated_at) FROM files) as last_updated
```

### Step 4: Check Git Status (Workflow)
Run `git status` to check current work activity.

## Output Format

Present the status in a structured format:

```
DevAC Status Report
==================

INFRA (DevAC Health)
  Hub: [initialized/not initialized]
  Repos: [count] connected
  
VALIDATORS (Diagnostics)  
  Errors: [count]
  Warnings: [count]
  
EXTRACTORS (Seeds)
  Symbols: [count]
  Files: [count]
  Last updated: [timestamp]
  
WORKFLOW (Work Activity)
  Branch: [name]
  Changes: [count] uncommitted
  
ANALYTICS LAYER
  Ready: [yes/no - based on all pillars healthy]
```

## Notes

- If hub is not initialized, guide user to run `devac hub init`
- If diagnostics are high, suggest running `/devac-triage`
- If Seeds are stale, suggest re-running `devac analyze`
