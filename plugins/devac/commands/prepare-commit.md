# /devac:prepare-commit - Prepare Commit Without Executing

You are helping the user prepare a commit message and related artifacts, but **not** executing the commit itself.

This is the same as `/devac:commit` but stops before running `git commit`, allowing the user to review everything first.

## Steps

Follow the same steps as `/devac:commit`:

1. **Check for staged changes** - Run `git diff --cached --stat`
2. **Analyze the changes** - Run `git diff --cached` to understand changes
3. **Draft a conventional commit message** - Following the type(scope): description format
4. **Check if changeset is needed** - Check for `packages/*/src/` modifications
5. **Check if ADR is needed** - Ask about architectural decisions

## Output

Instead of executing the commit, provide a summary:

```
## Ready to Commit

**Commit Message:**
```
feat(cli): add watch mode for incremental analysis

- Adds file watcher using chokidar
- Debounces rapid file changes
```

**Changeset:** Created (.changeset/happy-tigers-run.md)

**ADR:** Not needed

---

When ready, run:
```bash
git commit -m "feat(cli): add watch mode for incremental analysis"
```

Or use `/devac:commit` to execute with the same analysis.
```

## When to Use

Use `/devac:prepare-commit` when you want to:
- Review the commit message before executing
- Make manual adjustments to the message
- Verify changeset content before committing
- Have more control over the commit process
