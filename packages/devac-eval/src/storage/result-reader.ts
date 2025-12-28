/**
 * Result Reader - reads evaluation results from disk
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EvalRun, RunSummary } from "../types.js";
import type { RunIndex } from "./result-writer.js";

export interface ResultReaderOptions {
  /** Base directory for results */
  resultsDir: string;
}

export interface RunInfo {
  id: string;
  benchmarkId: string;
  startedAt: string;
  status: string;
  questionCount: number;
  enhancedWinRate?: number;
  path: string;
}

/**
 * Read evaluation results from disk
 */
export class ResultReader {
  private resultsDir: string;

  constructor(options: ResultReaderOptions) {
    this.resultsDir = resolve(options.resultsDir);
  }

  /**
   * List all available runs
   */
  async listRuns(limit?: number): Promise<RunInfo[]> {
    const indexPath = join(this.resultsDir, "index.json");

    if (!existsSync(indexPath)) {
      return [];
    }

    const content = await readFile(indexPath, "utf-8");
    const index: RunIndex = JSON.parse(content);

    let runs = index.runs.map((r) => ({
      ...r,
      path: this.getRunPath(r.id, r.startedAt),
    }));

    if (limit) {
      runs = runs.slice(0, limit);
    }

    return runs;
  }

  /**
   * Load a full evaluation run
   */
  async loadRun(runIdOrPath: string): Promise<EvalRun> {
    let runPath: string;

    // Check if it's a direct path
    if (existsSync(runIdOrPath)) {
      runPath = runIdOrPath;
    } else {
      // Try to find by ID
      runPath = await this.findRunPath(runIdOrPath);
    }

    const runFile = join(runPath, "run.json");
    if (!existsSync(runFile)) {
      throw new Error(`Run file not found: ${runFile}`);
    }

    const content = await readFile(runFile, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Load just the summary for a run
   */
  async loadSummary(runIdOrPath: string): Promise<RunSummary | null> {
    let runPath: string;

    if (existsSync(runIdOrPath)) {
      runPath = runIdOrPath;
    } else {
      runPath = await this.findRunPath(runIdOrPath);
    }

    const summaryFile = join(runPath, "summary.json");
    if (!existsSync(summaryFile)) {
      return null;
    }

    const content = await readFile(summaryFile, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Check if a run exists
   */
  async runExists(runId: string): Promise<boolean> {
    try {
      await this.findRunPath(runId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find run path by ID (partial match supported)
   */
  private async findRunPath(runId: string): Promise<string> {
    const runsDir = join(this.resultsDir, "runs");

    if (!existsSync(runsDir)) {
      throw new Error(`Runs directory not found: ${runsDir}`);
    }

    const dirs = await readdir(runsDir);

    // Exact match on full ID or partial ID
    for (const dir of dirs) {
      if (dir.includes(runId) || dir.endsWith(`-${runId.slice(0, 8)}`)) {
        const fullPath = join(runsDir, dir);
        if (existsSync(join(fullPath, "run.json"))) {
          return fullPath;
        }
      }
    }

    // Try loading index and matching
    const indexPath = join(this.resultsDir, "index.json");
    if (existsSync(indexPath)) {
      const content = await readFile(indexPath, "utf-8");
      const index: RunIndex = JSON.parse(content);

      const match = index.runs.find((r) => r.id === runId || r.id.startsWith(runId));
      if (match) {
        const path = this.getRunPath(match.id, match.startedAt);
        if (existsSync(path)) {
          return path;
        }
      }
    }

    throw new Error(`Run not found: ${runId}`);
  }

  /**
   * Get the expected path for a run
   */
  private getRunPath(runId: string, startedAt: string): string {
    const date = startedAt.split("T")[0];
    const runName = `${date}-${runId.slice(0, 8)}`;
    return join(this.resultsDir, "runs", runName);
  }

  /**
   * Get the results directory
   */
  getResultsDir(): string {
    return this.resultsDir;
  }
}
