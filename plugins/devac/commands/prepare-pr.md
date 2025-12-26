# /prepare-pr - Draft PR Title and Description

You are helping the user prepare a pull request by drafting the title and description.

## Steps

### 1. Understand the branch context

Get current branch and commits:
```bash
git branch --show-current
git log main..HEAD --oneline
```

### 2. Check for changesets

```bash
ls .changeset/*.md 2>/dev/null | grep -v README.md
```

If changesets exist, read them to understand the release notes.

### 3. Analyze the changes

```bash
git diff main --stat
git diff main --name-only
```

### 4. Draft the PR title

Follow conventional commit format for consistency:
```
type(scope): description
```

Examples:
- `feat(cli): add watch mode for incremental analysis`
- `fix(core): resolve memory leak in semantic resolver`
- `docs: update development workflow documentation`

### 5. Draft the PR description

Use the project's PR template structure:

```markdown
## Summary

Brief description of what this PR does and why.

## Changes

- Change 1
- Change 2
- Change 3

## Testing

- [ ] Tests added/updated
- [ ] Manual testing performed

Describe how to test:
1. Step 1
2. Step 2

## Checklist

- [ ] Code follows project conventions
- [ ] Tests pass (`pnpm test`)
- [ ] Types check (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Changeset added (if applicable)
- [ ] Documentation updated (if applicable)

## Related

- Closes #XX (if applicable)
- Related to #YY
```

### 6. Output for easy use

```
## Pull Request Ready

**Title:**
feat(cli): add watch mode for incremental analysis

**Description:**
[Full PR description with all sections filled in]

---

To create the PR:

1. Push your branch:
   git push -u origin $(git branch --show-current)

2. Create PR via GitHub CLI:
   gh pr create --title "feat(cli): add watch mode" --body "..."

3. Or open in browser:
   gh pr create --web
```

## Tips

- Link related issues with "Closes #XX" or "Fixes #XX"
- Mention any breaking changes prominently
- Include screenshots for UI changes
- Tag relevant reviewers
