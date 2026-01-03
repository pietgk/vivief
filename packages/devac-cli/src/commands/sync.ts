/**
 * Sync Command Implementation
 *
 * Primary workflow for ensuring workspace seeds are analyzed and repos are registered.
 * Combines analyze + register in a single command with optimization by default.
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

/**
 * Sync command options
 */
export interface SyncOptions {
  /** Path to workspace or repository */
  path: string;
  /** Analyze packages needing analysis (default: true) */
  analyze?: boolean;
  /** Register repositories with hub (default: true) */
  register?: boolean;
  /** Force full reanalysis even if no changes detected (default: false) */
  force?: boolean;
  /** Show what would be done without making changes (default: false) */
  dryRun?: boolean;
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
  /** List of errors encountered */
  errors: string[];
  /** User-facing message */
  message: string;
}

/**
 * Sync workspace - analyze packages and register repos with hub
 */
export async function syncCommand(options: SyncOptions): Promise<SyncResult> {
  const {
    path: inputPath,
    analyze = true,
    register = true,
    force = false,
    dryRun = false,
    onProgress,
  } = options;

  const errors: string[] = [];
  let packagesAnalyzed = 0;
  let packagesSkipped = 0;
  let reposRegistered = 0;

  // Step 1: Find workspace
  const workspaceDir = await findWorkspaceDir(inputPath);
  if (!workspaceDir) {
    return {
      success: false,
      packagesAnalyzed: 0,
      packagesSkipped: 0,
      reposRegistered: 0,
      errors: [`Not in a workspace: ${inputPath}`],
      message: "Not in a workspace. Run from a workspace directory.",
    };
  }

  // Step 2: Check hub is initialized
  const hubDir = path.join(workspaceDir, ".devac");
  const client = createHubClient({ hubDir });

  try {
    // This will throw if hub is not initialized
    await client.getStatus();
  } catch {
    return {
      success: false,
      packagesAnalyzed: 0,
      packagesSkipped: 0,
      reposRegistered: 0,
      errors: ["Hub not initialized"],
      message: "Hub not initialized. Run 'devac hub init' first.",
    };
  }

  // Step 3: Get workspace status
  let status: WorkspaceStatus;
  try {
    status = await getWorkspaceStatus({ path: workspaceDir });
  } catch (error) {
    return {
      success: false,
      packagesAnalyzed: 0,
      packagesSkipped: 0,
      reposRegistered: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      message: "Failed to get workspace status",
    };
  }

  // Step 4: Dry run - report what would be done
  if (dryRun) {
    const packagesNeedingAnalysis = status.summary.packagesNeedAnalysis;
    const reposNeedingRegistration = status.repos.filter(
      (r) => r.hubStatus !== "registered"
    ).length;

    onProgress?.("Dry run - would perform the following:");
    if (analyze && packagesNeedingAnalysis > 0) {
      onProgress?.(`  - Analyze ${packagesNeedingAnalysis} package(s)`);
    }
    if (register && reposNeedingRegistration > 0) {
      onProgress?.(`  - Register ${reposNeedingRegistration} repository(ies)`);
    }
    if (packagesNeedingAnalysis === 0 && reposNeedingRegistration === 0) {
      onProgress?.("  - Nothing to do, workspace is up-to-date");
    }

    return {
      success: true,
      packagesAnalyzed: 0,
      packagesSkipped: 0,
      reposRegistered: 0,
      errors: [],
      message: `Dry run: would analyze ${packagesNeedingAnalysis} package(s), register ${reposNeedingRegistration} repo(s)`,
    };
  }

  // Step 5: Analyze packages if enabled
  if (analyze) {
    for (const repo of status.repos) {
      if (!repo.seedStatus) continue;

      // Find packages needing analysis
      const packagesNeedingWork = repo.seedStatus.packages.filter((pkg) => !pkg.hasBase);

      if (packagesNeedingWork.length === 0 && !force) {
        continue;
      }

      // Analyze each package
      const packagesToAnalyze = force ? repo.seedStatus.packages : packagesNeedingWork;

      for (const pkg of packagesToAnalyze) {
        onProgress?.(`Analyzing ${pkg.packageName}...`);

        try {
          const result = await analyzeCommand({
            packagePath: pkg.packagePath,
            repoName: repo.name,
            branch: "base",
            ifChanged: !force,
            force: force,
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

  // Step 6: Register repos if enabled
  if (register) {
    for (const repo of status.repos) {
      // Skip if already registered and we didn't analyze anything new
      if (repo.hubStatus === "registered" && packagesAnalyzed === 0 && !force) {
        continue;
      }

      onProgress?.(`Registering ${repo.name}...`);

      try {
        const result = await client.registerRepo(repo.path);
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

  // Build summary message
  const parts: string[] = [];
  if (packagesAnalyzed > 0) {
    parts.push(`${packagesAnalyzed} package(s) analyzed`);
  }
  if (packagesSkipped > 0) {
    parts.push(`${packagesSkipped} skipped`);
  }
  if (reposRegistered > 0) {
    parts.push(`${reposRegistered} repo(s) registered`);
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
    .option("--analyze-only", "Only analyze, don't register")
    .option("--register-only", "Only register, don't analyze")
    .option("--force", "Force full reanalysis (ignore --if-changed optimization)")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (opts) => {
      const result = await syncCommand({
        path: opts.path,
        analyze: !opts.registerOnly,
        register: !opts.analyzeOnly,
        force: opts.force ?? false,
        dryRun: opts.dryRun ?? false,
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
