/**
 * Analyze Command Implementation
 *
 * Analyzes TypeScript packages and generates seed files.
 * Based on spec Section 11.1: Package Commands
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DEFAULT_PARSER_CONFIG,
  DuckDBPool,
  SeedReader,
  SeedWriter,
  TypeScriptParser,
  computeFileHash,
} from "@devac/core";
import { glob } from "glob";
import type { AnalyzeOptions, AnalyzeResult } from "./types.js";

/**
 * Analyze a package and generate seed files
 */
export async function analyzeCommand(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const startTime = Date.now();

  // Validate path exists
  try {
    await fs.access(options.packagePath);
  } catch {
    return {
      success: false,
      filesAnalyzed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      refsCreated: 0,
      error: `Path does not exist: ${options.packagePath}`,
      timeMs: Date.now() - startTime,
    };
  }

  let pool: DuckDBPool | null = null;

  try {
    // Initialize DuckDB pool
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    // Find TypeScript files
    const tsFiles = await findTypeScriptFiles(options.packagePath);

    if (tsFiles.length === 0) {
      return {
        success: true,
        filesAnalyzed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        refsCreated: 0,
        timeMs: Date.now() - startTime,
      };
    }

    // Check if we can skip (--if-changed flag)
    if (options.ifChanged && !options.force) {
      const hasChanges = await checkForChanges(options.packagePath, tsFiles);
      if (!hasChanges) {
        return {
          success: true,
          filesAnalyzed: 0,
          nodesCreated: 0,
          edgesCreated: 0,
          refsCreated: 0,
          skipped: true,
          timeMs: Date.now() - startTime,
        };
      }
    }

    // Parse and write all files
    const parser = new TypeScriptParser();
    const writer = new SeedWriter(pool, options.packagePath);

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: options.repoName,
      packagePath: options.packagePath,
      branch: options.branch,
    };

    let totalNodes = 0;
    let totalEdges = 0;
    let totalRefs = 0;
    let filesAnalyzed = 0;

    for (const filePath of tsFiles) {
      try {
        const parseResult = await parser.parse(filePath, config);
        const writeResult = await writer.writeFile(parseResult);

        if (writeResult.success) {
          totalNodes += writeResult.nodesWritten;
          totalEdges += writeResult.edgesWritten;
          totalRefs += writeResult.refsWritten;
          filesAnalyzed++;
        }
      } catch (error) {
        console.error(`Error parsing ${filePath}:`, error);
        // Continue with other files
      }
    }

    return {
      success: true,
      filesAnalyzed,
      nodesCreated: totalNodes,
      edgesCreated: totalEdges,
      refsCreated: totalRefs,
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      filesAnalyzed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      refsCreated: 0,
      error: error instanceof Error ? error.message : String(error),
      timeMs: Date.now() - startTime,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Find all TypeScript files in a directory
 */
async function findTypeScriptFiles(packagePath: string): Promise<string[]> {
  const patterns = [path.join(packagePath, "**/*.ts"), path.join(packagePath, "**/*.tsx")];

  const ignorePatterns = [
    "**/node_modules/**",
    "**/.devac/**",
    "**/dist/**",
    "**/build/**",
    "**/*.d.ts",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      ignore: ignorePatterns,
      nodir: true,
      absolute: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)]; // Remove duplicates
}

/**
 * Check if any source files have changed since last analysis
 */
async function checkForChanges(packagePath: string, sourceFiles: string[]): Promise<boolean> {
  try {
    // Try to read existing file hashes from seed reader
    const pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    try {
      const reader = new SeedReader(pool, packagePath);
      const existingHashes = await reader.getFileHashes();

      // If no existing hashes, we need to analyze
      if (existingHashes.size === 0) {
        return true;
      }

      // Check each source file
      for (const filePath of sourceFiles) {
        const currentHash = await computeFileHash(filePath);
        const storedHash = existingHashes.get(filePath);

        if (!storedHash || storedHash !== currentHash) {
          return true; // File changed or new
        }
      }

      // Check for deleted files
      for (const existingPath of Array.from(existingHashes.keys())) {
        if (!sourceFiles.includes(existingPath)) {
          return true; // File was deleted
        }
      }

      return false; // No changes
    } finally {
      await pool.shutdown();
    }
  } catch {
    // If we can't check, assume changes
    return true;
  }
}
