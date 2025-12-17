# ADR-0012: Claude-Assisted Slash Commands

## Status

Accepted

## Context

When working with Claude Code, developers frequently perform repetitive workflows:
- Drafting commit messages following conventional commit format
- Creating changesets for version management
- Writing ADRs for architectural decisions
- Preparing PR descriptions

Without guidance, Claude may approach these tasks inconsistently, miss important steps (like checking if a changeset is needed), or produce output in varying formats. Developers end up re-explaining the same workflows repeatedly.

Additionally, the project uses conventional commits enforced by a commit-msg hook, and developers need assistance producing correctly formatted messages.

## Decision

Create a set of slash command templates in `.claude/commands/` that guide Claude through standardized workflows:

| Command | Purpose |
|---------|---------|
| `/commit` | Full commit flow with changeset/ADR checks |
| `/prepare-commit` | Same as /commit but stops before executing |
| `/draft-commit` | Draft only the commit message |
| `/draft-changeset` | Create a changeset file |
| `/draft-adr` | Create an Architecture Decision Record |
| `/prepare-pr` | Draft PR title and description |
| `/ship` | Complete flow: commit → push → prepare PR |

Each command is a markdown file that:
1. Explains its purpose to Claude
2. Lists the steps to follow
3. Provides templates for output
4. Includes examples

## Consequences

### Positive

- Consistent workflows regardless of which developer invokes them
- Reduces cognitive load - developers don't need to remember all steps
- Self-documenting - the command files serve as workflow documentation
- Composable - commands can reference each other (e.g., `/ship` uses `/commit` flow)
- Enforces project conventions (conventional commits, changeset format, ADR template)

### Negative

- Maintenance burden - commands need updating if workflows change
- Learning curve - developers need to discover and learn available commands
- Claude Code specific - doesn't help developers using other AI assistants

### Neutral

- Commands are suggestions, not enforcement - developers can still work manually
- May evolve as we learn what works best

## References

- [Claude Code Slash Commands Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [ADR-0011: Development Workflow](0011-development-workflow.md)
