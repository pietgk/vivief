# /devac:ship - Complete Ship Flow

You are helping the user ship their changes: validate, commit (if needed), push, and create a pull request.

## Workflow Overview

This workflow uses deterministic CLI commands for validation and structured data, while you handle reasoning and drafting.

## Steps

### 1. Run prepare-ship validation

```bash
devac workflow prepare-ship --json
```

This returns:
- `ready`: Whether ready to ship (no blockers)
- `blockers`: Any blocking issues
- `suggestions`: Non-blocking recommendations
- `branch`: Current branch name
- `defaultBranch`: Target branch (main/master)
- `isDefaultBranch`: Whether on default branch (blocker if true)
- `hasUncommittedChanges`: Whether there are uncommitted changes
- `validation.typecheck.passed`: Typecheck status
- `validation.lint.passed`: Lint status
- `validation.test.passed`: Test status
- `validation.build.passed`: Build status
- `changeset.needed`: Whether changeset is required
- `changeset.exists`: Whether changeset exists

**If not ready**: Present blockers to user and help resolve them.

**If on default branch**: User needs to create a feature branch first.

### 2. Handle uncommitted changes

If `hasUncommittedChanges` is true:

Run the commit flow first:

```bash
devac workflow pre-commit --json
```

Then get diff context:

```bash
devac workflow diff-summary --staged --include-content --json
```

Draft and execute commit as in `/devac:commit`.

### 2.5. Documentation Check (Soft Block)

After handling any uncommitted changes, run documentation validation:

```bash
devac workflow check-docs --json
```

This returns:
- `ready`: Whether documentation is in good state
- `issues`: Array of documentation issues found
- `suggestions`: Non-blocking recommendations
- `adr.indexInSync`: Whether ADR index matches files on disk
- `adr.missingFromIndex`: ADR files not listed in README
- `adr.missingFromDisk`: Index entries with no file
- `adr.formatIssues`: ADRs missing required sections
- `packageReadmes.packagesMissingReadme`: Packages with src/ changes but no README
- `changedFiles`, `docsChanged`, `sourceChanged`: Context for reasoning

**If issues found:**

Present issues clearly to user:

```
## Documentation Check

I found [N] documentation issues:

1. **[Issue Type]**
   - [Details]

2. **[Issue Type]**
   - [Details]
```

**Then reason about documentation needs:**

Based on the changes (from `changedFiles` and `sourceChanged`), analyze:
1. Do code changes warrant new ADRs? (Look for architectural patterns, new dependencies, new modules)
2. Should existing docs be updated? (API changes → api-reference.md, CLI changes → cli-reference.md)
3. Are existing ADRs still accurate given the changes?

Present as suggestions:
```
**Suggestions based on your changes:**
- Consider updating docs/implementation/[relevant-doc].md
- The changes to [area] might warrant an ADR

Would you like to **fix** these first, or **proceed** anyway?
```

**Soft block handling:**
- If user says "proceed", "skip", or "continue" → continue with ship flow
- If user says "fix" → help address the issues before continuing

### 3. Push to remote

```bash
git push -u origin HEAD
```

### 4. Get diff summary for PR description

```bash
devac workflow diff-summary --include-content --json
```

This returns all changes since the base branch, which you'll use to draft the PR description.

### 5. Create pull request

Using `gh pr create`:

```bash
gh pr create --title "type(scope): description" --body "$(cat <<'EOF'
## Summary

[1-3 bullet points summarizing changes]

## Changes

[List key changes by package/file]

## Test Plan

- [ ] Tests pass
- [ ] Manual testing completed
- [ ] Changeset included (if applicable)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 6. Summary

Provide:
- PR URL
- Summary of what was shipped
- Any follow-up actions needed

## Example Flow

```
User: /devac:ship

Claude: Let me run pre-ship validation...

[Runs: devac workflow prepare-ship --json]

✓ All validations passed
  - Branch: feat/add-workflow-commands
  - Typecheck: pass
  - Lint: pass
  - Tests: pass
  - Build: pass
  - Changeset: exists

⚠️ You have uncommitted changes. Let me commit them first...

[Runs commit flow]

Committed: feat(cli): add workflow commands

[Runs: devac workflow check-docs --json]

✓ Documentation check passed
  - ADR index: in sync (22 ADRs)
  - Package READMEs: all present

[Runs: git push -u origin HEAD]

Pushed to origin/feat/add-workflow-commands

[Runs: devac workflow diff-summary --include-content --json]

Creating PR...

[Runs: gh pr create]

✅ PR created: https://github.com/org/repo/pull/123

## Summary
- Branch: feat/add-workflow-commands
- Commits: 3
- Changeset: @pietgk/devac-cli (minor)
- PR: #123
```

## When to Use

Use `/devac:ship` when:
- You're ready to ship changes and open a PR
- You want the complete guided workflow
- Your feature or fix is complete

## Notes

- This command executes git commands (commit, push) and creates a PR
- Review outputs before confirming
- Uses `gh` CLI for PR creation - ensure you're authenticated
