/**
 * Evaluation Runner - orchestrates the complete evaluation pipeline
 */

import { randomUUID } from "node:crypto";
import type {
  BenchmarkSet,
  EvalMode,
  EvalQuestion,
  EvalResponse,
  EvalRun,
  RunConfig,
} from "../types.js";
import { LLMExecutor } from "./llm-executor.js";
import { MCPClient } from "./mcp-client.js";
import { ResponseCollector } from "./response-collector.js";

export interface EvalRunnerOptions {
  /** Anthropic API key */
  apiKey?: string;
  /** Callback for progress updates */
  onProgress?: (event: ProgressEvent) => void;
  /** Callback for verbose logging */
  onLog?: (message: string) => void;
}

export interface ProgressEvent {
  type: "start" | "question" | "mode" | "complete" | "error";
  current: number;
  total: number;
  questionId?: string;
  mode?: EvalMode;
  message?: string;
}

/**
 * Main evaluation runner
 */
export class EvalRunner {
  private options: EvalRunnerOptions;
  private executor: LLMExecutor | null = null;
  private mcpClient: MCPClient | null = null;

  constructor(options: EvalRunnerOptions = {}) {
    this.options = options;
  }

  /**
   * Run evaluation on a benchmark
   */
  async run(benchmark: BenchmarkSet, config: RunConfig): Promise<EvalRun> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const collector = new ResponseCollector();

    // Filter questions if specific IDs provided
    const questions = config.questionIds
      ? benchmark.questions.filter((q) => config.questionIds?.includes(q.id))
      : benchmark.questions;

    const totalSteps = questions.length * config.modes.length;
    let currentStep = 0;

    this.emit({
      type: "start",
      current: 0,
      total: totalSteps,
      message: `Starting evaluation: ${questions.length} questions, modes: ${config.modes.join(", ")}`,
    });

    try {
      // Initialize executor and MCP client if needed
      this.executor = new LLMExecutor({
        apiKey: this.options.apiKey,
        model: config.responseModel,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      if (config.modes.includes("enhanced")) {
        this.mcpClient = new MCPClient({
          apiKey: this.options.apiKey,
          model: config.responseModel,
          hubPath: config.hubPath,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });
        await this.mcpClient.connect();
        this.log(`Connected to MCP server with ${this.mcpClient.getTools().length} tools`);
      }

      // Run evaluations
      for (const question of questions) {
        for (const mode of config.modes) {
          currentStep++;

          this.emit({
            type: "question",
            current: currentStep,
            total: totalSteps,
            questionId: question.id,
            mode,
            message: `Evaluating ${question.id} (${mode})`,
          });

          const response = await this.evaluateQuestion(question, mode);
          collector.add(response);

          this.log(`Completed ${question.id} (${mode}): ${response.metadata.latencyMs}ms`);
        }
      }

      // Cleanup
      if (this.mcpClient) {
        await this.mcpClient.disconnect();
      }

      this.emit({
        type: "complete",
        current: totalSteps,
        total: totalSteps,
        message: "Evaluation complete",
      });

      // Build run result
      const run: EvalRun = {
        id: runId,
        benchmarkId: benchmark.id,
        config,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "completed",
        responses: collector.toArray(),
        pointwiseScores: [], // Filled in by judge step
        pairwiseResults: [], // Filled in by judge step
      };

      return run;
    } catch (error) {
      // Cleanup on error
      if (this.mcpClient) {
        try {
          await this.mcpClient.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }

      this.emit({
        type: "error",
        current: currentStep,
        total: totalSteps,
        message: error instanceof Error ? error.message : String(error),
      });

      const run: EvalRun = {
        id: runId,
        benchmarkId: benchmark.id,
        config,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        responses: collector.toArray(),
        pointwiseScores: [],
        pairwiseResults: [],
      };

      return run;
    }
  }

  /**
   * Evaluate a single question
   */
  private async evaluateQuestion(question: EvalQuestion, mode: EvalMode): Promise<EvalResponse> {
    if (mode === "baseline") {
      if (!this.executor) {
        throw new Error("Executor not initialized");
      }
      const result = await this.executor.executeBaseline(question);
      return LLMExecutor.toEvalResponse(question.id, mode, result);
    }
    if (!this.mcpClient) {
      throw new Error("MCP client not initialized");
    }
    const result = await this.mcpClient.executeEnhanced(question);
    return LLMExecutor.toEvalResponse(question.id, mode, result);
  }

  /**
   * Emit a progress event
   */
  private emit(event: ProgressEvent): void {
    this.options.onProgress?.(event);
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    this.options.onLog?.(message);
  }
}

/**
 * Create and run an evaluation
 */
export async function runEvaluation(
  benchmark: BenchmarkSet,
  config: RunConfig,
  options?: EvalRunnerOptions
): Promise<EvalRun> {
  const runner = new EvalRunner(options);
  return runner.run(benchmark, config);
}
