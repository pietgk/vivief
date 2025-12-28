# DevAC Eval Framework

The DevAC Eval Framework measures how DevAC tools improve LLM answer quality for code understanding questions. It uses LLM-as-judge scoring to compare responses generated with and without DevAC MCP tools.

## Overview

The framework runs a dual-mode evaluation:

1. **Baseline Mode**: LLM answers questions without any tools
2. **Enhanced Mode**: LLM answers questions with DevAC MCP tools available

An LLM judge then scores both responses and determines which is better, measuring the improvement DevAC provides.

## CLI Commands

### `devac-eval run`

Execute an evaluation run comparing baseline vs enhanced modes.

```bash
devac-eval run --benchmark <benchmark-id> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--benchmark, -b` | Benchmark ID to run | Required |
| `--hub` | Path to DevAC hub | Auto-detect |
| `--modes` | Modes to run: `baseline,enhanced` | `baseline,enhanced` |
| `--questions` | Comma-separated question IDs to run | All |
| `--results-dir` | Directory to store results | `./results` |

**Examples:**

```bash
# Full evaluation (baseline + enhanced)
devac-eval run --benchmark devac-self

# Only baseline mode
devac-eval run --benchmark devac-self --modes baseline

# Specific questions
devac-eval run --benchmark devac-self --questions devac-001,devac-002
```

### `devac-eval report`

Generate a summary report from an evaluation run.

```bash
devac-eval report <run-id> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--format, -f` | Output format: `markdown`, `json`, `table` | `markdown` |
| `--output, -o` | Output file path | stdout |
| `--results-dir` | Results directory | `./results` |

**Examples:**

```bash
# Markdown report to stdout
devac-eval report abc123

# JSON report to file
devac-eval report abc123 --format json --output report.json
```

### `devac-eval compare`

Compare two evaluation runs to track quality changes.

```bash
devac-eval compare <run-id-1> <run-id-2> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--format, -f` | Output format: `markdown`, `json`, `table` | `markdown` |
| `--output, -o` | Output file path | stdout |
| `--results-dir` | Results directory | `./results` |

**Example:**

```bash
# Compare two runs
devac-eval compare abc123 def456 --format markdown
```

### `devac-eval list`

List available benchmarks, questions, or runs.

```bash
devac-eval list <type> [options]
```

**Types:**

| Type | Description |
|------|-------------|
| `benchmarks` | List available benchmark sets |
| `questions` | List questions in a benchmark |
| `runs` | List recent evaluation runs |

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--benchmark, -b` | Benchmark ID (for `questions`) | - |
| `--limit, -l` | Max items to show | 20 |
| `--results-dir` | Results directory | `./results` |

**Examples:**

```bash
devac-eval list benchmarks
devac-eval list questions --benchmark devac-self
devac-eval list runs --limit 10
```

### `devac-eval validate`

Validate a benchmark questions file.

```bash
devac-eval validate <file> [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--strict` | Treat warnings as errors | false |

**Example:**

```bash
devac-eval validate ./my-benchmark/questions.json --strict
```

## Quality Dimensions

Responses are scored on 5 dimensions using a 1-5 scale:

| Dimension | Description | Scoring |
|-----------|-------------|---------|
| **Correctness** | Accuracy relative to ground truth facts | 5=all facts correct, 1=major errors |
| **Completeness** | Coverage of expected topics | 5=comprehensive, 1=missing key topics |
| **Hallucination** | Absence of fabricated information | 5=no hallucinations, 1=significant fabrication |
| **Comprehensibility** | Clarity and structure | 5=clear and organized, 1=confusing |
| **Context Usage** | Use of DevAC tools (enhanced only) | 5=excellent tool use, 1=poor/no tool use |

## Benchmark Schema

### Question Format

```typescript
interface EvalQuestion {
  id: string;                       // Unique identifier (e.g., "devac-001")
  title: string;                    // Short title
  question: string;                 // Full question text
  category: QuestionCategory;       // Category for grouping
  difficulty: "easy" | "medium" | "hard";
  expectedCoverage: string[];       // Topics that should be covered
  groundTruth: GroundTruthItem[];   // Known facts for validation
  relevantTools?: string[];         // DevAC tools that might help
  expectedReferences?: string[];    // Files the answer should reference
  tags: string[];                   // Additional tags
}
```

### Ground Truth Format

```typescript
interface GroundTruthItem {
  fact: string;                     // The factual claim
  importance: "critical" | "important" | "nice-to-have";
  evidence: {
    filePath: string;               // Source file
    lineStart?: number;             // Start line
    lineEnd?: number;               // End line
    snippet?: string;               // Code snippet
  }[];
}
```

### Categories

- `architecture` - System design and structure
- `data-flow` - How data moves through the system
- `dependencies` - Package/module dependencies
- `implementation` - Specific code implementation
- `integration` - How components work together
- `debugging` - Error handling and troubleshooting
- `refactoring` - Code improvement opportunities

## Result Storage

Results are stored in a structured directory:

```
results/
├── runs/
│   └── <run-id>/
│       ├── run.json           # Full run data
│       ├── summary.json       # Quick summary
│       ├── responses/
│       │   ├── baseline.json  # Baseline responses
│       │   └── enhanced.json  # Enhanced responses
│       └── scores/
│           ├── pointwise.json # Per-dimension scores
│           └── pairwise.json  # Head-to-head comparisons
└── index.json                 # Run index
```

## Example Report Output

```markdown
# DevAC Evaluation Report

## Overall Results

| Metric | Value |
|--------|-------|
| Total Questions | 10 |
| Enhanced Wins | 7 |
| Baseline Wins | 2 |
| Ties | 1 |
| **Win Rate** | **70%** |

## Dimension Scores

| Dimension | Baseline | Enhanced | Delta |
|-----------|----------|----------|-------|
| Correctness | 3.2 | 4.1 | +0.9 |
| Completeness | 2.8 | 4.3 | +1.5 |
| Hallucination | 3.5 | 4.2 | +0.7 |
| Comprehensibility | 3.8 | 4.0 | +0.2 |
```

## Prerequisites

This framework uses Claude CLI for all LLM operations. Before running evaluations:

1. **Install Claude CLI**: Follow instructions at https://docs.anthropic.com/claude/docs/claude-cli
2. **Authenticate**: Run `claude login` to authenticate with your Claude account
3. **Configure MCP** (for enhanced mode): Ensure devac-mcp is configured in Claude CLI settings

```bash
# Verify Claude CLI is working
claude --version

# Check MCP tools are available
claude mcp list
```

The evaluation uses your Claude CLI subscription - no API key required.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEVAC_EVAL_RESULTS_DIR` | Default results directory | `./results` |

## See Also

- [Implementation Details](./implementation/eval-framework.md) - How it works under the hood
- [ADR-0022](./adr/0022-answer-quality-evaluation.md) - Architecture decision record
