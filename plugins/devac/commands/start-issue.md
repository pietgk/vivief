# /start-issue - Start Working on an Issue

You are helping the user start work on an existing GitHub issue.

## Usage

The user provides an issue reference:
```
/start-issue #42
/start-issue 42
/start-issue https://github.com/pietgk/vivief/issues/42
```

If no issue number is provided, ask the user which issue they want to work on.

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

### 3. Check Current Branch

```bash
git branch --show-current
git status --porcelain
```

If there are uncommitted changes, warn the user:
```
You have uncommitted changes. Would you like to:
1. Stash them and continue
2. Commit them first
3. Cancel
```

### 4. Create the Branch

```bash
git checkout main
git pull origin main
git checkout -b <issue-number>-<short-description>
```

Branch naming:
- Use issue number as prefix
- Add kebab-case description (max 3-4 words)
- Examples: `42-add-python-parser`, `15-fix-memory-leak`

### 5. Explore and Plan

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

### 6. Wait for Approval

Ask the user:
```
I've created branch `<branch-name>` and proposed an implementation plan above.

Would you like me to proceed with the implementation?
```

## Example Flow

```
User: /start-issue 42

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

Creating branch `42-add-python-parser`...

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

Shall I proceed with the implementation?
```

## Notes

- Always fetch the latest main before creating the branch
- If the issue has open questions, consider asking the user before starting
- If constraints aren't clear from the issue, ask the user
- For complex issues, break down into smaller steps in the plan
