/**
 * Load and manage benchmark question sets
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getBuiltinBenchmarksPath } from "../config.js";
import type { BenchmarkSet, EvalQuestion } from "../types.js";

export interface BenchmarkInfo {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  path: string;
}

/**
 * Load a benchmark set by ID or path
 */
export async function loadBenchmark(
  benchmarkIdOrPath: string,
  searchPaths?: string[]
): Promise<BenchmarkSet> {
  const paths = [
    // Direct path
    benchmarkIdOrPath,
    // Built-in benchmarks
    join(getBuiltinBenchmarksPath(), benchmarkIdOrPath, "questions.json"),
    // Search paths
    ...(searchPaths?.map((p) => join(p, benchmarkIdOrPath, "questions.json")) ?? []),
  ];

  for (const path of paths) {
    const resolvedPath = resolve(path);
    if (existsSync(resolvedPath)) {
      try {
        const content = await readFile(resolvedPath, "utf-8");
        const data = JSON.parse(content);
        return data as BenchmarkSet;
      } catch (error) {
        throw new Error(`Failed to parse benchmark at ${resolvedPath}: ${error}`);
      }
    }
  }

  throw new Error(`Benchmark not found: ${benchmarkIdOrPath}. Searched paths: ${paths.join(", ")}`);
}

/**
 * Load a single question by ID from a benchmark
 */
export async function loadQuestion(
  benchmarkIdOrPath: string,
  questionId: string,
  searchPaths?: string[]
): Promise<EvalQuestion> {
  const benchmark = await loadBenchmark(benchmarkIdOrPath, searchPaths);
  const question = benchmark.questions.find((q) => q.id === questionId);

  if (!question) {
    throw new Error(`Question ${questionId} not found in benchmark ${benchmarkIdOrPath}`);
  }

  return question;
}

/**
 * List all available benchmarks
 */
export async function listBenchmarks(searchPaths?: string[]): Promise<BenchmarkInfo[]> {
  const benchmarks: BenchmarkInfo[] = [];
  const seenIds = new Set<string>();

  // Built-in benchmarks
  const builtinPath = getBuiltinBenchmarksPath();
  if (existsSync(builtinPath)) {
    const dirs = await readdir(builtinPath, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory() && !dir.name.startsWith(".")) {
        const questionsPath = join(builtinPath, dir.name, "questions.json");
        if (existsSync(questionsPath)) {
          try {
            const benchmark = await loadBenchmark(questionsPath);
            if (!seenIds.has(benchmark.id)) {
              seenIds.add(benchmark.id);
              benchmarks.push({
                id: benchmark.id,
                name: benchmark.name,
                description: benchmark.description,
                questionCount: benchmark.questions.length,
                path: questionsPath,
              });
            }
          } catch {
            // Skip invalid benchmarks
          }
        }
      }
    }
  }

  // Additional search paths
  for (const searchPath of searchPaths ?? []) {
    if (existsSync(searchPath)) {
      const dirs = await readdir(searchPath, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory() && !dir.name.startsWith(".")) {
          const questionsPath = join(searchPath, dir.name, "questions.json");
          if (existsSync(questionsPath)) {
            try {
              const benchmark = await loadBenchmark(questionsPath);
              if (!seenIds.has(benchmark.id)) {
                seenIds.add(benchmark.id);
                benchmarks.push({
                  id: benchmark.id,
                  name: benchmark.name,
                  description: benchmark.description,
                  questionCount: benchmark.questions.length,
                  path: questionsPath,
                });
              }
            } catch {
              // Skip invalid benchmarks
            }
          }
        }
      }
    }
  }

  return benchmarks;
}
