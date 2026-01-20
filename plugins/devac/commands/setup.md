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

## Step 3: Plugin Developer Mode (Optional)

This step is for DevAC contributors who want plugin changes to take effect immediately.

**First, gather status:**

1. Check for vivief repo with devac plugin:
   ```bash
   ls -d */plugins/devac/.claude-plugin 2>/dev/null || echo "NOT_FOUND"
   ```

2. Check current plugin cache mode:
   ```bash
   ls -la ~/.claude/plugins/cache/vivief/devac/1.0.0 2>/dev/null || echo "NOT_INSTALLED"
   ```

**Then display a status table to the user:**

| Check | Status |
|-------|--------|
| Vivief repo with devac plugin | ✓ Found at `<path>` / ✗ Not found |
| Plugin cache location | `~/.claude/plugins/cache/vivief/devac/1.0.0` |
| Current mode | Developer (symlink → `<target>`) / Global (directory) / Not installed |

**What each mode means:**
- **Developer mode**: Plugin changes in `vivief/plugins/devac/` take effect immediately (after restart)
- **Global mode**: Uses installed marketplace version

**If vivief repo found, ask user via AskUserQuestion:**
- "Enable developer mode" - runs `devac workflow plugin-dev --path <vivief-repo-path>`
- "Disable developer mode" - runs `devac workflow plugin-global`
- "Keep current / Skip" - no action

**If NO vivief repo found:**
Skip this step with message: "No local devac plugin source detected - skipping developer mode setup. This is normal for npm users."

**Commands to use:**
- Enable dev mode: `devac workflow plugin-dev --path <vivief-repo-path>`
- Disable dev mode: `devac workflow plugin-global`

After changing mode, **restart Claude Code** to load the hooks.

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
| **Hooks** | Plugin cache | Validation triggers |
| **Plugin** | `~/.claude/plugins/cache/vivief/devac/` | Marketplace version or symlink to local (dev mode) |

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

1. Check that the plugin is installed:
   ```bash
   ls -la ~/.claude/plugins/cache/vivief/devac/
   # Should show either a directory or symlink (if dev mode)
   ```

2. Restart Claude Code to reload hooks

3. Verify hooks.json exists:
   ```bash
   cat ~/.claude/plugins/cache/vivief/devac/*/hooks/hooks.json
   ```

### Developer mode not working

If you're a DevAC contributor and changes aren't reflected:

1. Verify dev mode is active (should be a symlink):
   ```bash
   ls -la ~/.claude/plugins/cache/vivief/devac/1.0.0
   # Should show: 1.0.0 -> /path/to/vivief/plugins/devac
   ```

2. Re-enable dev mode if needed:
   ```bash
   devac workflow plugin-dev --path /path/to/vivief
   ```

3. Restart Claude Code after enabling

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
