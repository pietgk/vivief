---
description: Set up DevAC for this workspace. Run once after installing the plugin.
---

# DevAC Setup

Set up the DevAC plugin with hooks and hub registration.

## Step 1: Check Prerequisites

Verify DevAC CLI is installed:
```bash
devac --version
```

If the command fails, DevAC needs to be installed:
```bash
npm install -g @pietgk/devac-cli
```

## Step 2: Initialize Hub

The central hub stores cross-repository data for federated queries:
```bash
devac hub init
```

This creates `~/.devac/central.duckdb` if it doesn't exist.

## Step 3: Enable Hooks (Development Mode)

Symlink the plugin cache to the local plugin for immediate hook access:
```bash
devac workflow plugin-dev
```

**Note:** This enables validation hooks that:
- Inject diagnostic status on every message (UserPromptSubmit)
- Run quick validation on session end (Stop)

After running this, **restart Claude Code** to load the hooks.

## Step 4: Analyze Repository

Generate seed data for the current repository:
```bash
devac analyze .
```

**Note:** Repositories with seeds are automatically discovered and available for hub queries - no explicit registration needed.

## Step 5: Verify Setup

Check that everything is working:
```bash
# Check hub status
devac hub status

# Test status injection (should show diagnostic counts if any issues exist)
devac status --inject

# Check hooks are available
ls -la ~/.claude/plugins/cache/vivief/devac/*/hooks/hooks.json
```

## What Gets Configured

| Component | Location | Purpose |
|-----------|----------|---------|
| **Hub** | `~/.devac/central.duckdb` | Cross-repo query federation |
| **Seeds** | `.devac/seed/` per repo | Package-level analysis data |
| **Hooks** | Plugin cache (symlinked) | Validation triggers |
| **Plugin** | `~/.claude/plugins/cache/vivief/devac/` | Symlinked to local for dev |

## After Setup

### Automatic Behaviors (via hooks)

- **UserPromptSubmit**: If validation errors exist, diagnostic counts are injected as `<system-reminder>`
- **Stop**: Quick validation runs on changed files with resolution instructions

### When You See Validation Errors

1. Use `get_diagnostics_summary(groupBy: "file")` to see affected files
2. Use `get_all_diagnostics(severity: ["error"])` for details
3. Fix errors - continue until all are resolved ("solve until none")
4. Run `devac validate --mode quick` to verify fixes

### Available Commands

- `/devac:status` - Check current DevAC state
- `/devac:plans` - Manage plan files
- `/devac:ship` - Ship changes (PR workflow)
- `/devac:commit` - Commit with validation

## Troubleshooting

### Hooks not triggering

1. Check that plugin-dev symlink is active:
   ```bash
   ls -la ~/.claude/plugins/cache/vivief/devac/
   # Should show symlink → local plugin path
   ```

2. Restart Claude Code to reload hooks

3. Verify hooks.json exists:
   ```bash
   cat ~/.claude/plugins/cache/vivief/devac/*/hooks/hooks.json
   ```

### Hub not connecting

1. Check if MCP is running (it owns the hub exclusively):
   ```bash
   ls ~/.devac/mcp.sock
   ```

2. If MCP is running, CLI uses IPC automatically

### No diagnostics showing

1. Ensure repository has been analyzed:
   ```bash
   devac analyze .
   ```

2. Run validation to populate diagnostics:
   ```bash
   devac validate --mode full
   ```

---

*DevAC Setup complete. Validation hooks will automatically track code quality.*
