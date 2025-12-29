# /devac:prepare-pr - Draft PR Title and Description

You are helping the user prepare a pull request title and description.

## Steps

### 1. Gather context

Check the branch and commits:

```bash
# Current branch
git branch --show-current

# Commits since main
git log main..HEAD --oneline

# Changed files
git diff main --name-only
```

### 2. Check for related issue

Look for issue number in branch name (e.g., `42-add-feature`):

```bash
# Extract issue number from branch name
git branch --show-current | grep -oE '^[0-9]+'
```

### 3. Draft PR title

Create a concise, descriptive title:
- Start with type if appropriate (feat, fix, etc.)
- Reference issue number if applicable
- Keep under 72 characters

### 4. Draft PR description

Use the PR template structure:

```markdown
## Description

[Brief description of what this PR does]

## Related Issue

Closes #[issue-number]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Checklist

- [ ] Tests pass locally
- [ ] Code follows project conventions
- [ ] Changeset added (if applicable)
- [ ] Documentation updated (if applicable)
```

### 5. Check for changesets

```bash
ls .changeset/*.md 2>/dev/null | grep -v README
```

Note if changesets are present for the release.

## Example Output

```
## PR Ready

**Title:** feat(cli): add watch mode for incremental analysis (#42)

**Description:**

## Description

Adds a `--watch` flag to the analyze command that monitors file changes and re-analyzes incrementally.

## Related Issue

Closes #42

## Type of Change

- [x] New feature

## Checklist

- [x] Tests pass locally
- [x] Code follows project conventions
- [x] Changeset added

---

To create the PR:
```bash
gh pr create --title "feat(cli): add watch mode for incremental analysis (#42)" --body "[paste description]"
```
```

## When to Use

Use `/devac:prepare-pr` when:
- You're ready to open a pull request
- You want to draft the PR description before creating
- You need to ensure all checklist items are complete
