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
    hubPath?: string;
  };
}

/**
 * Default configuration values
 */
export const defaultConfig: EvalConfig = {
  defaultResponseModel: "claude-sonnet-4-20250514",
  defaultJudgeModel: "claude-sonnet-4-20250514",
  resultsDir: "./results",
  benchmarksDir: "./benchmarks",
  defaultHubPath: undefined,
  anthropicApiKey: undefined,
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

  // Get API key from environment if not specified
  if (!merged.anthropicApiKey) {
    merged.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  // Resolve paths relative to current working directory
  const basePath = configPath ? resolve(configPath, "..") : process.cwd();

  const config: Config = {
    ...merged,
    resolved: {
      resultsDir: resolve(basePath, merged.resultsDir),
      benchmarksDir: resolve(basePath, merged.benchmarksDir),
      hubPath: merged.defaultHubPath ? resolve(basePath, merged.defaultHubPath) : undefined,
    },
  };

  return config;
}

/**
 * Get the path to the built-in benchmarks directory
 */
export function getBuiltinBenchmarksPath(): string {
  // Navigate from dist/config.js to benchmarks/
  return join(import.meta.dirname, "..", "..", "benchmarks");
}
