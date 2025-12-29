/**
 * Configuration for the evaluation framework
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EvalConfig } from "./types.js";

export interface Config extends EvalConfig {
  /** Resolved paths */
  resolved: {
    resultsDir: string;
    benchmarksDir: string;
  };
}

/**
 * Default configuration values
 */
export const defaultConfig: EvalConfig = {
  resultsDir: "./results",
  benchmarksDir: "./benchmarks",
};

/**
 * Load configuration from file or use defaults
 */
export async function loadConfig(
  configPath?: string,
  overrides?: Partial<EvalConfig>
): Promise<Config> {
  let fileConfig: Partial<EvalConfig> = {};

  // Try to load config file if path provided
  if (configPath && existsSync(configPath)) {
    try {
      const content = await readFile(configPath, "utf-8");
      fileConfig = JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Could not load config from ${configPath}:`, error);
    }
  }

  // Merge configs: defaults < file < overrides
  const merged: EvalConfig = {
    ...defaultConfig,
    ...fileConfig,
    ...overrides,
  };

  // Resolve paths relative to current working directory
  const basePath = configPath ? resolve(configPath, "..") : process.cwd();

  const config: Config = {
    ...merged,
    resolved: {
      resultsDir: resolve(basePath, merged.resultsDir),
      benchmarksDir: resolve(basePath, merged.benchmarksDir),
    },
  };

  return config;
}

/**
 * Get the path to the built-in benchmarks directory
 */
export function getBuiltinBenchmarksPath(): string {
  // Navigate from dist/config.js to benchmarks/
  // import.meta.dirname = .../devac-eval/dist
  // .. = .../devac-eval
  // benchmarks = .../devac-eval/benchmarks
  return join(import.meta.dirname, "..", "benchmarks");
}
