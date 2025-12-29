/**
 * Core type definitions for the DevAC Answer Quality Evaluation Framework
 */

// ============================================================================
// Question Categories
// ============================================================================

export type QuestionCategory =
  | "architecture"
  | "data-flow"
  | "dependencies"
  | "implementation"
  | "integration"
  | "debugging"
  | "refactoring";

export type Difficulty = "easy" | "medium" | "hard";

export type Importance = "critical" | "important" | "nice-to-have";

// ============================================================================
// Ground Truth
// ============================================================================

export interface GroundTruthEvidence {
  /** Relative file path from repo root */
  filePath: string;
  /** Optional line number range start */
  lineStart?: number;
  /** Optional line number range end */
  lineEnd?: number;
  /** Optional code snippet as evidence */
  snippet?: string;
}

export interface GroundTruthItem {
  /** The factual claim that should be in the answer */
  fact: string;
  /** How important is this fact */
  importance: Importance;
  /** Evidence from the codebase supporting this fact */
  evidence: GroundTruthEvidence[];
}

// ============================================================================
// Evaluation Questions
// ============================================================================

export interface EvalQuestion {
  /** Unique identifier, e.g., "devac-001" */
  id: string;
  /** Short descriptive title */
  title: string;
  /** The actual question to ask the LLM */
  question: string;
  /** Question category for grouping/filtering */
  category: QuestionCategory;
  /** Difficulty level */
  difficulty: Difficulty;
  /** Topics the answer should cover */
  expectedCoverage: string[];
  /** Known facts the answer should include */
  groundTruth: GroundTruthItem[];
  /** Optional: DevAC tools that would be useful */
  relevantTools?: string[];
  /** Optional: Files the answer should reference */
  expectedReferences?: string[];
  /** Free-form tags for filtering */
  tags: string[];
}

export interface BenchmarkSet {
  /** Benchmark identifier, e.g., "devac-self" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this benchmark tests */
  description: string;
  /** Target repository or codebase */
  targetRepo: string;
  /** Questions in this benchmark */
  questions: EvalQuestion[];
  /** Benchmark metadata */
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ============================================================================
// Evaluation Responses
// ============================================================================

export type EvalMode = "baseline" | "enhanced";

export interface ToolUsage {
  /** Tool name that was called */
  toolName: string;
  /** Number of times this tool was called */
  callCount: number;
  /** Total tokens used in tool responses */
  tokensUsed: number;
}

export interface EvalResponse {
  /** Reference to the question ID */
  questionId: string;
  /** Whether this was baseline or enhanced */
  mode: EvalMode;
  /** The LLM's response text */
  response: string;
  /** Response metadata */
  metadata: {
    /** Model used to generate the response */
    model: string;
    /** Response generation timestamp */
    timestamp: string;
    /** Response latency in milliseconds */
    latencyMs: number;
    /** Total tokens used (input + output) */
    totalTokens: number;
    /** Input tokens */
    inputTokens: number;
    /** Output tokens */
    outputTokens: number;
  };
  /** Tool usage stats (enhanced mode only) */
  toolUsage?: ToolUsage[];
}

// ============================================================================
// Scoring
// ============================================================================

/** Score from 1-5 for each dimension */
export type DimensionScore = 1 | 2 | 3 | 4 | 5;

export interface DimensionScores {
  /** Accuracy relative to ground truth facts (1-5) */
  correctness: DimensionScore;
  /** Coverage of expected topics (1-5) */
  completeness: DimensionScore;
  /** Absence of fabricated information (1=many, 5=none) */
  hallucination: DimensionScore;
  /** Clarity and structure (1-5) */
  comprehensibility: DimensionScore;
}

export interface ContextUsageScore {
  /** How well DevAC context was utilized (1-5) */
  score: DimensionScore;
  /** Specific observations about context usage */
  observations: string[];
}

export interface PointwiseScore {
  /** Reference to the response being scored */
  questionId: string;
  /** Mode of the response */
  mode: EvalMode;
  /** Scores for each dimension */
  dimensions: DimensionScores;
  /** Context usage score (enhanced only) */
  contextUsage?: ContextUsageScore;
  /** Judge's reasoning */
  reasoning: string;
  /** Which ground truth facts were covered */
  coveredFacts: string[];
  /** Which ground truth facts were missed */
  missedFacts: string[];
  /** Any hallucinated claims detected */
  hallucinations: string[];
  /** Scoring metadata */
  metadata: {
    /** Judge model used */
    judgeModel: string;
    /** Scoring timestamp */
    timestamp: string;
    /** Time to score in milliseconds */
    latencyMs: number;
  };
}

export interface PairwiseResult {
  /** Reference to the question */
  questionId: string;
  /** Which response was judged better */
  winner: EvalMode | "tie";
  /** Confidence level (0-1) */
  confidence: number;
  /** Dimension-level comparison */
  dimensionComparison: {
    dimension: keyof DimensionScores;
    winner: EvalMode | "tie";
    explanation: string;
  }[];
  /** Overall reasoning */
  reasoning: string;
  /** Scoring metadata */
  metadata: {
    judgeModel: string;
    timestamp: string;
    latencyMs: number;
  };
}

// ============================================================================
// Evaluation Runs
// ============================================================================

export interface RunConfig {
  /** Modes to run */
  modes: EvalMode[];
  /** Questions to include (undefined = all) */
  questionIds?: string[];
  /** LLM model for generating responses (metadata only - Claude CLI uses user's config) */
  responseModel: string;
  /** LLM model for judging (metadata only - Claude CLI uses user's config) */
  judgeModel: string;
  /** Model override for Claude CLI (e.g., 'sonnet', 'haiku', 'opus') */
  model?: string;
}

export interface RunSummary {
  /** Total questions evaluated */
  totalQuestions: number;
  /** Questions where enhanced won */
  enhancedWins: number;
  /** Questions where baseline won */
  baselineWins: number;
  /** Ties */
  ties: number;
  /** Average dimension scores by mode */
  averageScores: {
    baseline: {
      correctness: number;
      completeness: number;
      hallucination: number;
      comprehensibility: number;
    };
    enhanced: {
      correctness: number;
      completeness: number;
      hallucination: number;
      comprehensibility: number;
      contextUsage: number;
    };
  };
  /** Improvement deltas (enhanced - baseline) */
  deltas: {
    correctness: number;
    completeness: number;
    hallucination: number;
    comprehensibility: number;
  };
}

export interface EvalRun {
  /** Unique run identifier */
  id: string;
  /** Benchmark used */
  benchmarkId: string;
  /** Run configuration */
  config: RunConfig;
  /** When the run started */
  startedAt: string;
  /** When the run completed */
  completedAt?: string;
  /** Run status */
  status: "running" | "completed" | "failed";
  /** Error message if failed */
  error?: string;
  /** Responses collected */
  responses: EvalResponse[];
  /** Pointwise scores */
  pointwiseScores: PointwiseScore[];
  /** Pairwise comparisons */
  pairwiseResults: PairwiseResult[];
  /** Summary statistics */
  summary?: RunSummary;
}

// ============================================================================
// Configuration
// ============================================================================

export interface EvalConfig {
  /** Results storage directory */
  resultsDir: string;
  /** Benchmarks directory */
  benchmarksDir: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface RunOptions {
  /** Benchmark to run */
  benchmark: string;
  /** Modes to run */
  modes?: EvalMode[];
  /** Specific questions to run */
  questions?: string[];
  /** Output format */
  format?: "json" | "markdown";
  /** Verbose output */
  verbose?: boolean;
}

export interface ReportOptions {
  /** Run ID to report on */
  runId: string;
  /** Output format */
  format: "json" | "markdown" | "table";
  /** Output file path */
  output?: string;
}

export interface CompareOptions {
  /** First run ID */
  runId1: string;
  /** Second run ID */
  runId2: string;
  /** Output format */
  format: "json" | "markdown" | "table";
}

export interface ListOptions {
  /** What to list */
  type: "benchmarks" | "questions" | "runs";
  /** Filter by benchmark (for questions) */
  benchmark?: string;
  /** Limit results */
  limit?: number;
}

export interface ValidateOptions {
  /** Path to questions file */
  path: string;
  /** Output format */
  format: "json" | "text";
}
