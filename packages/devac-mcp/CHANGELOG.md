# @pietgk/devac-mcp

## 0.3.0

### Minor Changes

- 09212d3: Add context discovery, CI status, review prompts, and multi-repo worktree support

  **@pietgk/devac-core:**

  - Add context discovery module for sibling repo and issue worktree detection
  - Add CI status checking via GitHub CLI integration
  - Add review prompt generation for LLM-assisted code review
  - Add cross-repo detection utilities

  **@pietgk/devac-worktree:**

  - Add `--also <repo>` flag for creating worktrees in sibling repos
  - Add `--repos <repos>` flag for parent directory workflow
  - Add `--issue-wide` flag to status command for cross-repo view
  - Support parent directory mode for multi-repo development

  **@pietgk/devac-cli:**

  - Add `devac context` command for context discovery
  - Add `devac context ci` command for CI status checking across repos
  - Add `devac context review` command for generating LLM review prompts

  **@pietgk/devac-mcp:**

  - Add `get_context` tool for AI assistant context discovery
  - Add `list_repos` tool for listing registered repositories
  - Add intelligent context caching with 30-second TTL

### Patch Changes

- Updated dependencies [09212d3]
  - @pietgk/devac-core@0.2.0

## 0.2.0

### Minor Changes

- be91895: Add hub mode support to MCP server for federated cross-repository queries.

  - Add `--hub` flag (default) for hub mode that queries across all registered repositories
  - Add `--package` flag for single package mode (mutually exclusive with `--hub`)
  - Add `list_repos` tool to list registered repositories (hub mode only)
  - Add DataProvider abstraction for unified query interface across modes
  - Update `query_sql` to query all seeds from registered repos in hub mode

### Patch Changes

- Updated dependencies [23e65a2]
  - @pietgk/devac-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [144f370]
  - @pietgk/devac-core@0.1.1
