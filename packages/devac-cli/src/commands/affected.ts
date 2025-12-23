/**
 * Affected Command Implementation
 *
 * Analyzes which files are affected by changes to specified files.
 * Uses symbol-level analysis for precise impact detection.
 * Based on spec Section 10.1 and Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DuckDBPool, SeedReader, createSymbolAffectedAnalyzer } from "@pietgk/devac-core";
import type { Command } from "commander";

/**
 * Options for affected command
 */
export interface AffectedCommandOptions {
  /** Path to the package to analyze */
  packagePath: string;
  /** Changed files to analyze */
  changedFiles: string[];
  /** Maximum traversal depth (default: 10) */
  maxDepth?: number;
  /** Output format */
  format?: "json" | "list" | "tree";
}

/**
 * Result from affected command
 */
export interface AffectedCommandResult {
  success: boolean;
  changedSymbols: Array<{
    entityId: string;
    name: string;
    kind: string;
    filePath: string;
  }>;
  affectedFiles: Array<{
    filePath: string;
    impactLevel: "direct" | "transitive";
    depth: number;
  }>;
  totalAffected: number;
  analysisTimeMs: number;
  error?: string;
}

/**
 * Analyze affected files for given changed files
 */
export async function affectedCommand(
  options: AffectedCommandOptions
): Promise<AffectedCommandResult> {
  const startTime = Date.now();

  // Validate package path exists
  try {
    await fs.access(options.packagePath);
  } catch {
    return createErrorResult(`Path does not exist: ${options.packagePath}`, startTime);
  }

  // Handle empty changed files
  if (options.changedFiles.length === 0) {
    return {
      success: true,
      changedSymbols: [],
      affectedFiles: [],
      totalAffected: 0,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create seed reader and analyzer
    const seedReader = new SeedReader(pool, options.packagePath);
    const analyzer = createSymbolAffectedAnalyzer(pool, options.packagePath, seedReader);

    // Run affected analysis
    const result = await analyzer.analyzeFileChanges(
      options.changedFiles,
      {},
      {
        maxDepth: options.maxDepth ?? 10,
      }
    );

    // Map to command result format
    const changedSymbols = result.changedSymbols.map((symbol) => ({
      entityId: symbol.entityId,
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
    }));

    const affectedFiles = result.affectedFiles.map((file) => ({
      filePath: file.filePath,
      impactLevel: file.impactLevel,
      depth: file.depth,
    }));

    return {
      success: true,
      changedSymbols,
      affectedFiles,
      totalAffected: result.totalAffected,
      analysisTimeMs: result.analysisTimeMs,
    };
  } catch (error) {
    return createErrorResult(error instanceof Error ? error.message : String(error), startTime);
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Create an error result
 */
function createErrorResult(error: string, startTime: number): AffectedCommandResult {
  return {
    success: false,
    changedSymbols: [],
    affectedFiles: [],
    totalAffected: 0,
    analysisTimeMs: Date.now() - startTime,
    error,
  };
}

/**
 * Register the affected command with the CLI program
 */
export function registerAffectedCommand(program: Command): void {
  program
    .command("affected")
    .description("Find files affected by changes")
    .option("-p, --package <path>", "Package path to analyze", process.cwd())
    .option("-f, --files <files...>", "Changed files to analyze")
    .option("-d, --max-depth <depth>", "Maximum traversal depth", "10")
    .option("--format <format>", "Output format (json, list, tree)", "json")
    .option("--json", "Output as JSON (shorthand for --format json)")
    .action(async (options) => {
      const format = options.json ? "json" : options.format;
      const result = await affectedCommand({
        packagePath: path.resolve(options.package),
        changedFiles: options.files || [],
        maxDepth: options.maxDepth ? Number.parseInt(options.maxDepth, 10) : undefined,
        format,
      });

      if (result.success) {
        switch (format) {
          case "list":
            for (const file of result.affectedFiles) {
              console.log(`${file.filePath} (${file.impactLevel}, depth=${file.depth})`);
            }
            break;
          case "tree":
            console.log(`Changed symbols: ${result.changedSymbols.length}`);
            for (const sym of result.changedSymbols) {
              console.log(`  ${sym.kind} ${sym.name} (${sym.filePath})`);
            }
            console.log(`\nAffected files: ${result.totalAffected}`);
            for (const file of result.affectedFiles) {
              console.log(`  ${"  ".repeat(file.depth)}${file.filePath}`);
            }
            break;
          default:
            console.log(JSON.stringify(result, null, 2));
        }
        console.error(`\n(${result.analysisTimeMs}ms)`);
      } else {
        console.error(`✗ Analysis failed: ${result.error}`);
        process.exit(1);
      }
    });
}
