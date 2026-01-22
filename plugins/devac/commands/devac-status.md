# /devac:devac-status - Query DevAC Status

Run `devac status` to get a unified view of all Four Pillars.

## Command

```bash
devac status              # Summary status (1-line, default)
devac status --level brief # Sectioned output with key metrics
devac status --level full # Detailed status with all sections
devac status --cached     # Skip live CI fetch (faster, uses hub cache)
devac status --sync       # Sync CI results to hub after gathering
```

## Output Sections

The status command shows all Four Pillars plus suggested next steps:

| Section | Pillar | Description |
|---------|--------|-------------|
| Context | - | Current directory, workspace, branch, issue |
| DevAC Health | Infrastructure | Hub connection, watch status, registered repos |
| Seeds | Extractors | Analysis status per repo/package |
| Diagnostics | Validators | Type errors, lint issues, test failures |
| Workflow | Workflow | Live CI status from GitHub (PRs, checks) |
| Next | - | Suggested actions based on current state |

## Interpreting the Output

### Workflow Status Icons
- `✓` passing - All CI checks pass
- `✗` failing - One or more checks failed
- `⏳` pending - Checks still running
- `○` no-pr - No open PR for this branch
- `?` unknown - Could not determine status

### Diagnostics Format
- `tsc:5e/2w` = 5 TypeScript errors, 2 warnings
- `lint:0e/3w` = 0 lint errors, 3 warnings
- `test:failing` = Tests are failing

### Next Steps Priority
1. CI failures (blocking merges)
2. Type errors (blocking builds)
3. Lint errors
4. Test failures
5. Warnings
6. Setup tasks (hub init, watch start)

## When to Use

- Starting a work session
- Before committing/pushing
- After switching branches
- Checking if CI passed
- Getting an overview of project health
