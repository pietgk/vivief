# @pietgk/devac-eval

LLM answer quality evaluation framework for DevAC - measure how DevAC tools improve AI responses to code understanding questions.

## Installation

```bash
pnpm add @pietgk/devac-eval
```

## Overview

This package provides a framework for evaluating LLM answer quality when answering questions about codebases. It compares responses generated with and without DevAC MCP tools, using LLM-as-judge scoring to measure improvement.

## Quick Start

### Run an Evaluation

```bash
# Run full evaluation (baseline + enhanced modes)
devac-eval run --benchmark devac-self --hub ~/.devac

# Run only baseline (LLM without tools)
devac-eval run --benchmark devac-self --modes baseline

# Run specific questions
devac-eval run --benchmark devac-self --questions devac-001,devac-002
```

### View Results

```bash
# Generate a report
devac-eval report <run-id> --format markdown

# Compare two runs
devac-eval compare <run-id-1> <run-id-2>

# List available benchmarks and runs
devac-eval list benchmarks
devac-eval list runs
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Benchmark** | A set of questions about a codebase with ground truth facts |
| **Run** | A single evaluation execution comparing baseline vs enhanced modes |
| **Baseline** | LLM response without DevAC tools |
| **Enhanced** | LLM response with DevAC MCP tools available |
| **Judge** | LLM-as-judge scoring on 5 quality dimensions |

## Quality Dimensions

Each response is scored on 5 dimensions (1-5 scale):

- **Correctness** - Accuracy relative to ground truth facts
- **Completeness** - Coverage of expected topics
- **Hallucination** - Absence of fabricated information (inverted)
- **Comprehensibility** - Clarity and structure
- **Context Usage** - How well DevAC tools were utilized (enhanced only)

## CLI Commands

| Command | Description |
|---------|-------------|
| `run` | Execute evaluation comparing baseline vs enhanced |
| `report` | Generate summary report from a run |
| `compare` | Compare two evaluation runs |
| `list` | List benchmarks, questions, or runs |
| `validate` | Validate benchmark question files |

## Configuration

```bash
# Environment variables
ANTHROPIC_API_KEY=sk-...          # Required for LLM calls
DEVAC_EVAL_MODEL=claude-sonnet-4-20250514  # Response model (default)
DEVAC_EVAL_JUDGE_MODEL=claude-sonnet-4-20250514   # Judge model (default)
```

## Creating Custom Benchmarks

See the template at `benchmarks/template/questions.template.json`:

```json
{
  "id": "my-benchmark",
  "name": "My Project Benchmark",
  "targetRepo": "my-project",
  "questions": [
    {
      "id": "q-001",
      "title": "Question Title",
      "question": "How does X work?",
      "category": "architecture",
      "difficulty": "medium",
      "expectedCoverage": ["topic1", "topic2"],
      "groundTruth": [
        {
          "fact": "X uses pattern Y",
          "importance": "critical",
          "evidence": [{ "filePath": "src/x.ts", "lineStart": 10 }]
        }
      ],
      "tags": ["architecture"]
    }
  ]
}
```

## Related Packages

- [@pietgk/devac-core](../devac-core) - Core analysis library
- [@pietgk/devac-mcp](../devac-mcp) - MCP server (used in enhanced mode)
- [@pietgk/devac-cli](../devac-cli) - Command-line interface

## Documentation

- [Eval Framework Guide](../../docs/eval-framework.md) - Full documentation
- [Implementation Details](../../docs/implementation/eval-framework.md) - How it works under the hood
- [ADR-0022](../../docs/adr/0022-answer-quality-evaluation.md) - Architecture decision

## License

MIT
