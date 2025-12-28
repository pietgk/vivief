---
"@pietgk/devac-eval": minor
---

Replace Anthropic SDK with Claude CLI for LLM execution

- Add ClaudeCLIExecutor that spawns `claude -p` subprocess
- Remove @anthropic-ai/sdk dependency (works with Claude Max subscription)
- Add --model CLI option for model selection (sonnet, haiku, opus)
- Fix subprocess stdin handling to prevent hanging
- Use ~/ws as working directory for proper context access
- Add timing estimates to evaluation progress output
- Add comprehensive tests for CLI executor (16 tests)

**Breaking change**: Requires Claude CLI to be installed and authenticated instead of ANTHROPIC_API_KEY.
