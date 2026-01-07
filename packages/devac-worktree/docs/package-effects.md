<!--
  devac:seed-hash: befb8eb8abc0700bbae747dfa3a234a4a84a2cf813b8891b4818a549933aee33
  devac:generated-at: 2026-01-06T16:55:20.843Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/devac-worktree
-->

# Package Effects: devac-worktree
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** devac-worktree
- **Last Updated:** 2026-01-06
- **Verified:** ✗
## Store Operations
<!-- Pattern → Store effect mapping -->
_No store patterns detected. Add manually if needed._

## Retrieve Operations
<!-- Pattern → Retrieve effect mapping -->
_No retrieve patterns detected. Add manually if needed._

## External Calls
<!-- Pattern → Send effect mapping -->
| Pattern | Send Type | Service | Third Party | Module | Count |
|---------|-----------|---------|-------------|--------|-------|
| `execa` | external | external | true | execa | 21 |
| `path.join` | external | external | true | node:path | 14 |
| `path.dirname` | external | external | true | node:path | 5 |
| `fs.stat` | external | external | true | node:fs/promises | 5 |
| `path.basename` | external | external | true | node:path | 5 |
| `fs.writeFile` | external | external | true | node:fs/promises | 2 |
| `fs.mkdir` | external | external | true | node:fs/promises | 2 |
| `fs.access` | external | external | true | node:fs/promises | 2 |
| `readline.createInterface` | external | external | true | node:readline | 1 |
| `discoverContext` | external | external | true | @pietgk/devac-core | 1 |
| `extractIssueNumber` | external | external | true | @pietgk/devac-core | 1 |
| `Command` | external | external | true | commander | 1 |
| `parseIssueId` | external | external | true | @pietgk/devac-core | 1 |
| `fs.readFile` | external | external | true | node:fs/promises | 1 |
| `defineConfig` | external | external | true | vitest/config | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `console.log` | yes | no | 92 | ignore |
| `option` | no | no | 20 | - |
| `String` | no | no | 16 | - |
| `lines.push` | yes | no | 15 | - |
| `loadState` | no | yes | 11 | - |
| `console.warn` | yes | no | 9 | ignore |
| `description` | no | no | 7 | - |
| `fetchIssue` | no | yes | 6 | retrieve? |
| `program.command` | yes | no | 6 | - |
| `action` | no | no | 6 | - |
| `process.exit` | yes | no | 6 | - |
| `console.error` | yes | no | 6 | ignore |
| `args.push` | yes | no | 5 | - |
| `replace` | no | no | 5 | - |
| `findWorktreeForIssue` | no | yes | 4 | retrieve? |
| `writeIssueContext` | no | yes | 4 | store? |
| `launchClaude` | no | yes | 4 | - |
| `isClaudeInstalled` | no | yes | 4 | - |
| `issue.state.toLowerCase` | yes | no | 4 | - |
| `getRepoRoot` | no | yes | 4 | retrieve? |
| `fetchWorktreeStatus` | no | yes | 4 | retrieve? |
| `worktreesWithStatus.push` | yes | no | 4 | - |
| `JSON.parse` | yes | no | 4 | - |
| `getPRForBranch` | no | yes | 3 | retrieve? |
| `state.worktrees.find` | yes | no | 3 | retrieve? |
| `hasNodeModules` | no | yes | 3 | - |
| `installDependencies` | no | yes | 3 | - |
| `process.cwd` | yes | no | 3 | - |
| `generateBranchName` | no | no | 3 | - |
| `generateShortDescription` | no | no | 3 | - |
| _...and 91 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| devac-worktree | Container | typescript | - | TODO: Add description |
