# @pietgk/devac-eval

## 0.3.0

### Minor Changes

- 22970ac: Replace Anthropic SDK with Claude CLI for LLM execution

  - Add ClaudeCLIExecutor that spawns `claude -p` subprocess
  - Remove @anthropic-ai/sdk dependency (works with Claude Max subscription)
  - Add --model CLI option for model selection (sonnet, haiku, opus)
  - Fix subprocess stdin handling to prevent hanging
  - Use ~/ws as working directory for proper context access
  - Add timing estimates to evaluation progress output
  - Add comprehensive tests for CLI executor (16 tests)

  **Breaking change**: Requires Claude CLI to be installed and authenticated instead of ANTHROPIC_API_KEY.

## 0.2.0

### Minor Changes

- 35256ba: Add LLM answer quality evaluation framework

  New package for measuring how DevAC improves LLM answer quality for code understanding questions.

  - LLM-as-judge scoring with 5 quality dimensions (correctness, completeness, hallucination, comprehensibility, context usage)
  - Pairwise comparison between baseline (LLM-only) and enhanced (LLM+DevAC) modes
  - 10 benchmark questions about DevAC codebase with ground truth facts
  - Full CLI with commands: `run`, `report`, `compare`, `list`, `validate`
  - MCP server integration for enhanced mode evaluation
  - Extensible benchmark format supporting multiple codebases
