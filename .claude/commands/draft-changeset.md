# /draft-changeset - Create a Changeset

You are helping the user create a changeset file for version management and changelog generation.

## What is a Changeset?

Changesets track version bumps and changelog entries for packages. When changes are released, changesets are consumed to:
- Bump package versions appropriately
- Generate CHANGELOG.md entries
- Create a release PR

## Steps

### 1. Analyze what changed

Check which packages have changes:
```bash
git diff --cached --name-only | grep -E "^packages/" | cut -d'/' -f2 | sort -u
```

Or for already committed changes:
```bash
git diff main --name-only | grep -E "^packages/" | cut -d'/' -f2 | sort -u
```

### 2. Determine version bump type

Ask the user about the nature of the changes:

| Bump Type | When to Use |
|-----------|-------------|
| **patch** | Bug fixes, internal changes, documentation |
| **minor** | New features, non-breaking additions |
| **major** | Breaking changes to public API |

### 3. Draft the changelog entry

Write a user-facing description of the changes. This should:
- Be written for package consumers
- Explain what changed and why it matters
- Include migration notes for breaking changes

### 4. Generate a unique filename

Changesets uses random word combinations. Generate one:
```bash
# Example format: adjective-noun-verb.md
# e.g., cool-pandas-dance.md, fuzzy-lions-jump.md
```

### 5. Create the changeset file

```bash
cat > .changeset/<filename>.md << 'EOF'
---
"@devac/core": patch
"@devac/cli": patch
---

Brief description of the changes for the changelog.

- Detail 1
- Detail 2
EOF
```

### 6. Stage the changeset

```bash
git add .changeset/
```

## Example Output

```
## Changeset Created

**File:** .changeset/happy-tigers-run.md

**Contents:**
---
"@devac/cli": minor
---

Add watch mode for incremental analysis

- New `--watch` flag for the analyze command
- Automatically re-analyzes when files change
- Debounces rapid changes for efficiency

---

The changeset has been staged. It will be included in your next commit.
```

## Version Bump Guidelines for vivief

- **patch**: Bug fixes, performance improvements, internal refactoring
- **minor**: New commands, new options, new features
- **major**: Changes to output format, removed commands, breaking API changes
