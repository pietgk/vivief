# /start-issue-on-new-worktree - Start Working on an Issue in a New Worktree

You are helping the user start work on an existing GitHub issue using git worktrees for isolation.

## Usage

The user provides an issue reference:
```
/start-issue-on-new-worktree #42
/start-issue-on-new-worktree 42
/start-issue-on-new-worktree https://github.com/pietgk/vivief/issues/42
```

If no issue number is provided, ask the user which issue they want to work on.

## Why Worktrees?

Git worktrees allow working on multiple branches simultaneously in separate directories. Benefits:
- No need to stash/commit changes when switching issues
- Each issue has its own isolated working directory
- Can run tests/builds in one worktree while editing another
- Easy to clean up when the issue is fully resolved

## Steps

### 1. Fetch the Issue

Extract the issue number and fetch details:

```bash
gh issue view <number> --json number,title,body,labels,state
```

If the issue doesn't exist or is closed, inform the user.

### 2. Parse and Present

Extract from the issue body:
- **Description**: What needs to be done
- **Context**: Current state (if provided)
- **Acceptance Criteria**: Success conditions
- **Affected Packages**: Which packages are involved
- **Constraints**: Changeset, ADR, breaking change requirements
- **Open Questions**: Any unresolved questions

Present a summary:

```markdown
## Issue #<number>: <title>

**Description:** <summary>

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Affected Packages:** devac-core, devac-cli

**Constraints:**
- Changeset required: Yes/No
- ADR required: Yes/No
- Breaking change: Yes/No

**Open Questions:**
- <any questions from issue>
```

### 3. Determine Worktree Location

Worktrees will be created as sibling directories to the main repository:

```
parent-directory/
├── vivief/                    # Main repository (current)
├── vivief-42-add-python/      # Worktree for issue #42
├── vivief-15-fix-memory/      # Worktree for issue #15
└── ...
```

Calculate the worktree path:
```bash
# Get repo root and parent directory
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")
WORKTREE_DIR="$PARENT_DIR/${REPO_NAME}-<issue-number>-<short-description>"
```

### 4. Check for Existing Worktrees

```bash
git worktree list
```

If a worktree for this issue already exists:
```
A worktree for issue #<number> already exists at:
<path>

Would you like to:
1. Use the existing worktree (cd to it)
2. Remove it and create a fresh one
3. Cancel
```

### 5. Update Main Branch

Before creating the worktree, ensure main is up to date:

```bash
git fetch origin main:main
```

Note: This updates the local main branch without checking it out.

### 6. Create the Worktree

```bash
# Create worktree with new branch based on main
git worktree add -b <branch-name> <worktree-path> main
```

Branch naming:
- Use issue number as prefix
- Add kebab-case description (max 3-4 words)
- Examples: `42-add-python-parser`, `15-fix-memory-leak`

Worktree directory naming:
- Format: `<repo-name>-<issue-number>-<short-description>`
- Examples: `vivief-42-add-python`, `vivief-15-fix-memory`

### 7. Verify Worktree Creation

```bash
# List worktrees to confirm
git worktree list

# Show the new worktree path
echo "Worktree created at: <worktree-path>"
```

### 8. Install Dependencies (if needed)

Inform the user they may need to install dependencies in the new worktree:

```bash
cd <worktree-path>
pnpm install
```

### 9. Explore and Plan

Based on the issue content, explore the codebase to understand:
- Where changes need to be made
- Existing patterns to follow
- Related code that might be affected

Propose an implementation plan:

```markdown
## Implementation Plan for Issue #<number>

### Context
[What you discovered about the current codebase state]

### Proposed Approach

1. **<Step 1>**
   - Files: `path/to/file.ts`
   - Changes: <description>

2. **<Step 2>**
   - Files: `path/to/file.ts`
   - Changes: <description>

3. **<Step 3>**
   - Files: `path/to/file.ts`
   - Changes: <description>

### Testing Strategy
- <How to verify the changes>

### Checklist
- [ ] Implementation complete
- [ ] Tests added/updated
- [ ] Changeset created (if required)
- [ ] ADR created (if required)
- [ ] Documentation updated

### Questions
- <Any questions that arose during exploration>
```

### 10. Provide Next Steps

```markdown
## Worktree Ready

**Worktree created at:** `<worktree-path>`
**Branch:** `<branch-name>`

### To start working:
```bash
cd <worktree-path>
pnpm install  # If dependencies need installing
```

### When finished with the issue:

After your PR is merged, clean up the worktree:
```bash
# From any directory
git worktree remove <worktree-path>

# Or if you want to force removal (unclean worktree)
git worktree remove --force <worktree-path>

# Optionally delete the branch if not needed
git branch -d <branch-name>
```

### Useful worktree commands:
```bash
# List all worktrees
git worktree list

# Prune stale worktree references
git worktree prune
```
```

### 11. Wait for Approval

Ask the user:
```
I've created worktree at `<worktree-path>` with branch `<branch-name>`.

Would you like me to:
1. Change to the worktree directory and proceed with implementation
2. Just provide the plan and let you navigate there manually
```

## Example Flow

```
User: /start-issue-on-new-worktree 42

Claude: Fetching issue #42...

## Issue #42: Add Python AST Parser

**Description:** Implement Python parsing using tree-sitter to extract functions,
classes, and imports from Python files.

**Acceptance Criteria:**
- [ ] Parse function definitions with parameters
- [ ] Parse class declarations with methods
- [ ] Parse import statements (import, from...import)
- [ ] Integrate with existing analysis pipeline

**Affected Packages:** devac-core

**Constraints:**
- Changeset required: Yes
- ADR required: Maybe (new parser architecture)
- Breaking change: No

**Open Questions:**
- Should we support Python 2 syntax?

---

Updating main branch and creating worktree...

```bash
git fetch origin main:main
git worktree add -b 42-add-python-parser ../vivief-42-add-python main
```

## Worktree Ready

**Worktree created at:** `/Users/grop/ws/vivief-42-add-python`
**Branch:** `42-add-python-parser`

Let me explore the codebase to understand the existing parser patterns...

[Explores codebase]

## Implementation Plan for Issue #42

### Context
The TypeScript parser is in `packages/devac-core/src/parsers/typescript-parser.ts`
and uses ts-morph. Python would follow a similar pattern but use tree-sitter-python.

### Proposed Approach

1. **Add tree-sitter-python dependency**
   - Files: `packages/devac-core/package.json`
   - Add `tree-sitter-python` package

2. **Create Python parser module**
   - Files: `packages/devac-core/src/parsers/python-parser.ts`
   - Implement parser following TypeScript parser pattern

3. **Register parser in factory**
   - Files: `packages/devac-core/src/parsers/index.ts`
   - Add Python to parser factory

4. **Add tests**
   - Files: `packages/devac-core/__tests__/parsers/python-parser.test.ts`
   - Test function, class, and import extraction

### Testing Strategy
- Unit tests with Python code samples
- Integration test with sample Python package

### Checklist
- [ ] Implementation complete
- [ ] Tests added
- [ ] Changeset created
- [ ] ADR considered (probably not needed - follows existing pattern)

---

### When finished:
```bash
# After PR is merged, clean up:
git worktree remove ../vivief-42-add-python
git branch -d 42-add-python-parser
```

---

Would you like me to change to the worktree and proceed with implementation?
```

## Notes

- Worktrees share the same `.git` directory, so commits are visible across all worktrees
- Always fetch the latest main before creating the worktree
- If the issue has open questions, consider asking the user before starting
- If constraints aren't clear from the issue, ask the user
- For complex issues, break down into smaller steps in the plan
- Remind users to clean up worktrees after PRs are merged to avoid clutter
- Each worktree needs its own `node_modules`, so `pnpm install` is required
