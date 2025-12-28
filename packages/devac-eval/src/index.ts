/**
 * DevAC Answer Quality Evaluation Framework
 *
 * A framework for measuring LLM answer quality with and without DevAC tooling.
 *
 * @packageDocumentation
 */

// Core types
export * from "./types.js";

// Configuration
export { defaultConfig, loadConfig, type Config } from "./config.js";

// Benchmark loading
export {
  loadBenchmark,
  loadQuestion,
  listBenchmarks,
} from "./benchmark/question-loader.js";
export { validateQuestion, validateBenchmark } from "./benchmark/question-validator.js";

// Runner
export { EvalRunner } from "./runner/eval-runner.js";
export { ClaudeCLIExecutor } from "./runner/claude-cli-executor.js";

// Judge
export { LLMJudge } from "./judge/llm-judge.js";
export { calculateMetrics } from "./judge/metrics.js";

// Storage
export { ResultWriter } from "./storage/result-writer.js";
export { ResultReader } from "./storage/result-reader.js";

// Reporter
export { SummaryReporter } from "./reporter/summary-reporter.js";
export { ComparisonReporter } from "./reporter/comparison-reporter.js";
