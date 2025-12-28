# Eval Framework Implementation

This document explains how the DevAC Eval Framework works under the hood.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EVALUATION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  BENCHMARK   │───►│    RUNNER    │───►│    JUDGE     │              │
│  │   LOADER     │    │              │    │              │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│        │                    │                   │                       │
│        ▼                    ▼                   ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Zod        │    │  LLM         │    │  Pointwise   │              │
│  │   Validation │    │  Executor    │    │  Scoring     │              │
│  └──────────────┘    │  + MCP       │    │  + Pairwise  │              │
│                      │  Client      │    │  Comparison  │              │
│                      └──────────────┘    └──────────────┘              │
│                             │                   │                       │
│                             ▼                   ▼                       │
│                      ┌──────────────┐    ┌──────────────┐              │
│                      │  STORAGE     │◄───│  REPORTER    │              │
│                      │  (JSON)      │    │  (MD/JSON)   │              │
│                      └──────────────┘    └──────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Deep Dive

### 1. Benchmark Module

**Location:** `src/benchmark/`

The benchmark module handles loading and validating evaluation questions.

#### Question Loader (`question-loader.ts`)

```typescript
// Discovers and loads benchmark sets from the benchmarks/ directory
export async function loadBenchmark(benchmarkId: string): Promise<BenchmarkSet>
export async function listBenchmarks(): Promise<BenchmarkInfo[]>
```

The loader:
1. Scans `benchmarks/` directory for `questions.json` files
2. Parses JSON and validates against schema
3. Returns typed `BenchmarkSet` with questions

#### Question Validator (`question-validator.ts`)

Uses Zod schemas for validation:

```typescript
const evalQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/i),
  title: z.string().min(3).max(100),
  question: z.string().min(10),
  category: questionCategorySchema,
  difficulty: z.enum(["easy", "medium", "hard"]),
  expectedCoverage: z.array(z.string()).min(1),
  groundTruth: z.array(groundTruthItemSchema).min(1),
  // ...
});
```

The validator also generates warnings for:
- Low ground truth count (< 3 facts)
- No critical facts defined
- Missing relevant tools hints
- Low category/difficulty diversity in benchmark

### 2. Runner Module

**Location:** `src/runner/`

The runner executes LLM queries in two modes.

#### LLM Executor (`llm-executor.ts`)

Handles direct LLM API calls via the Anthropic SDK:

```typescript
class LLMExecutor {
  // Baseline: Direct LLM query without tools
  async executeBaseline(question: EvalQuestion): Promise<ExecutorResult>

  // Enhanced: LLM with tool access (agentic loop)
  async executeWithTools(
    question: EvalQuestion,
    tools: Anthropic.Tool[],
    handleToolCall: (name: string, input: Record<string, unknown>) => Promise<string>
  ): Promise<ExecutorResult>
}
```

**Agentic Tool Loop:**

The enhanced mode implements an agentic loop:

```
1. Send question to LLM with tools available
2. If LLM responds with tool_use:
   a. Execute each tool call via MCP client
   b. Return tool results to LLM
   c. Repeat from step 2
3. If LLM responds with end_turn:
   a. Extract final text response
   b. Return with tool usage metadata
4. Safety: Max 10 iterations to prevent infinite loops
```

#### MCP Client (`mcp-client.ts`)

Connects to DevAC MCP server for enhanced mode:

```typescript
class MCPClient {
  async connect(): Promise<void>           // Start MCP server subprocess
  async disconnect(): Promise<void>        // Clean shutdown
  async callTool(name: string, args): Promise<string>  // Execute tool
  async executeEnhanced(question): Promise<ExecutorResult>
}
```

The client:
1. Spawns `devac-mcp` as a subprocess
2. Communicates via stdio using MCP protocol
3. Translates tool calls to MCP requests
4. Tracks tool usage for context scoring

#### Eval Runner (`eval-runner.ts`)

Orchestrates the full evaluation:

```typescript
class EvalRunner {
  async run(): Promise<EvalRun> {
    // 1. Load benchmark questions
    // 2. For each question:
    //    a. Execute baseline (LLM only)
    //    b. Execute enhanced (LLM + MCP tools)
    //    c. Collect responses
    // 3. Judge all responses
    // 4. Calculate metrics
    // 5. Store results
  }
}
```

### 3. Judge Module

**Location:** `src/judge/`

The judge scores responses using LLM-as-judge methodology.

#### Prompts (`prompts.ts`)

Defines scoring rubrics as system prompts:

```typescript
// Pointwise scoring prompt
export function buildPointwisePrompt(
  question: EvalQuestion,
  response: EvalResponse,
  isEnhanced: boolean
): string

// Pairwise comparison prompt
export function buildPairwisePrompt(
  question: EvalQuestion,
  baselineResponse: string,
  enhancedResponse: string
): string
```

**Scoring Rubric Example:**

```
Score each dimension from 1-5:

CORRECTNESS (accuracy vs ground truth):
5 = All facts correct, precise details
4 = Mostly correct, minor inaccuracies
3 = Some correct, some errors
2 = Significant errors
1 = Major factual mistakes

[Similar rubrics for other dimensions...]

Ground Truth Facts:
1. [CRITICAL] The MCP server uses stdio transport
2. [IMPORTANT] Tools are registered in registerTools()
...

Respond in JSON: {"correctness": 4, "completeness": 5, ...}
```

#### LLM Judge (`llm-judge.ts`)

Executes the judging:

```typescript
class LLMJudge {
  // Score a single response on 5 dimensions
  async scorePointwise(
    question: EvalQuestion,
    response: EvalResponse
  ): Promise<PointwiseScore>

  // Compare baseline vs enhanced
  async comparePairwise(
    question: EvalQuestion,
    baseline: EvalResponse,
    enhanced: EvalResponse
  ): Promise<PairwiseResult>

  // Judge entire run
  async judgeRun(
    run: EvalRun,
    questions: EvalQuestion[],
    onProgress?: (progress: JudgeProgress) => void
  ): Promise<{ pointwiseScores, pairwiseResults }>
}
```

**Response Parsing:**

The judge extracts JSON scores from LLM responses:

```typescript
// Extract JSON from markdown code blocks or raw response
const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
const scores = JSON.parse(jsonMatch[1]);
```

#### Metrics (`metrics.ts`)

Aggregates scores into summary statistics:

```typescript
export function calculateMetrics(run: EvalRun): RunSummary {
  // Count wins/losses/ties
  // Calculate average scores per dimension
  // Compute deltas (enhanced - baseline)
}

export function calculateWinRate(summary: RunSummary): number
export function calculateImprovementScore(summary: RunSummary): number
export function getBestImprovement(summary): { dimension, delta }
export function analyzeByQuestion(scores, results): Map<questionId, analysis>
```

### 4. Storage Module

**Location:** `src/storage/`

Persists evaluation results as JSON files.

#### Result Writer (`result-writer.ts`)

```typescript
class ResultWriter {
  // Create new run directory
  async initRun(run: EvalRun): Promise<string>

  // Save responses as they complete
  async saveResponse(runId: string, response: EvalResponse): Promise<void>

  // Save final results
  async finalizeRun(run: EvalRun): Promise<void>
}
```

**Directory Structure:**

```
results/runs/<run-id>/
├── run.json           # Full EvalRun object
├── summary.json       # RunSummary for quick access
├── responses/
│   ├── baseline.json  # All baseline responses
│   └── enhanced.json  # All enhanced responses
└── scores/
    ├── pointwise.json # PointwiseScore[]
    └── pairwise.json  # PairwiseResult[]
```

#### Result Reader (`result-reader.ts`)

```typescript
class ResultReader {
  async loadRun(runId: string): Promise<EvalRun>
  async listRuns(limit?: number): Promise<RunInfo[]>
  async loadResponses(runId: string, mode: EvalMode): Promise<EvalResponse[]>
}
```

### 5. Reporter Module

**Location:** `src/reporter/`

Generates human-readable reports.

#### Summary Reporter (`summary-reporter.ts`)

```typescript
class SummaryReporter {
  generate(run: EvalRun): string  // Returns markdown/json/table
}
```

Generates reports with:
- Overall win/loss/tie counts
- Per-dimension score tables
- Best/worst improvement dimensions
- Top improvements and regressions

#### Comparison Reporter (`comparison-reporter.ts`)

```typescript
class ComparisonReporter {
  compare(run1: EvalRun, run2: EvalRun): string
}
```

Compares two runs to track quality changes over time:
- Win rate delta
- Per-dimension improvement changes
- Statistical significance indicators

## Data Flow

```
Questions.json
     │
     ▼
┌─────────────────┐
│ QuestionLoader  │──► Validate with Zod schemas
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   EvalRunner    │────►│  LLMExecutor    │──► Anthropic API
└────────┬────────┘     │  (baseline)     │
         │              └─────────────────┘
         │
         │              ┌─────────────────┐
         └─────────────►│  MCPClient +    │──► devac-mcp subprocess
                        │  LLMExecutor    │    (enhanced mode)
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  ResponseCollector│──► Store responses
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   LLMJudge      │──► Score responses
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Metrics       │──► Aggregate scores
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  ResultWriter   │──► Persist to JSON
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  SummaryReporter│──► Generate report
                        └─────────────────┘
```

## Extensibility

### Adding New Benchmarks

1. Create `benchmarks/<name>/questions.json`
2. Follow the schema in `benchmarks/template/`
3. Validate with `devac-eval validate`

### Custom Reporters

Implement the reporter interface:

```typescript
interface Reporter {
  generate(run: EvalRun): string;
}
```

### Different LLM Providers

The `LLMExecutor` uses the Anthropic SDK but could be extended to support other providers by abstracting the API layer.

## Performance Considerations

- **Token Usage**: Each question requires ~2-4 LLM calls (baseline + enhanced + 2 judge calls)
- **Concurrency**: Questions are processed sequentially to avoid rate limits
- **Caching**: Results are persisted, avoiding re-computation
- **MCP Overhead**: Enhanced mode spawns a subprocess; connection is reused across questions

## Error Handling

- **Tool Errors**: Caught and included in tool results with `is_error: true`
- **LLM Failures**: Retried with exponential backoff (not yet implemented)
- **Validation Errors**: Returned as structured `ValidationResult` with path info
- **Max Iterations**: Agentic loop capped at 10 iterations

## See Also

- [Eval Framework Guide](../eval-framework.md) - User documentation
- [ADR-0022](../adr/0022-answer-quality-evaluation.md) - Design rationale
