/**
 * Result Writer - persists evaluation results to disk
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { calculateMetrics } from "../judge/metrics.js";
import type { EvalRun } from "../types.js";

export interface ResultWriterOptions {
  /** Base directory for results */
  resultsDir: string;
}

export interface RunIndex {
  runs: Array<{
    id: string;
    benchmarkId: string;
    startedAt: string;
    status: string;
    questionCount: number;
    enhancedWinRate?: number;
  }>;
  lastUpdated: string;
}

/**
 * Write evaluation results to disk
 */
export class ResultWriter {
  private resultsDir: string;

  constructor(options: ResultWriterOptions) {
    this.resultsDir = resolve(options.resultsDir);
  }

  /**
   * Save an evaluation run
   */
  async saveRun(run: EvalRun): Promise<string> {
    // Create directory structure
    const runDir = await this.createRunDir(run.id, run.startedAt);

    // Calculate summary if not present
    if (!run.summary && run.status === "completed") {
      run.summary = calculateMetrics(run);
    }

    // Write full run data
    await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2));

    // Write summary separately for quick access
    if (run.summary) {
      await writeFile(join(runDir, "summary.json"), JSON.stringify(run.summary, null, 2));
    }

    // Write responses separately
    await mkdir(join(runDir, "responses"), { recursive: true });
    const baselineResponses = run.responses.filter((r) => r.mode === "baseline");
    const enhancedResponses = run.responses.filter((r) => r.mode === "enhanced");

    await writeFile(
      join(runDir, "responses", "baseline.json"),
      JSON.stringify(baselineResponses, null, 2)
    );
    await writeFile(
      join(runDir, "responses", "enhanced.json"),
      JSON.stringify(enhancedResponses, null, 2)
    );

    // Write scores separately
    await mkdir(join(runDir, "scores"), { recursive: true });
    await writeFile(
      join(runDir, "scores", "pointwise.json"),
      JSON.stringify(run.pointwiseScores, null, 2)
    );
    await writeFile(
      join(runDir, "scores", "pairwise.json"),
      JSON.stringify(run.pairwiseResults, null, 2)
    );

    // Update index
    await this.updateIndex(run);

    return runDir;
  }

  /**
   * Create run directory
   */
  private async createRunDir(runId: string, startedAt: string): Promise<string> {
    const date = startedAt.split("T")[0];
    const runName = `${date}-${runId.slice(0, 8)}`;
    const runDir = join(this.resultsDir, "runs", runName);
    await mkdir(runDir, { recursive: true });
    return runDir;
  }

  /**
   * Update the index file
   */
  private async updateIndex(run: EvalRun): Promise<void> {
    const indexPath = join(this.resultsDir, "index.json");
    let index: RunIndex;

    if (existsSync(indexPath)) {
      const content = await readFile(indexPath, "utf-8");
      index = JSON.parse(content);
    } else {
      index = { runs: [], lastUpdated: "" };
    }

    // Remove existing entry for this run if present
    index.runs = index.runs.filter((r) => r.id !== run.id);

    // Calculate win rate if summary available
    let enhancedWinRate: number | undefined;
    if (run.summary) {
      const total = run.summary.enhancedWins + run.summary.baselineWins + run.summary.ties;
      if (total > 0) {
        enhancedWinRate = run.summary.enhancedWins / total;
      }
    }

    // Add new entry
    index.runs.push({
      id: run.id,
      benchmarkId: run.benchmarkId,
      startedAt: run.startedAt,
      status: run.status,
      questionCount: run.summary?.totalQuestions ?? run.responses.length / 2,
      enhancedWinRate,
    });

    // Sort by date descending
    index.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    index.lastUpdated = new Date().toISOString();

    await mkdir(this.resultsDir, { recursive: true });
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Get the results directory path
   */
  getResultsDir(): string {
    return this.resultsDir;
  }
}
