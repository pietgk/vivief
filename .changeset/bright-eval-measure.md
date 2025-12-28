---
"@pietgk/devac-eval": minor
---

Add LLM answer quality evaluation framework

New package for measuring how DevAC improves LLM answer quality for code understanding questions.

- LLM-as-judge scoring with 5 quality dimensions (correctness, completeness, hallucination, comprehensibility, context usage)
- Pairwise comparison between baseline (LLM-only) and enhanced (LLM+DevAC) modes
- 10 benchmark questions about DevAC codebase with ground truth facts
- Full CLI with commands: `run`, `report`, `compare`, `list`, `validate`
- MCP server integration for enhanced mode evaluation
- Extensible benchmark format supporting multiple codebases
