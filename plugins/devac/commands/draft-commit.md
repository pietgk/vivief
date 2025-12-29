# /devac:draft-commit - Draft a Commit Message

You are helping the user draft a commit message only, without checking for changesets or ADRs.

This is a lightweight version of `/devac:commit` for quick commit message generation.

## Steps

### 1. Check for staged changes

```bash
git diff --cached --stat
```

If nothing is staged, inform the user.

### 2. Analyze the changes

```bash
git diff --cached
```

Consider:
- What type of change is this?
- Which package(s) are affected?
- What is the main purpose?

### 3. Draft the commit message

Follow conventional commit format:

```
type(scope): description

[optional body with more details]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Adding/updating tests
- `chore` - Maintenance tasks

## Example Output

```
## Suggested Commit Message

```
fix(core): handle empty package.json gracefully

- Add null check before accessing package.json fields
- Return empty array instead of throwing for missing dependencies
```

---

To use this message:
```bash
git commit -m "fix(core): handle empty package.json gracefully"
```

Or copy and modify as needed.
```

## When to Use

Use `/devac:draft-commit` when:
- You just need a quick commit message
- You'll handle changesets/ADRs separately
- You're making a minor change that doesn't need the full workflow
