/**
 * Cross-Repo Detector Module
 *
 * Detects unresolved imports that point to sibling repositories,
 * enabling watch mode to suggest creating worktrees for cross-repo changes.
 *
 * Based on Issue #19 Phase 2: Cross-Repo Intelligence
 */

import type { ParsedExternalRef } from "../types/external-refs.js";
import type { CrossRepoDetectorOptions, CrossRepoNeedEvent, RepoContext } from "./types.js";

/**
 * Result of analyzing external refs for cross-repo needs
 */
export interface CrossRepoAnalysisResult {
  /** Cross-repo needs detected */
  needs: CrossRepoNeedEvent[];
  /** Total unresolved refs analyzed */
  unresolvedRefsCount: number;
  /** Refs that match sibling repos */
  matchedRefsCount: number;
}

/**
 * Cross-repo detector that analyzes external refs for cross-repo needs
 */
export class CrossRepoDetector {
  private context: RepoContext;
  private currentRepoName: string;
  private issueNumber?: number;
  private siblingRepoNames: Set<string>;

  constructor(options: CrossRepoDetectorOptions) {
    this.context = options.context;
    this.currentRepoName = options.currentRepoName;
    this.issueNumber = options.issueNumber;

    // Build set of sibling repo names for fast lookup
    this.siblingRepoNames = new Set(
      options.context.repos.filter((r) => !r.isWorktree).map((r) => r.name)
    );
  }

  /**
   * Analyze external refs and detect cross-repo needs
   *
   * @param refs - External refs from the current file parse
   * @param sourceFilePath - Path to the source file
   * @returns Analysis result with any cross-repo needs
   */
  analyzeExternalRefs(refs: ParsedExternalRef[], sourceFilePath: string): CrossRepoAnalysisResult {
    const unresolvedRefs = refs.filter((ref) => !ref.is_resolved);
    const needs: CrossRepoNeedEvent[] = [];
    const matchedModules = new Map<string, ParsedExternalRef[]>();

    // Group unresolved refs by module specifier
    for (const ref of unresolvedRefs) {
      const targetRepo = this.matchModuleToSiblingRepo(ref.module_specifier);
      if (targetRepo) {
        const existing = matchedModules.get(targetRepo) ?? [];
        existing.push(ref);
        matchedModules.set(targetRepo, existing);
      }
    }

    // Create events for each matched sibling repo
    for (const [targetRepo, matchedRefs] of matchedModules) {
      const firstRef = matchedRefs[0];
      if (!firstRef) continue;

      const symbols = matchedRefs.map((r) => r.imported_symbol);
      const uniqueSymbols = [...new Set(symbols)];
      const moduleSpecifier = firstRef.module_specifier;

      const event = this.createCrossRepoNeedEvent(
        targetRepo,
        uniqueSymbols,
        moduleSpecifier,
        sourceFilePath
      );
      needs.push(event);
    }

    return {
      needs,
      unresolvedRefsCount: unresolvedRefs.length,
      matchedRefsCount: matchedModules.size,
    };
  }

  /**
   * Match a module specifier to a sibling repository
   *
   * Supports patterns like:
   * - "@org/repo-name" -> "repo-name"
   * - "@repo-name/subpath" -> "repo-name"
   * - "repo-name" -> "repo-name"
   */
  matchModuleToSiblingRepo(moduleSpecifier: string): string | null {
    // Skip node built-ins and relative imports
    if (
      moduleSpecifier.startsWith(".") ||
      moduleSpecifier.startsWith("/") ||
      this.isNodeBuiltin(moduleSpecifier)
    ) {
      return null;
    }

    // Extract package name from scoped or unscoped module specifier
    const packageName = this.extractPackageName(moduleSpecifier);
    if (!packageName) {
      return null;
    }

    // Check if any sibling repo matches
    for (const repoName of this.siblingRepoNames) {
      // Skip current repo
      if (repoName === this.currentRepoName) {
        continue;
      }

      // Direct match
      if (packageName === repoName) {
        return repoName;
      }

      // Match with common prefixes (e.g., "@myorg/shared" matches "shared")
      if (packageName.endsWith(`/${repoName}`)) {
        return repoName;
      }

      // Match package name suffix (e.g., "shared-utils" matches "shared")
      if (packageName.startsWith(`${repoName}-`) || packageName.endsWith(`-${repoName}`)) {
        return repoName;
      }
    }

    return null;
  }

  /**
   * Create a CrossRepoNeedEvent for a detected need
   */
  private createCrossRepoNeedEvent(
    targetRepo: string,
    symbols: string[],
    moduleSpecifier: string,
    sourceFilePath: string
  ): CrossRepoNeedEvent {
    const symbolList = symbols.slice(0, 3).join(", ");
    const symbolSuffix = symbols.length > 3 ? ` and ${symbols.length - 3} more` : "";

    // Check if target repo already has a worktree for this issue
    const hasWorktree = this.issueNumber
      ? this.context.worktrees?.some(
          (wt) => wt.mainRepoName === targetRepo && wt.issueNumber === this.issueNumber
        )
      : false;

    let suggestion: string;
    if (this.issueNumber && !hasWorktree) {
      suggestion = `devac worktree start ${this.issueNumber} --also ${targetRepo}`;
    } else if (this.issueNumber && hasWorktree) {
      const worktree = this.context.worktrees?.find((wt) => wt.mainRepoName === targetRepo);
      suggestion = `Check ${worktree?.name ?? targetRepo} - worktree exists but symbol not found`;
    } else {
      suggestion = `Create the missing symbols in ${targetRepo}`;
    }

    return {
      sourceRepo: this.currentRepoName,
      targetRepo,
      reason: `Unresolved import from "${moduleSpecifier}": ${symbolList}${symbolSuffix}`,
      symbols,
      moduleSpecifier,
      suggestion,
      issueNumber: this.issueNumber,
      sourceFilePath,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract package name from a module specifier
   *
   * Examples:
   * - "@org/package" -> "@org/package"
   * - "@org/package/subpath" -> "@org/package"
   * - "package" -> "package"
   * - "package/subpath" -> "package"
   */
  private extractPackageName(moduleSpecifier: string): string | null {
    if (moduleSpecifier.startsWith("@")) {
      // Scoped package: @org/package or @org/package/subpath
      const parts = moduleSpecifier.split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return null;
    }

    // Unscoped package: package or package/subpath
    const parts = moduleSpecifier.split("/");
    return parts[0] || null;
  }

  /**
   * Check if a module specifier is a Node.js built-in
   */
  private isNodeBuiltin(moduleSpecifier: string): boolean {
    const builtins = new Set([
      "assert",
      "buffer",
      "child_process",
      "cluster",
      "console",
      "constants",
      "crypto",
      "dgram",
      "dns",
      "domain",
      "events",
      "fs",
      "http",
      "http2",
      "https",
      "inspector",
      "module",
      "net",
      "os",
      "path",
      "perf_hooks",
      "process",
      "punycode",
      "querystring",
      "readline",
      "repl",
      "stream",
      "string_decoder",
      "timers",
      "tls",
      "trace_events",
      "tty",
      "url",
      "util",
      "v8",
      "vm",
      "wasi",
      "worker_threads",
      "zlib",
    ]);

    // Handle node: prefix
    const name = moduleSpecifier.startsWith("node:") ? moduleSpecifier.slice(5) : moduleSpecifier;

    const baseName = name.split("/")[0] ?? "";
    return builtins.has(baseName);
  }
}

/**
 * Create a cross-repo detector from a repo context
 */
export function createCrossRepoDetector(
  context: RepoContext,
  currentRepoName: string,
  issueNumber?: number
): CrossRepoDetector {
  return new CrossRepoDetector({
    context,
    currentRepoName,
    issueNumber,
  });
}

/**
 * Format a CrossRepoNeedEvent as a console notification
 */
export function formatCrossRepoNeed(event: CrossRepoNeedEvent): string {
  const lines = [
    `💡 ${event.reason}`,
    `   No worktree exists for issue #${event.issueNumber} in ${event.targetRepo}`,
    `   → Run: ${event.suggestion}`,
  ];
  return lines.join("\n");
}
