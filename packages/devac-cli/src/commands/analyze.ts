/**
 * Analyze Command Implementation
 *
 * Analyzes TypeScript packages and generates seed files.
 * Based on spec Section 11.1: Package Commands
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  CSharpParser,
  DEFAULT_PARSER_CONFIG,
  DuckDBPool,
  PythonParser,
  SeedReader,
  SeedWriter,
  TypeScriptParser,
  computeFileHash,
  createLogger,
  discoverAllPackages,
  findGitRoot,
  getSemanticResolverFactory,
  toUnresolvedRef,
} from "@pietgk/devac-core";
import type { PackageInfo } from "@pietgk/devac-core";
import type { Command } from "commander";

import { glob } from "glob";
import type { AnalyzeOptions, AnalyzeResult } from "./types.js";

const logger = createLogger({ prefix: "[Analyze]" });

/**
 * Compute relative package path for entity ID generation.
 *
 * Entity IDs should use paths relative to repo root, not absolute paths.
 * This ensures portable, consistent entity IDs across different machines.
 *
 * @param absolutePackagePath - Absolute path to the package
 * @returns Package path relative to repo root, or package name if not in a repo
 */
async function computeRelativePackagePath(absolutePackagePath: string): Promise<string> {
  const resolvedPath = path.resolve(absolutePackagePath);

  // Try to find git root
  const repoRoot = await findGitRoot(resolvedPath);

  if (repoRoot) {
    // Make path relative to repo root
    const relativePath = path.relative(repoRoot, resolvedPath);
    // If the result is empty (package is at repo root), use "."
    return relativePath || ".";
  }

  // Fallback: use just the package directory name
  // This handles cases where we're not in a git repo
  return path.basename(resolvedPath);
}

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

  // Handle --all flag: discover and analyze all packages
  if (options.all) {
    return analyzeAllPackages(options, startTime);
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

    // Compute relative package path for entity ID generation
    const relativePackagePath = await computeRelativePackagePath(options.packagePath);

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: options.repoName,
      packagePath: relativePackagePath,
      packageRoot: path.resolve(options.packagePath),
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
        logger.warn(
          `Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue with other files
      }
    }

    // Run semantic resolution if requested
    let refsResolved = 0;
    if (options.resolve && totalRefs > 0) {
      try {
        refsResolved = await runSemanticResolution(pool, options.packagePath, options.branch);
      } catch (error) {
        logger.debug(
          `Semantic resolution failed: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue - structural analysis succeeded
      }
    }

    return {
      success: true,
      filesAnalyzed,
      nodesCreated: totalNodes,
      edgesCreated: totalEdges,
      refsCreated: totalRefs,
      refsResolved: options.resolve ? refsResolved : undefined,
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
 * Run semantic resolution pass
 */
async function runSemanticResolution(
  pool: DuckDBPool,
  packagePath: string,
  branch: string
): Promise<number> {
  // 1. Read unresolved refs from seeds
  const reader = new SeedReader(pool, packagePath);
  const unresolvedRefs = await reader.getUnresolvedRefs(branch);

  if (unresolvedRefs.length === 0) {
    return 0;
  }

  // 2. Get semantic resolver
  const factory = getSemanticResolverFactory();
  const language = factory.detectPackageLanguage(packagePath);

  if (!language) {
    logger.debug(`Could not detect language for package: ${packagePath}`);
    return 0;
  }

  const resolver = factory.getResolver(language);
  if (!resolver) {
    logger.debug(`No semantic resolver available for language: ${language}`);
    return 0;
  }

  const isAvailable = await resolver.isAvailable();
  if (!isAvailable) {
    logger.debug(`Semantic resolver for ${language} is not available`);
    return 0;
  }

  // 3. Resolve all refs
  const refs = unresolvedRefs.map(toUnresolvedRef);
  const result = await resolver.resolvePackage(packagePath, refs);

  // 4. Update seeds with resolved refs
  if (result.resolvedRefs.length > 0) {
    const writer = new SeedWriter(pool, packagePath);
    const updates = result.resolvedRefs.map((resolved) => ({
      sourceEntityId: resolved.ref.sourceEntityId,
      moduleSpecifier: resolved.ref.moduleSpecifier,
      importedSymbol: resolved.ref.importedSymbol,
      targetEntityId: resolved.targetEntityId,
    }));

    const updateResult = await writer.updateResolvedRefs(updates, { branch });

    if (!updateResult.success) {
      logger.warn(`Failed to update resolved refs: ${updateResult.error}`);
    }
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      logger.debug(
        `Resolution error for ${error.ref.moduleSpecifier}:${error.ref.importedSymbol}: ${error.error}`
      );
    }
  }

  return result.resolved;
}

/**
 * Find all TypeScript files in a directory
 */
async function findTypeScriptFiles(packagePath: string): Promise<string[]> {
  const patterns = ["**/*.ts", "**/*.tsx"];

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

  // Resolve symlinks in package path (important for MacOS temp dirs)
  const realPackagePath = await fs.realpath(packagePath);

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: realPackagePath,
      ignore: ignorePatterns,
      nodir: true,
      absolute: true,
      follow: true,
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

// ============================================================================
// Multi-Package Analysis (--all flag)
// ============================================================================

/**
 * Analyze all discovered packages in the repository
 */
async function analyzeAllPackages(
  options: AnalyzeOptions,
  startTime: number
): Promise<AnalyzeResult> {
  const allLogger = createLogger({ prefix: "[Analyze All]" });

  // Discover all packages
  const discovery = await discoverAllPackages(options.packagePath);

  if (discovery.packages.length === 0) {
    allLogger.info("No packages found to analyze");
    return {
      success: true,
      filesAnalyzed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      refsCreated: 0,
      timeMs: Date.now() - startTime,
    };
  }

  allLogger.info(
    `Discovered ${discovery.packages.length} packages (${discovery.detectedPackageManager || "mixed"})`
  );

  // Aggregate results
  let totalFiles = 0;
  let totalNodes = 0;
  let totalEdges = 0;
  let totalRefs = 0;
  let totalResolved = 0;
  const errors: string[] = [];
  let successCount = 0;

  // Analyze each package
  for (const pkg of discovery.packages) {
    try {
      allLogger.info(`Analyzing ${pkg.name} (${pkg.language}) at ${pkg.path}`);

      const result = await analyzeSinglePackage(pkg, options);

      totalFiles += result.filesAnalyzed;
      totalNodes += result.nodesCreated;
      totalEdges += result.edgesCreated;
      totalRefs += result.refsCreated;
      if (result.refsResolved !== undefined) {
        totalResolved += result.refsResolved;
      }

      if (result.success) {
        successCount++;
        allLogger.info(`  ✓ ${pkg.name}: ${result.filesAnalyzed} files`);
      } else if (result.error) {
        errors.push(`${pkg.name}: ${result.error}`);
        allLogger.warn(`  ✗ ${pkg.name}: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${pkg.name}: ${errorMsg}`);
      allLogger.warn(`  ✗ ${pkg.name}: ${errorMsg}`);
      // Continue with remaining packages
    }
  }

  // Log discovery errors
  for (const err of discovery.errors) {
    errors.push(`Discovery: ${err.path}: ${err.error}`);
  }

  allLogger.info(
    `Completed: ${successCount}/${discovery.packages.length} packages, ${totalFiles} files`
  );

  return {
    success: errors.length === 0,
    filesAnalyzed: totalFiles,
    nodesCreated: totalNodes,
    edgesCreated: totalEdges,
    refsCreated: totalRefs,
    refsResolved: options.resolve ? totalResolved : undefined,
    error: errors.length > 0 ? errors.join("; ") : undefined,
    timeMs: Date.now() - startTime,
  };
}

/**
 * Analyze a single package based on its language
 */
async function analyzeSinglePackage(
  pkg: PackageInfo,
  options: AnalyzeOptions
): Promise<AnalyzeResult> {
  const startTime = Date.now();

  switch (pkg.language) {
    case "typescript":
    case "javascript":
      return analyzeTypeScriptPackage(pkg, options, startTime);
    case "python":
      return analyzePythonPackage(pkg, options, startTime);
    case "csharp":
      return analyzeCSharpPackage(pkg, options, startTime);
    default:
      return {
        success: false,
        filesAnalyzed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        refsCreated: 0,
        error: `Unknown language: ${pkg.language}`,
        timeMs: Date.now() - startTime,
      };
  }
}

/**
 * Analyze a TypeScript/JavaScript package
 */
async function analyzeTypeScriptPackage(
  pkg: PackageInfo,
  options: AnalyzeOptions,
  startTime: number
): Promise<AnalyzeResult> {
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    const tsFiles = await findTypeScriptFiles(pkg.path);
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

    const parser = new TypeScriptParser();
    const writer = new SeedWriter(pool, pkg.path);

    // Compute relative package path for entity ID generation
    const relativePackagePath = await computeRelativePackagePath(pkg.path);

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: options.repoName,
      packagePath: relativePackagePath,
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
        logger.debug(
          `Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Run semantic resolution if requested
    let refsResolved = 0;
    if (options.resolve && totalRefs > 0) {
      try {
        refsResolved = await runSemanticResolution(pool, pkg.path, options.branch);
      } catch {
        // Continue - structural analysis succeeded
      }
    }

    return {
      success: true,
      filesAnalyzed,
      nodesCreated: totalNodes,
      edgesCreated: totalEdges,
      refsCreated: totalRefs,
      refsResolved: options.resolve ? refsResolved : undefined,
      timeMs: Date.now() - startTime,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Analyze a Python package
 */
async function analyzePythonPackage(
  pkg: PackageInfo,
  options: AnalyzeOptions,
  startTime: number
): Promise<AnalyzeResult> {
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    const pyFiles = await findPythonFiles(pkg.path);
    if (pyFiles.length === 0) {
      return {
        success: true,
        filesAnalyzed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        refsCreated: 0,
        timeMs: Date.now() - startTime,
      };
    }

    const parser = new PythonParser();
    const writer = new SeedWriter(pool, pkg.path);

    // Compute relative package path for entity ID generation
    const relativePackagePath = await computeRelativePackagePath(pkg.path);

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: options.repoName,
      packagePath: relativePackagePath,
      branch: options.branch,
    };

    let totalNodes = 0;
    let totalEdges = 0;
    let totalRefs = 0;
    let filesAnalyzed = 0;

    for (const filePath of pyFiles) {
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
        logger.debug(
          `Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
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
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Analyze a C# package
 */
async function analyzeCSharpPackage(
  pkg: PackageInfo,
  options: AnalyzeOptions,
  startTime: number
): Promise<AnalyzeResult> {
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();

    const csFiles = await findCSharpFiles(pkg.path);
    if (csFiles.length === 0) {
      return {
        success: true,
        filesAnalyzed: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        refsCreated: 0,
        timeMs: Date.now() - startTime,
      };
    }

    const parser = new CSharpParser();
    const writer = new SeedWriter(pool, pkg.path);

    // Compute relative package path for entity ID generation
    const relativePackagePath = await computeRelativePackagePath(pkg.path);

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: options.repoName,
      packagePath: relativePackagePath,
      branch: options.branch,
    };

    let totalNodes = 0;
    let totalEdges = 0;
    let totalRefs = 0;
    let filesAnalyzed = 0;

    for (const filePath of csFiles) {
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
        logger.debug(
          `Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
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
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Find all Python files in a directory
 */
async function findPythonFiles(packagePath: string): Promise<string[]> {
  const patterns = ["**/*.py"];

  const ignorePatterns = [
    "**/node_modules/**",
    "**/.devac/**",
    "**/dist/**",
    "**/build/**",
    "**/.venv/**",
    "**/venv/**",
    "**/__pycache__/**",
    "**/.tox/**",
    "**/.pytest_cache/**",
    "**/.mypy_cache/**",
    "**/*_test.py",
    "**/test_*.py",
    "**/conftest.py",
  ];

  const files: string[] = [];

  // Resolve symlinks in package path (important for MacOS temp dirs)
  const realPackagePath = await fs.realpath(packagePath);

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: realPackagePath,
      ignore: ignorePatterns,
      nodir: true,
      absolute: true,
      follow: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)];
}

/**
 * Find all C# files in a directory
 */
async function findCSharpFiles(packagePath: string): Promise<string[]> {
  const patterns = ["**/*.cs"];

  const ignorePatterns = [
    "**/node_modules/**",
    "**/.devac/**",
    "**/bin/**",
    "**/obj/**",
    "**/dist/**",
    "**/build/**",
    "**/*.Designer.cs",
    "**/*.g.cs",
    "**/*.g.i.cs",
  ];

  const files: string[] = [];

  // Resolve symlinks in package path (important for MacOS temp dirs)
  const realPackagePath = await fs.realpath(packagePath);

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: realPackagePath,
      ignore: ignorePatterns,
      nodir: true,
      absolute: true,
      follow: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)];
}

/**
 * Register the analyze command with the CLI program
 */
export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .alias("extract")
    .description("Analyze package and generate seed files (alias: extract)")
    .option("-p, --package <path>", "Package path to analyze", process.cwd())
    .option("-r, --repo <name>", "Repository name", "repo")
    .option("-b, --branch <name>", "Git branch name", "main")
    .option("--if-changed", "Only analyze if source files changed")
    .option("--force", "Force full reanalysis")
    .option("--all", "Analyze all packages in repository")
    .option("--resolve", "Run semantic resolution after structural analysis")
    .action(async (options) => {
      const result = await analyzeCommand({
        packagePath: path.resolve(options.package),
        repoName: options.repo,
        branch: options.branch,
        ifChanged: options.ifChanged,
        force: options.force,
        all: options.all,
        resolve: options.resolve,
      });

      if (result.success) {
        if (result.skipped) {
          console.log("No changes detected - skipped analysis");
        } else if (options.all) {
          console.log(
            `✓ Analyzed ${result.filesAnalyzed} files across packages in ${result.timeMs}ms`
          );
          console.log(`  Total Nodes: ${result.nodesCreated}`);
          console.log(`  Total Edges: ${result.edgesCreated}`);
          console.log(`  Total External refs: ${result.refsCreated}`);
          if (result.refsResolved !== undefined) {
            console.log(`  Total Refs resolved: ${result.refsResolved}`);
          }
        } else {
          console.log(`✓ Analyzed ${result.filesAnalyzed} files in ${result.timeMs}ms`);
          console.log(`  Nodes: ${result.nodesCreated}`);
          console.log(`  Edges: ${result.edgesCreated}`);
          console.log(`  External refs: ${result.refsCreated}`);
          if (result.refsResolved !== undefined) {
            console.log(`  Refs resolved: ${result.refsResolved}`);
          }
        }
      } else {
        console.error(`✗ Analysis failed: ${result.error}`);
        process.exit(1);
      }
    });
}
