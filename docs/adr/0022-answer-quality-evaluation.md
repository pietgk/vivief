# ADR-0022: Answer Quality Evaluation Framework

## Status

Accepted

## Context

DevAC is designed to help LLMs answer questions about codebases more accurately by providing structured code analysis tools. However, we lacked a formal way to:

1. **Measure improvement**: Quantify how much DevAC tools improve answer quality
2. **Track quality over time**: Detect regressions or improvements across DevAC releases
3. **Define quality dimensions**: Establish clear, measurable criteria for "good" answers
4. **Compare approaches**: Objectively compare LLM-only vs LLM+DevAC responses

Initial manual testing with questions like "How does the MCP server work?" showed that ~80% of the answer content came from DevAC queries when tools were available. We needed a systematic approach to validate and improve these results.

## Decision

### 1. Create devac-eval Package

We created `packages/devac-eval/` as a standalone evaluation framework with:

- **Benchmark question sets** in JSON format with ground truth facts
- **Dual-mode evaluation**: Baseline (LLM-only) and Enhanced (LLM+DevAC)
- **LLM-as-judge scoring**: Automated evaluation using Claude as judge
- **CLI interface**: `devac-eval run`, `report`, `compare`, `validate`

### 2. Quality Dimensions (1-5 scale)

| Dimension | Description |
|-----------|-------------|
| **Correctness** | Accuracy relative to ground truth facts |
| **Completeness** | Coverage of expected topics |
| **Hallucination** | Absence of fabricated information (inverted: 5=none) |
| **Comprehensibility** | Clarity and structure of explanation |
| **Context Usage** | How well DevAC context was utilized (enhanced only) |

### 3. LLM-as-Judge Pattern

We chose LLM-as-judge (rather than human evaluation) because:

- Research shows GPT-4 achieves ~80% agreement with human judges
- Enables rapid iteration and automated CI integration
- Pairwise comparison is more stable than pointwise scoring
- Reproducible and scalable

The judge uses structured prompts with rubrics and returns JSON with:
- Dimension scores
- Covered/missed ground truth facts
- Detected hallucinations
- Overall reasoning

### 4. Question Format

Questions include:
- **Ground truth facts** with evidence (file paths, line numbers)
- **Expected coverage** topics
- **Relevant tools** hints for context usage scoring
- **Category and difficulty** for filtering

Example:
```json
{
  "id": "devac-001",
  "title": "MCP Server Architecture",
  "question": "How does the DevAC MCP server work?",
  "groundTruth": [
    {
      "fact": "MCP server exposes tools like find_symbol, query_sql",
      "importance": "critical",
      "evidence": [{ "filePath": "packages/devac-mcp/src/tools/index.ts" }]
    }
  ]
}
```

### 5. Evaluation Pipeline

```
1. SETUP: Load benchmark, validate schema
2. BASELINE RUN: Query LLM without tools
3. ENHANCED RUN: Query LLM with DevAC MCP tools
4. JUDGE: Pointwise scores + pairwise comparison
5. REPORT: Generate summary with deltas and insights
```

## Consequences

### Positive

- **Measurable progress**: Can quantify DevAC value with win rates and dimension deltas
- **Regression detection**: CI can catch quality regressions
- **Benchmark-driven development**: Questions define success criteria for features
- **Extensible**: Easy to add new benchmarks for different codebases

### Negative

- **LLM costs**: Evaluation requires 3 LLM calls per question (baseline, enhanced, judge)
- **Ground truth maintenance**: Question sets need updating as code changes
- **Judge bias**: LLM judges may have biases not present in human evaluation

### Neutral

- Initial question set focuses on DevAC itself (`devac-self` benchmark)
- Can be extended to other codebases with new benchmark JSON files
- Results stored in `./results/` with full run history

## Implementation Notes

Package structure:
```
packages/devac-eval/
├── src/
│   ├── benchmark/     # Question loading, validation
│   ├── runner/        # LLM execution, MCP client
│   ├── judge/         # Scoring prompts, metrics
│   ├── storage/       # Result persistence
│   ├── reporter/      # Report generation
│   └── cli/           # CLI commands
├── benchmarks/
│   └── devac-self/    # Questions about DevAC
└── __tests__/
```

CLI usage:
```bash
devac-eval run --benchmark devac-self --hub ~/.devac
devac-eval report <run-id> --format markdown
devac-eval compare <run1> <run2>
```

## References

- [RAGAS](https://docs.ragas.io/) - RAG evaluation framework
- [DeepEval](https://docs.confident-ai.com/) - LLM evaluation with 14+ metrics
- Research: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"
- Plan file: `~/.claude/plans/wise-giggling-babbage.md`
