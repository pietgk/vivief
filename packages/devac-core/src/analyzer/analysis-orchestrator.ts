/**
 * Analysis Orchestrator
 *
 * Coordinates the analysis pipeline, connecting file events to
 * the parsing and writing subsystems.
 *
 * Based on DevAC v2.0 spec Section 6.6
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

import { applyMappings, loadEffectMappings } from "../effects/index.js";
import type { ParserConfig } from "../parsers/parser-interface.js";
import { DEFAULT_PARSER_CONFIG } from "../parsers/parser-interface.js";
import {
  type ResolvedCallEdge,
  type ResolvedExtendsEdge,
  type ResolvedRef,
  type UnresolvedRef,
  getSemanticResolverFactory,
  toUnresolvedRef,
} from "../semantic/index.js";
import type { DuckDBPool } from "../storage/duckdb-pool.js";
import { createSeedReader } from "../storage/seed-reader.js";
import type {
  ResolvedCallEdgeUpdate,
  ResolvedExtendsEdgeUpdate,
  ResolvedRefUpdate,
  SeedWriter,
} from "../storage/seed-writer.js";
import { findGitRoot } from "../workspace/discover.js";
import type { LanguageRouter } from "./language-router.js";

// ============================================================================
// Types
// ============================================================================

/**
 * File change event from file watcher or CLI
 */
export interface FileChangeEvent {
  type: "add" | "change" | "unlink";
  filePath: string;
  packagePath: string;
  timestamp: number;
}

/**
 * Result of analyzing a single file
 */
export interface AnalysisResult {
  filePath: string;
  success: boolean;
  nodeCount: number;
  edgeCount: number;
  refCount: number;
  parseTimeMs: number;
  writeTimeMs: number;
  error?: string;
  warnings?: string[];
}

/**
 * Result of analyzing an entire package
 */
export interface PackageResult {
  packagePath: string;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  totalNodes: number;
  totalEdges: number;
  totalRefs: number;
  totalTimeMs: number;
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Result of analyzing a batch of file changes
 */
export interface BatchResult {
  events: FileChangeEvent[];
  results: AnalysisResult[];
  totalTimeMs: number;
}

/**
 * Semantic resolution result (Phase 4)
 */
export interface ResolutionResult {
  packagePath: string;
  refsResolved: number;
  refsFailed: number;
  callsResolved: number;
  callsFailed: number;
  extendsResolved: number;
  extendsFailed: number;
  totalTimeMs: number;
}

/**
 * Current orchestrator status
 */
export interface OrchestratorStatus {
  mode: "idle" | "analyzing" | "resolving";
  currentFile?: string;
  progress?: {
    completed: number;
    total: number;
    percentage: number;
  };
  lastError?: string;
}

/**
 * Analysis Orchestrator interface
 */
export interface AnalysisOrchestrator {
  /**
   * Analyze a single file (CLI or watch mode).
   * Routes to appropriate parser, writes seeds atomically.
   */
  analyzeFile(event: FileChangeEvent): Promise<AnalysisResult>;

  /**
   * Analyze all supported files in a package (CLI mode).
   * Scans directory, batches by language, writes seeds.
   */
  analyzePackage(packagePath: string): Promise<PackageResult>;

  /**
   * Analyze a batch of file changes (watch mode).
   * Groups by package, processes in parallel where safe.
   */
  analyzeBatch(events: FileChangeEvent[]): Promise<BatchResult>;

  /**
   * Trigger semantic resolution pass (Phase 4).
   * Called after structural analysis settles.
   */
  resolveSemantics(packagePath: string): Promise<ResolutionResult>;

  /**
   * Get current analysis status and progress.
   */
  getStatus(): OrchestratorStatus;
}

/**
 * Options for creating the orchestrator
 */
export interface OrchestratorOptions {
  /** Maximum files to process in parallel (default: 50) */
  batchSize?: number;
  /** Maximum concurrent file operations (default: 10) */
  concurrency?: number;
  /** Repository name for entity IDs */
  repoName?: string;
  /** Branch name (default: "main") */
  branch?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default batch size for processing files
 */
const DEFAULT_BATCH_SIZE = 50;

/**
 * Default concurrency limit
 */
const DEFAULT_CONCURRENCY = 10;

/**
 * File extensions to ignore during scanning
 */
const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.devac/,
  /dist\//,
  /build\//,
  /coverage\//,
  /\.d\.ts$/,
  /\.min\.js$/,
  /\.map$/,
];

/**
 * Create a CLI-mode Analysis Orchestrator
 */
export function createAnalysisOrchestrator(
  router: LanguageRouter,
  writer: SeedWriter,
  pool: DuckDBPool,
  options: OrchestratorOptions = {}
): AnalysisOrchestrator {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    repoName = "unknown",
    branch = "main",
    verbose = false,
  } = options;

  // Internal state
  let status: OrchestratorStatus = { mode: "idle" };

  /**
   * Get the seed path for a package
   */
  function getSeedPath(packagePath: string): string {
    return path.join(packagePath, ".devac", "seed");
  }

  /**
   * Create parser config from options and package path
   */
  function createParserConfig(packagePath: string): ParserConfig {
    return {
      ...DEFAULT_PARSER_CONFIG,
      repoName,
      packagePath: path.relative(process.cwd(), packagePath) || ".",
      branch,
    };
  }

  /**
   * Check if a file should be ignored
   */
  function shouldIgnore(filePath: string): boolean {
    return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Scan for supported files in a directory
   */
  async function scanSupportedFiles(packagePath: string): Promise<string[]> {
    const files: string[] = [];

    async function scan(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (shouldIgnore(fullPath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile()) {
            const parser = router.getParser(fullPath);
            if (parser) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        if (verbose) {
          console.warn(`Warning: Could not scan directory ${dir}:`, error);
        }
      }
    }

    await scan(packagePath);
    return files;
  }

  /**
   * Process files in chunks with limited concurrency
   */
  async function processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    chunkSize: number,
    maxConcurrency: number
  ): Promise<R[]> {
    const results: R[] = [];

    // Process in chunks
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);

      // Process chunk with concurrency limit
      const chunkResults = await processConcurrently(chunk, processor, maxConcurrency);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Process items concurrently with a limit
   *
   * Uses a Set to track executing promises and removes them
   * when they complete, ensuring proper concurrency limiting.
   */
  async function processConcurrently<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    limit: number
  ): Promise<R[]> {
    const results: R[] = [];
    const executing = new Set<Promise<void>>();

    for (const item of items) {
      // Create a wrapper promise that removes itself when done
      const promise = processor(item).then((result) => {
        results.push(result);
        executing.delete(promise);
      });

      executing.add(promise);

      // If we've reached the limit, wait for one to complete
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining promises to complete
    await Promise.all(executing);
    return results;
  }

  /**
   * Analyze a single file
   */
  async function analyzeFile(event: FileChangeEvent): Promise<AnalysisResult> {
    const startTime = performance.now();

    // Update status
    status = {
      mode: "analyzing",
      currentFile: event.filePath,
    };

    // Get appropriate parser
    const parser = router.getParser(event.filePath);
    if (!parser) {
      return {
        filePath: event.filePath,
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        refCount: 0,
        parseTimeMs: 0,
        writeTimeMs: 0,
        error: `No parser available for file type: ${path.extname(event.filePath)}`,
      };
    }

    try {
      // Handle file deletion
      if (event.type === "unlink") {
        const writeStart = performance.now();
        // For deletions, we need to remove seeds for this file
        // The seed writer handles this by marking nodes as deleted
        await writer.deleteFile([event.filePath]);
        const writeTimeMs = performance.now() - writeStart;

        return {
          filePath: event.filePath,
          success: true,
          nodeCount: 0,
          edgeCount: 0,
          refCount: 0,
          parseTimeMs: 0,
          writeTimeMs,
        };
      }

      // Parse file
      const parseStart = performance.now();
      const config = createParserConfig(event.packagePath);
      const parseResult = await parser.parse(event.filePath, config);
      const parseTimeMs = performance.now() - parseStart;

      // Apply effect mappings to classify raw effects
      // Load hierarchical mappings from package -> repo -> workspace
      if (parseResult.effects.length > 0) {
        const repoPath = await findGitRoot(event.packagePath);
        const mappingResult = await loadEffectMappings({
          packagePath: event.packagePath,
          repoPath: repoPath ?? undefined,
          // workspacePath could be added later for workspace-level mappings
        });

        if (mappingResult.hasMappings) {
          // Apply mappings to classify FunctionCall effects into Store/Retrieve/Send
          parseResult.effects = applyMappings(parseResult.effects, mappingResult.mappings);
        }
      }

      // Write seeds (atomic)
      const writeStart = performance.now();
      await writer.updateFile([event.filePath], parseResult);
      const writeTimeMs = performance.now() - writeStart;

      return {
        filePath: event.filePath,
        success: true,
        nodeCount: parseResult.nodes.length,
        edgeCount: parseResult.edges.length,
        refCount: parseResult.externalRefs.length,
        parseTimeMs,
        writeTimeMs,
        warnings: parseResult.warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (verbose) {
        console.error(`Error analyzing ${event.filePath}:`, error);
      }

      return {
        filePath: event.filePath,
        success: false,
        nodeCount: 0,
        edgeCount: 0,
        refCount: 0,
        parseTimeMs: performance.now() - startTime,
        writeTimeMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Analyze all files in a package
   */
  async function analyzePackage(packagePath: string): Promise<PackageResult> {
    const startTime = performance.now();
    const errors: Array<{ filePath: string; error: string }> = [];

    // Update status
    status = {
      mode: "analyzing",
      progress: { completed: 0, total: 0, percentage: 0 },
    };

    try {
      // 1. Ensure seed directory exists
      const seedPath = getSeedPath(packagePath);
      await fs.mkdir(seedPath, { recursive: true });

      // 2. Scan for supported files
      const files = await scanSupportedFiles(packagePath);

      if (files.length === 0) {
        return {
          packagePath,
          filesAnalyzed: 0,
          filesSkipped: 0,
          filesFailed: 0,
          totalNodes: 0,
          totalEdges: 0,
          totalRefs: 0,
          totalTimeMs: performance.now() - startTime,
          errors: [],
        };
      }

      // Update status with total
      status.progress = {
        completed: 0,
        total: files.length,
        percentage: 0,
      };

      // 3. Process files in batches
      let totalNodes = 0;
      let totalEdges = 0;
      let totalRefs = 0;
      let filesAnalyzed = 0;
      let filesFailed = 0;

      const results = await processInBatches(
        files,
        async (filePath) => {
          const result = await analyzeFile({
            type: "add",
            filePath,
            packagePath,
            timestamp: Date.now(),
          });

          // Update progress
          if (status.progress) {
            status.progress.completed++;
            status.progress.percentage = Math.round(
              (status.progress.completed / status.progress.total) * 100
            );
          }

          return result;
        },
        batchSize,
        concurrency
      );

      // 4. Aggregate results
      for (const result of results) {
        if (result.success) {
          filesAnalyzed++;
          totalNodes += result.nodeCount;
          totalEdges += result.edgeCount;
          totalRefs += result.refCount;
        } else {
          filesFailed++;
          if (result.error) {
            errors.push({ filePath: result.filePath, error: result.error });
          }
        }
      }

      // Reset status
      status = { mode: "idle" };

      return {
        packagePath,
        filesAnalyzed,
        filesSkipped: files.length - filesAnalyzed - filesFailed,
        filesFailed,
        totalNodes,
        totalEdges,
        totalRefs,
        totalTimeMs: performance.now() - startTime,
        errors,
      };
    } catch (error) {
      status = {
        mode: "idle",
        lastError: error instanceof Error ? error.message : String(error),
      };

      throw error;
    }
  }

  /**
   * Analyze a batch of file changes
   */
  async function analyzeBatch(events: FileChangeEvent[]): Promise<BatchResult> {
    const startTime = performance.now();

    // Update status
    status = {
      mode: "analyzing",
      progress: {
        completed: 0,
        total: events.length,
        percentage: 0,
      },
    };

    const results: AnalysisResult[] = [];

    // Group events by package for potential optimizations
    const byPackage = new Map<string, FileChangeEvent[]>();
    for (const event of events) {
      const existing = byPackage.get(event.packagePath) || [];
      existing.push(event);
      byPackage.set(event.packagePath, existing);
    }

    // Process each package's events
    for (const [_packagePath, packageEvents] of byPackage) {
      const packageResults = await processConcurrently(
        packageEvents,
        async (event) => {
          const result = await analyzeFile(event);

          // Update progress
          if (status.progress) {
            status.progress.completed++;
            status.progress.percentage = Math.round(
              (status.progress.completed / status.progress.total) * 100
            );
          }

          return result;
        },
        concurrency
      );

      results.push(...packageResults);
    }

    // Reset status
    status = { mode: "idle" };

    return {
      events,
      results,
      totalTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Resolve semantic references
   *
   * This is Pass 2 of the two-pass architecture:
   * 1. Read unresolved external_refs from seeds
   * 2. Use language-specific semantic resolvers (ts-morph, Pyright, Roslyn)
   * 3. Resolve module specifiers to file paths
   * 4. Match imported symbols to exported symbols
   * 5. Update external_refs with resolved entity IDs
   */
  async function resolveSemantics(packagePath: string): Promise<ResolutionResult> {
    const startTime = performance.now();

    // Update status
    status = { mode: "resolving" };

    try {
      // 1. Read unresolved external refs from seeds
      const seedReader = createSeedReader(pool, packagePath);
      const unresolvedResult = await seedReader.getUnresolvedRefs(branch);

      if (unresolvedResult.length === 0) {
        status = { mode: "idle" };
        return {
          packagePath,
          refsResolved: 0,
          refsFailed: 0,
          callsResolved: 0,
          callsFailed: 0,
          extendsResolved: 0,
          extendsFailed: 0,
          totalTimeMs: performance.now() - startTime,
        };
      }

      // 2. Convert to UnresolvedRef format for semantic resolver
      const unresolvedRefs: UnresolvedRef[] = unresolvedResult.map(toUnresolvedRef);

      // 3. Get semantic resolver factory and detect language
      const factory = getSemanticResolverFactory();
      const language = factory.detectPackageLanguage(packagePath);

      if (!language) {
        if (verbose) {
          console.warn(`Could not detect language for package: ${packagePath}`);
        }
        status = { mode: "idle" };
        return {
          packagePath,
          refsResolved: 0,
          refsFailed: unresolvedRefs.length,
          callsResolved: 0,
          callsFailed: 0,
          extendsResolved: 0,
          extendsFailed: 0,
          totalTimeMs: performance.now() - startTime,
        };
      }

      // 4. Get appropriate resolver
      const resolver = factory.getResolver(language);
      if (!resolver) {
        if (verbose) {
          console.warn(`No semantic resolver available for language: ${language}`);
        }
        status = { mode: "idle" };
        return {
          packagePath,
          refsResolved: 0,
          refsFailed: unresolvedRefs.length,
          callsResolved: 0,
          callsFailed: 0,
          extendsResolved: 0,
          extendsFailed: 0,
          totalTimeMs: performance.now() - startTime,
        };
      }

      // 5. Check if resolver is available
      const isAvailable = await resolver.isAvailable();
      if (!isAvailable) {
        if (verbose) {
          console.warn(`Semantic resolver for ${language} is not available`);
        }
        status = { mode: "idle" };
        return {
          packagePath,
          refsResolved: 0,
          refsFailed: unresolvedRefs.length,
          callsResolved: 0,
          callsFailed: 0,
          extendsResolved: 0,
          extendsFailed: 0,
          totalTimeMs: performance.now() - startTime,
        };
      }

      // 6. Resolve all refs
      const resolutionResult = await resolver.resolvePackage(packagePath, unresolvedRefs);

      // 7. Update seeds with resolved refs
      if (resolutionResult.resolvedRefs.length > 0) {
        const updates: ResolvedRefUpdate[] = resolutionResult.resolvedRefs.map(
          (resolved: ResolvedRef) => ({
            sourceEntityId: resolved.ref.sourceEntityId,
            moduleSpecifier: resolved.ref.moduleSpecifier,
            importedSymbol: resolved.ref.importedSymbol,
            targetEntityId: resolved.targetEntityId,
          })
        );

        const updateResult = await writer.updateResolvedRefs(updates, {
          branch,
        });

        if (!updateResult.success && verbose) {
          console.error(`Failed to update resolved refs: ${updateResult.error}`);
        }
      }

      // Log resolution errors if verbose
      if (verbose && resolutionResult.errors.length > 0) {
        for (const error of resolutionResult.errors) {
          console.warn(
            `Resolution error for ${error.ref.moduleSpecifier}:${error.ref.importedSymbol}: ${error.error}`
          );
        }
      }

      // 8. Resolve CALLS edges
      let callsResolved = 0;
      let callsFailed = 0;

      const unresolvedCalls = await seedReader.getUnresolvedCallEdges(branch);
      if (unresolvedCalls.length > 0) {
        const callResult = await resolver.resolveCallEdges(packagePath, unresolvedCalls);
        callsResolved = callResult.resolved;
        callsFailed = callResult.unresolved;

        // 9. Update seeds with resolved call edges
        if (callResult.resolvedCalls.length > 0) {
          const callUpdates: ResolvedCallEdgeUpdate[] = callResult.resolvedCalls.map(
            (resolved: ResolvedCallEdge) => ({
              sourceEntityId: resolved.call.sourceEntityId,
              oldTargetEntityId: resolved.call.targetEntityId,
              newTargetEntityId: resolved.targetEntityId,
            })
          );

          const callUpdateResult = await writer.updateResolvedCallEdges(callUpdates, {
            branch,
          });

          if (!callUpdateResult.success && verbose) {
            console.error(`Failed to update resolved call edges: ${callUpdateResult.error}`);
          }
        }

        // Log call resolution errors if verbose
        if (verbose && callResult.errors.length > 0) {
          for (const error of callResult.errors) {
            console.warn(`Call resolution error for ${error.call.calleeName}: ${error.error}`);
          }
        }
      }

      // 10. Resolve EXTENDS edges
      let extendsResolved = 0;
      let extendsFailed = 0;

      const unresolvedExtends = await seedReader.getUnresolvedExtendsEdges(branch);
      if (unresolvedExtends.length > 0) {
        const extendsResult = await resolver.resolveExtendsEdges(packagePath, unresolvedExtends);
        extendsResolved = extendsResult.resolved;
        extendsFailed = extendsResult.unresolved;

        // 11. Update seeds with resolved extends edges
        if (extendsResult.resolvedExtends.length > 0) {
          const extendsUpdates: ResolvedExtendsEdgeUpdate[] = extendsResult.resolvedExtends.map(
            (resolved: ResolvedExtendsEdge) => ({
              sourceEntityId: resolved.extends.sourceEntityId,
              oldTargetEntityId: resolved.extends.targetEntityId,
              newTargetEntityId: resolved.targetEntityId,
            })
          );

          const extendsUpdateResult = await writer.updateResolvedExtendsEdges(extendsUpdates, {
            branch,
          });

          if (!extendsUpdateResult.success && verbose) {
            console.error(`Failed to update resolved extends edges: ${extendsUpdateResult.error}`);
          }
        }

        // Log extends resolution errors if verbose
        if (verbose && extendsResult.errors.length > 0) {
          for (const error of extendsResult.errors) {
            console.warn(
              `Extends resolution error for ${error.extends.targetName}: ${error.error}`
            );
          }
        }
      }

      // Reset status
      status = { mode: "idle" };

      return {
        packagePath,
        refsResolved: resolutionResult.resolved,
        refsFailed: resolutionResult.unresolved,
        callsResolved,
        callsFailed,
        extendsResolved,
        extendsFailed,
        totalTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      status = {
        mode: "idle",
        lastError: error instanceof Error ? error.message : String(error),
      };

      throw error;
    }
  }

  /**
   * Get current status
   */
  function getStatus(): OrchestratorStatus {
    return { ...status };
  }

  return {
    analyzeFile,
    analyzePackage,
    analyzeBatch,
    resolveSemantics,
    getStatus,
  };
}
