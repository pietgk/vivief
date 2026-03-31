# ADR-0011: Development Workflow

## Status

Accepted

## Context

As the project matures, we need consistent quality gates and development practices to:
- Catch issues before they reach the main branch
- Ensure all package changes are properly documented with changesets
- Maintain a record of architectural decisions
- Standardize issue tracking and PR processes

Without these guardrails, it's easy for:
- Poorly formatted code to slip into the codebase
- Breaking changes to be released without version bumps
- Architectural decisions to be lost in conversations/PRs
- PRs to miss important checks

## Decision

Implement a comprehensive development workflow with the following components:

### 1. Local Quality Gates (Husky + lint-staged)

**Pre-commit hook:**
- Runs `lint-staged` which applies Biome formatting/linting to staged files
- Fast feedback loop - only processes changed files

**Pre-push hook:**
- Runs `pnpm typecheck` - full TypeScript validation
- Runs `pnpm test` - complete test suite
- Prevents pushing broken code

### 2. GitHub Templates

**Issue template** (`.github/ISSUE_TEMPLATE/task.yml`):
- Structured task creation with description and acceptance criteria
- Prompts for affected packages
- Checklist for changeset and ADR requirements

**PR template** (`.github/pull_request_template.md`):
- Checklist for code standards, testing, changesets
- Documentation requirements
- Links to related issues

### 3. CI Changeset Enforcement

**Changeset-check job** in GitHub Actions:
- Runs on PRs only
- Detects changes to `packages/*/src/` files
- Fails if package source changes lack a changeset
- Allows docs/CI changes without changesets

### 4. Architecture Decision Records (ADRs)

**Location:** `docs/adr/`
- Full format with Context, Decision, Status, Consequences
- Numbered sequentially (0001, 0002, etc.)
- Index maintained in README.md
- Template provided for consistency

## Consequences

### Positive

- Consistent code quality across all contributions
- No surprise breaking changes - changesets enforce documentation
- Architectural knowledge preserved in ADRs
- Faster PR reviews with standardized templates
- Issues are actionable with clear acceptance criteria

### Negative

- Additional friction for contributors (hooks, changesets)
- Initial learning curve for new team members
- Pre-push hook adds time before pushing (runs full test suite)

### Neutral

- Husky hooks can be bypassed with `--no-verify` if absolutely needed
- CI is the final enforcement layer regardless of local hooks
- ADRs require discipline to maintain

## References

- Husky: https://typicode.github.io/husky/
- lint-staged: https://github.com/lint-staged/lint-staged
- Changesets: https://github.com/changesets/changesets
- ADR format: https://adr.github.io/
