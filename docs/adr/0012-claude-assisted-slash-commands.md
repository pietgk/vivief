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

Create a set of slash command templates in the DevAC plugin (`plugins/devac/commands/`) that guide Claude through standardized workflows. Commands use the `devac:` namespace prefix (standard Claude Code plugin approach):

| Command | Purpose |
|---------|---------|
| `/devac:commit` | Full commit flow with changeset/ADR checks |
| `/devac:prepare-commit` | Same as /commit but stops before executing |
| `/devac:draft-commit` | Draft only the commit message |
| `/devac:draft-changeset` | Create a changeset file |
| `/devac:draft-adr` | Create an Architecture Decision Record |
| `/devac:prepare-pr` | Draft PR title and description |
| `/devac:ship` | Complete flow: commit → push → prepare PR |
| `/devac:issue` | Create a new GitHub issue |
| `/devac:start-issue` | Start work on an existing issue |
| `/devac:start-issue-on-new-worktree` | Start issue in isolated git worktree |
| `/devac:devac-status` | Query DevAC Four Pillars status |

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

## Related: Skills (Auto-Invoked)

In addition to slash commands (user-invoked), the plugin provides **Skills** that activate automatically based on conversation context:

| Skill | Purpose |
|-------|---------|
| `code-analysis` | Analyze code structure and symbols |
| `impact-analysis` | Determine change impact |
| `codebase-navigation` | Navigate and locate code |
| `diagnostics-triage` | Triage errors and warnings |
| `multi-repo-context` | Work across repositories |

Skills complement commands by providing context-aware answers without explicit invocation.

See [vivief-workflow.md](../vivief-workflow.md#skills-auto-invoked) for details.

## References

- [Claude Code Slash Commands Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [ADR-0011: Development Workflow](0011-development-workflow.md)
