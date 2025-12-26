# /issue - Create a New GitHub Issue

You are helping the user create a GitHub issue for the vivief project.

## Steps

### 1. Gather Information

Ask the user about the task. If they haven't provided details, ask:

- **What** needs to be done? (description)
- **Why** is it needed? (context - current state and motivation)
- **How** do we know it's done? (acceptance criteria)
- **Which** packages are affected? (devac-core, devac-cli, devac-mcp, docs, CI/CD)

Also determine:
- Does this require a **changeset**? (affects published package APIs/behavior)
- Does this require an **ADR**? (architectural decision)
- Is a **breaking change** allowed?
- Any **open questions** about the approach?

### 2. Draft the Issue

Format the issue body:

```markdown
## Description

[What needs to be done - clear and actionable]

## Context

[Current state and why this is needed]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Affected Packages

- [x] devac-core (if applicable)
- [x] devac-cli (if applicable)
- [x] devac-mcp (if applicable)
- [ ] Documentation
- [ ] CI/CD

## Constraints

- Changeset required: Yes/No
- ADR required: Yes/No/Maybe
- Breaking change: Yes/No

## Open Questions

1. [Question about approach, if any]
```

### 3. Show Draft and Get Approval

Present the draft to the user:

```
## Draft Issue

**Title:** [Task]: <suggested title>

**Body:**
<formatted body>

---

Does this look good? I can create it with `gh issue create`.
```

### 4. Create the Issue

After user approval, create via GitHub CLI:

```bash
gh issue create \
  --title "[Task]: <title>" \
  --body "<body>" \
  --label "task"
```

Show the created issue URL.

### 5. Offer Next Steps

After creation, ask:

```
Issue created: <URL>

Would you like to start working on this now? I can:
- Run `/start-issue #<number>` to create a branch and plan the implementation
- Or you can start later
```

## Tips for Good Issues

- **Title**: Should be actionable and specific (e.g., "Add Python AST parser" not "Python support")
- **Description**: One paragraph explaining what and why
- **Acceptance Criteria**: Testable, specific outcomes
- **Context**: Helps Claude understand the codebase state when starting work

## Example

```
User: /issue

Claude: I'll help you create a new issue. What task do you want to work on?

User: We need to add a command to list all entities in a package

Claude: Got it. Let me draft an issue for adding an entity listing command.

## Draft Issue

**Title:** [Task]: Add `devac list` command to show package entities

**Body:**

## Description

Add a new CLI command `devac list` that displays all entities (functions, classes, 
interfaces, etc.) found in a package, with options to filter by type and format output.

## Context

Currently users can analyze packages with `devac analyze` but there's no quick way to 
see what entities were discovered. Users need to query the database directly or use 
the MCP server.

## Acceptance Criteria

- [ ] `devac list <package-path>` shows all entities
- [ ] `--type` flag filters by entity kind (function, class, etc.)
- [ ] `--format` flag supports table (default) and json output
- [ ] Help text explains usage

## Affected Packages

- [ ] devac-core
- [x] devac-cli
- [ ] devac-mcp
- [ ] Documentation

## Constraints

- Changeset required: Yes (new CLI command)
- ADR required: No (follows existing command patterns)
- Breaking change: No

## Open Questions

1. Should we support filtering by file path?

---

Does this look good? I can create it now.
```
