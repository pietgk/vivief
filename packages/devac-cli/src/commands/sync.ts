/**
 * Sync Command Implementation
 *
 * Primary workflow for ensuring workspace seeds are analyzed and repos are registered.
 * Combines analyze + register in a single command with optimization by default.
 * Enhanced with scope control, validation, watch mode, and GitHub data syncing.
 */

import * as path from "node:path";
import {
  type WorkspaceStatus,
  createHubClient,
  findWorkspaceDir,
  getWorkspaceStatus,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { analyzeCommand } from "./analyze.js";
import { cleanCommand } from "./clean.js";
import { contextCICommand, contextIssuesCommand } from "./context.js";
import { docSyncCommand } from "./doc-sync.js";
import { validateCommand } from "./validate.js";
import { workspaceWatch } from "./workspace-watch.js";

/**
 * Scope level for sync command
 */
export type SyncScope = "workspace" | "repo" | "package" | "auto";

/**
 * Sync command options
 */
export interface SyncOptions {
  /** Path to workspace or repository */
  path: string;
  /** Scope level: workspace, repo, package, or auto (default: auto) */
  scope?: SyncScope;
  /** Analyze packages needing analysis (default: true) */
  analyze?: boolean;
  /** Register repositories with hub (default: true) */
  register?: boolean;
  /** Force full reanalysis even if no changes detected (default: false) */
  force?: boolean;
  /** Show what would be done without making changes (default: false) */
  dryRun?: boolean;
  /** Run validation after analysis (default: false) */
  validate?: boolean;
  /** Clean stale data before syncing (default: false) */
  clean?: boolean;
  /** Sync CI status to hub (default: false) */
  ci?: boolean;
  /** Sync GitHub issues to hub (default: false) */
  issues?: boolean;
  /** Generate documentation (default: false) */
  docs?: boolean;
  /** Enable continuous watch mode (default: false) */
  watch?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Sync command result
 */
export interface SyncResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Number of packages that were analyzed */
  packagesAnalyzed: number;
  /** Number of packages skipped (already up-to-date) */
  packagesSkipped: number;
  /** Number of repositories registered */
  reposRegistered: number;
  /** Number of packages cleaned */
  packagesCleaned: number;
  /** Whether validation passed */
  validationPassed?: boolean;
  /** Number of CI checks synced */
  ciChecksSynced: number;
  /** Number of issues synced */
  issuesSynced: number;
  /** Number of docs generated */
  docsGenerated: number;
  /** List of errors encountered */
  errors: string[];
  /** User-facing message */
  message: string;
}

/**
 * Create an error result helper
 */
function createErrorResult(errors: string[], message: string): SyncResult {
  return {
    success: false,
    packagesAnalyzed: 0,
    packagesSkipped: 0,
    reposRegistered: 0,
    packagesCleaned: 0,
    ciChecksSynced: 0,
    issuesSynced: 0,
    docsGenerated: 0,
    errors,
    message,
  };
}

/**
 * Sync workspace - analyze packages and register repos with hub
 */
export async function syncCommand(options: SyncOptions): Promise<SyncResult> {
  const {
    path: inputPath,
    // TODO: Implement scope support for targeted sync (workspace/repo/package)
    // Currently always syncs the entire workspace regardless of scope parameter
    scope: _scope = "auto",
    analyze = true,
    register = true,
    force = false,
    dryRun = false,
    validate = false,
    clean = false,
    ci = false,
    issues = false,
    docs = false,
    watch = false,
    onProgress,
  } = options;

  const errors: string[] = [];
  let packagesAnalyzed = 0;
  let packagesSkipped = 0;
  let reposRegistered = 0;
  let packagesCleaned = 0;
  let validationPassed: boolean | undefined;
  let ciChecksSynced = 0;
  let issuesSynced = 0;
  let docsGenerated = 0;

  // Step 1: Find workspace
  const workspaceDir = await findWorkspaceDir(inputPath);
  if (!workspaceDir) {
    return createErrorResult(
      [`Not in a workspace: ${inputPath}`],
      "Not in a workspace. Run from a workspace directory."
    );
  }

  // Step 2: Set up hub client
  // Note: Hub may not exist on first run - this is expected.
  // The hub will be created automatically during repo registration.
  const hubDir = path.join(workspaceDir, ".devac");
  const client = createHubClient({ hubDir });

  try {
    await client.getStatus();
  } catch {
    // Hub doesn't exist yet - will be created during registration
    onProgress?.("Hub will be created during sync (first run).");
  }

  // Step 3: Get workspace status
  let status: WorkspaceStatus;
  try {
    status = await getWorkspaceStatus({ path: workspaceDir });
  } catch (error) {
    return createErrorResult(
      [error instanceof Error ? error.message : String(error)],
      "Failed to get workspace status"
    );
  }

  // Step 4: Dry run - report what would be done
  if (dryRun) {
    const packagesNeedingAnalysis = status.summary.packagesNeedAnalysis;
    const reposNeedingRegistration = status.repos.filter(
      (r) => r.hubStatus !== "registered"
    ).length;

    onProgress?.("Dry run - would perform the following:");
    if (clean) {
      onProgress?.("  - Clean stale seeds");
    }
    if (analyze && packagesNeedingAnalysis > 0) {
      onProgress?.(`  - Analyze ${packagesNeedingAnalysis} package(s)`);
    }
    if (register && reposNeedingRegistration > 0) {
      onProgress?.(`  - Register ${reposNeedingRegistration} repository(ies)`);
    }
    if (validate) {
      onProgress?.("  - Run validation after analysis");
    }
    if (ci) {
      onProgress?.("  - Sync CI status to hub");
    }
    if (issues) {
      onProgress?.("  - Sync GitHub issues to hub");
    }
    if (docs) {
      onProgress?.("  - Generate documentation");
    }
    if (watch) {
      onProgress?.("  - Enable continuous watch mode");
    }
    if (
      packagesNeedingAnalysis === 0 &&
      reposNeedingRegistration === 0 &&
      !ci &&
      !issues &&
      !docs
    ) {
      onProgress?.("  - Nothing to do, workspace is up-to-date");
    }

    return {
      success: true,
      packagesAnalyzed: 0,
      packagesSkipped: 0,
      reposRegistered: 0,
      packagesCleaned: 0,
      ciChecksSynced: 0,
      issuesSynced: 0,
      docsGenerated: 0,
      errors: [],
      message: `Dry run: would analyze ${packagesNeedingAnalysis} package(s), register ${reposNeedingRegistration} repo(s)`,
    };
  }

  // Step 5: Clean stale data if requested
  if (clean) {
    onProgress?.("Cleaning stale data...");
    for (const repo of status.repos) {
      if (!repo.seedStatus) continue;

      for (const pkg of repo.seedStatus.packages) {
        try {
          const cleanResult = await cleanCommand({ packagePath: pkg.packagePath });
          if (cleanResult.success && cleanResult.filesRemoved > 0) {
            packagesCleaned++;
            onProgress?.(`  ✓ Cleaned ${pkg.packageName}: ${cleanResult.filesRemoved} files`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Clean ${pkg.packageName}: ${errorMsg}`);
          onProgress?.(`  ✗ ${pkg.packageName}: ${errorMsg}`);
        }
      }
    }
  }

  // Step 6: Analyze packages if enabled
  if (analyze) {
    for (const repo of status.repos) {
      if (!repo.seedStatus) continue;

      // Find packages needing analysis
      const packagesNeedingWork = repo.seedStatus.packages.filter((pkg) => !pkg.hasBase);

      if (packagesNeedingWork.length === 0 && !force && !clean) {
        continue;
      }

      // Analyze each package
      const packagesToAnalyze = force || clean ? repo.seedStatus.packages : packagesNeedingWork;

      for (const pkg of packagesToAnalyze) {
        onProgress?.(`Analyzing ${pkg.packageName}...`);

        try {
          const result = await analyzeCommand({
            packagePath: pkg.packagePath,
            repoName: repo.name,
            branch: "base",
            ifChanged: !force && !clean,
            force: force || clean,
          });

          if (result.success) {
            if (result.skipped) {
              packagesSkipped++;
              onProgress?.(`  ⊘ ${pkg.packageName}: skipped (no changes)`);
            } else {
              packagesAnalyzed++;
              onProgress?.(
                `  ✓ ${pkg.packageName}: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`
              );
            }
          } else {
            errors.push(`${pkg.packageName}: ${result.error || "Analysis failed"}`);
            onProgress?.(`  ✗ ${pkg.packageName}: ${result.error || "Analysis failed"}`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${pkg.packageName}: ${errorMsg}`);
          onProgress?.(`  ✗ ${pkg.packageName}: ${errorMsg}`);
        }
      }
    }
  }

  // Step 7: Register repos if enabled
  if (register) {
    for (const repo of status.repos) {
      // Skip if already registered and we didn't analyze anything new
      if (repo.hubStatus === "registered" && packagesAnalyzed === 0 && !force && !clean) {
        continue;
      }

      onProgress?.(`Registering ${repo.name}...`);

      try {
        const result = await client.registerRepo(repo.path);
        if (result.skipped) {
          onProgress?.(`  ⊘ ${repo.name}: skipped (${result.skipReason})`);
          continue;
        }
        reposRegistered++;
        onProgress?.(
          `  ✓ ${result.repoId}: ${result.packages} package(s), ${result.crossRepoEdges} cross-repo edges`
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`${repo.name}: ${errorMsg}`);
        onProgress?.(`  ✗ ${repo.name}: ${errorMsg}`);
      }
    }
  }

  // Step 8: Run validation if requested
  if (validate && packagesAnalyzed > 0) {
    onProgress?.("Running validation...");
    let allPassed = true;

    for (const repo of status.repos) {
      if (!repo.seedStatus) continue;

      for (const pkg of repo.seedStatus.packages) {
        try {
          const validateResult = await validateCommand({
            packagePath: pkg.packagePath,
            changedFiles: [],
            mode: "quick",
          });

          if (!validateResult.success || validateResult.totalIssues > 0) {
            allPassed = false;
            onProgress?.(`  ⚠ ${pkg.packageName}: ${validateResult.totalIssues} issue(s)`);
          } else {
            onProgress?.(`  ✓ ${pkg.packageName}: validation passed`);
          }
        } catch (err) {
          allPassed = false;
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Validate ${pkg.packageName}: ${errorMsg}`);
          onProgress?.(`  ✗ ${pkg.packageName}: ${errorMsg}`);
        }
      }
    }
    validationPassed = allPassed;
  }

  // Step 9: Sync CI status if requested
  if (ci) {
    onProgress?.("Syncing CI status...");
    try {
      const ciResult = await contextCICommand({
        cwd: workspaceDir,
        syncToHub: true,
        failingOnly: false,
      });

      if (ciResult.success && ciResult.syncResult) {
        ciChecksSynced = ciResult.syncResult.pushed;
        onProgress?.(`  ✓ Synced ${ciChecksSynced} CI check(s) to hub`);
      } else if (!ciResult.success) {
        errors.push(`CI sync: ${ciResult.error || "Failed"}`);
        onProgress?.(`  ✗ CI sync failed: ${ciResult.error || "Unknown error"}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`CI sync: ${errorMsg}`);
      onProgress?.(`  ✗ CI sync: ${errorMsg}`);
    }
  }

  // Step 10: Sync GitHub issues if requested
  if (issues) {
    onProgress?.("Syncing GitHub issues...");
    try {
      const issuesResult = await contextIssuesCommand({
        cwd: workspaceDir,
        syncToHub: true,
        openOnly: true,
      });

      if (issuesResult.success && issuesResult.syncResult) {
        issuesSynced = issuesResult.syncResult.pushed;
        onProgress?.(`  ✓ Synced ${issuesSynced} issue(s) to hub`);
      } else if (!issuesResult.success) {
        errors.push(`Issues sync: ${issuesResult.error || "Failed"}`);
        onProgress?.(`  ✗ Issues sync failed: ${issuesResult.error || "Unknown error"}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Issues sync: ${errorMsg}`);
      onProgress?.(`  ✗ Issues sync: ${errorMsg}`);
    }
  }

  // Step 11: Generate documentation if requested
  if (docs) {
    onProgress?.("Generating documentation...");
    try {
      const docResult = await docSyncCommand({
        workspace: true,
        all: true,
        force: force,
      });

      if (docResult.success) {
        docsGenerated = docResult.packagesProcessed;
        onProgress?.(`  ✓ Generated docs for ${docsGenerated} package(s)`);
      } else {
        // Collect errors from individual package results
        const docErrors = docResult.packages.flatMap((pkg) => pkg.errors);
        const errorMsg = docErrors.length > 0 ? docErrors.join("; ") : "Generation failed";
        errors.push(`Docs: ${errorMsg}`);
        onProgress?.(`  ✗ Doc generation failed: ${errorMsg}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Docs: ${errorMsg}`);
      onProgress?.(`  ✗ Docs: ${errorMsg}`);
    }
  }

  // Step 12: Start watch mode if requested
  if (watch) {
    onProgress?.("Starting watch mode...");
    try {
      const watchResult = await workspaceWatch({
        workspacePath: workspaceDir,
        autoRefresh: true,
      });

      if (watchResult.success && watchResult.controller) {
        onProgress?.("  ✓ Watch mode started. Press Ctrl+C to stop.");
        // In watch mode, we don't return - the watch continues
        // The caller should handle the watch controller
      } else {
        errors.push(`Watch: ${watchResult.error || "Failed to start"}`);
        onProgress?.(`  ✗ Watch mode failed: ${watchResult.error || "Unknown error"}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Watch: ${errorMsg}`);
      onProgress?.(`  ✗ Watch: ${errorMsg}`);
    }
  }

  // Build summary message
  const parts: string[] = [];
  if (packagesCleaned > 0) {
    parts.push(`${packagesCleaned} cleaned`);
  }
  if (packagesAnalyzed > 0) {
    parts.push(`${packagesAnalyzed} package(s) analyzed`);
  }
  if (packagesSkipped > 0) {
    parts.push(`${packagesSkipped} skipped`);
  }
  if (reposRegistered > 0) {
    parts.push(`${reposRegistered} repo(s) registered`);
  }
  if (validationPassed !== undefined) {
    parts.push(validationPassed ? "validation passed" : "validation failed");
  }
  if (ciChecksSynced > 0) {
    parts.push(`${ciChecksSynced} CI check(s) synced`);
  }
  if (issuesSynced > 0) {
    parts.push(`${issuesSynced} issue(s) synced`);
  }
  if (docsGenerated > 0) {
    parts.push(`${docsGenerated} doc(s) generated`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s)`);
  }

  const message =
    parts.length > 0 ? `Sync complete: ${parts.join(", ")}` : "Sync complete: nothing to do";

  return {
    success: errors.length === 0,
    packagesAnalyzed,
    packagesSkipped,
    reposRegistered,
    packagesCleaned,
    validationPassed,
    ciChecksSynced,
    issuesSynced,
    docsGenerated,
    errors,
    message,
  };
}

/**
 * Register the sync command with the CLI
 */
export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Analyze packages and register repos with hub")
    .option("-p, --path <path>", "Workspace path", process.cwd())
    .option("--scope <level>", "Scope level: workspace, repo, package, auto", "auto")
    .option("--analyze-only", "Only analyze, don't register")
    .option("--register-only", "Only register, don't analyze")
    .option("--force", "Force full reanalysis (ignore --if-changed optimization)")
    .option("--dry-run", "Show what would be done without making changes")
    .option("--validate", "Run validation after analysis")
    .option("--clean", "Clean stale data before syncing")
    .option("--ci", "Sync CI status to hub")
    .option("--issues", "Sync GitHub issues to hub")
    .option("--docs", "Generate documentation")
    .option("--watch", "Enable continuous watch mode")
    .action(async (opts) => {
      const result = await syncCommand({
        path: opts.path,
        scope: opts.scope as SyncScope,
        analyze: !opts.registerOnly,
        register: !opts.analyzeOnly,
        force: opts.force ?? false,
        dryRun: opts.dryRun ?? false,
        validate: opts.validate ?? false,
        clean: opts.clean ?? false,
        ci: opts.ci ?? false,
        issues: opts.issues ?? false,
        docs: opts.docs ?? false,
        watch: opts.watch ?? false,
        onProgress: (msg) => console.log(msg),
      });

      if (!result.success) {
        console.error(`\n${result.message}`);
        if (result.errors.length > 0) {
          console.error("\nErrors:");
          for (const err of result.errors) {
            console.error(`  - ${err}`);
          }
        }
        process.exit(1);
      }

      console.log(`\n${result.message}`);
    });
}
