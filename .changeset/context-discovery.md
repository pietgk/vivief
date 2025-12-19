---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-worktree": minor
"@pietgk/devac-mcp": minor
---

Add context discovery, CI status, review prompts, and multi-repo worktree support

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
