/**
 * Prerequisites Checker
 *
 * Composition layer that combines existing functions from the codebase
 * with new environment checks to provide unified prerequisite checking.
 *
 * IMPORTANT: This module REUSES existing functions from:
 * - workspace/discover.ts (findWorkspaceDir, validateHubLocation, isWorkspaceDirectory)
 * - workspace/seed-state.ts (hasBaseSeed, detectPackageSeedState)
 * - workspace/package-manager.ts (discoverAllPackages)
 *
 * It does NOT reimplement these checks.
 */

import * as path from "node:path";
import { findGitRoot, findWorkspaceDir, validateHubLocation } from "../workspace/discover.js";
import { discoverAllPackages } from "../workspace/package-manager.js";
import { hasBaseSeed } from "../workspace/seed-state.js";
import {
  checkHasSourceFiles,
  checkHubExists,
  checkHubNotLocked,
  checkNodeVersion,
} from "./environment.js";
import type {
  CommandReadiness,
  FormatErrorOptions,
  PrerequisiteCheck,
  ReadinessOutput,
  SystemState,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Sync Prerequisites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check prerequisites for the sync command.
 *
 * Required checks:
 * - Source files exist (can analyze)
 * - Node.js version is compatible
 *
 * Optional checks (warnings):
 * - Hub is writable (if locked, sync continues locally)
 * - Package config exists (package.json, etc.)
 *
 * @param inputPath Path to check (defaults to cwd)
 * @returns CommandReadiness result
 */
export async function checkSyncPrerequisites(inputPath?: string): Promise<CommandReadiness> {
  const targetPath = path.resolve(inputPath || process.cwd());
  const checks: PrerequisiteCheck[] = [];

  // Check 1: Node.js version (required)
  checks.push(checkNodeVersion());

  // Check 2: Find workspace or git root
  const workspaceDir = await findWorkspaceDir(targetPath);
  const gitRoot = await findGitRoot(targetPath);
  const workPath = workspaceDir || gitRoot || targetPath;

  if (workspaceDir) {
    checks.push({
      id: "workspace_found",
      category: "workspace",
      passed: true,
      required: true,
      message: "Workspace found",
      detail: `Working in workspace: ${workspaceDir}`,
    });
  } else if (gitRoot) {
    checks.push({
      id: "workspace_found",
      category: "workspace",
      passed: true,
      required: true,
      message: "Git repository found",
      detail: `Working in repository: ${gitRoot}`,
    });
  } else {
    checks.push({
      id: "workspace_found",
      category: "workspace",
      passed: false,
      required: true,
      message: "Not in a workspace or git repository",
      detail: `Path ${targetPath} is not inside a workspace or git repository.`,
      fixCommand: "cd <your-workspace-or-repo>",
      fixDescription: "Navigate to a workspace directory or git repository",
    });
  }

  // Check 3: Source files exist (required)
  checks.push(await checkHasSourceFiles(workPath));

  // Check 4: Package discovery (optional - provides better context)
  try {
    const discovery = await discoverAllPackages(workPath);
    if (discovery.packages.length > 0) {
      checks.push({
        id: "packages_discovered",
        category: "workspace",
        passed: true,
        required: false,
        message: `Found ${discovery.packages.length} package(s)`,
        detail: discovery.packages.map((p) => p.name).join(", "),
      });
    } else {
      checks.push({
        id: "packages_discovered",
        category: "workspace",
        passed: false,
        required: false, // Still can sync without package config
        message: "No package configuration found",
        detail:
          "No package.json, pyproject.toml, or .csproj found. " +
          "DevAC will analyze the directory as a single package.",
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    checks.push({
      id: "packages_discovered",
      category: "workspace",
      passed: false,
      required: false,
      message: "Package discovery failed",
      detail: msg,
    });
  }

  // Check 5: Hub location and writability (optional)
  if (workspaceDir) {
    const hubDir = path.join(workspaceDir, ".devac");
    const validation = await validateHubLocation(hubDir);

    if (validation.valid) {
      checks.push(await checkHubNotLocked(hubDir));
      checks.push(await checkHubExists(hubDir));
    } else {
      checks.push({
        id: "hub_location",
        category: "hub",
        passed: false,
        required: false,
        message: "Hub location invalid",
        detail: validation.reason || "Hub directory validation failed",
        fixCommand: validation.suggestedPath
          ? `Create hub at ${validation.suggestedPath}`
          : undefined,
        fixDescription: "Hub will be created at the correct workspace level",
      });
    }
  }

  return buildReadiness("sync", checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Prerequisites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check prerequisites for query operations.
 *
 * Required checks:
 * - Seeds exist (analysis data available)
 *
 * Optional checks (warnings):
 * - Hub is queryable (cross-repo queries)
 *
 * @param inputPath Path to check (defaults to cwd)
 * @returns CommandReadiness result
 */
export async function checkQueryPrerequisites(inputPath?: string): Promise<CommandReadiness> {
  const targetPath = path.resolve(inputPath || process.cwd());
  const checks: PrerequisiteCheck[] = [];

  // Find the appropriate directory to check
  const workspaceDir = await findWorkspaceDir(targetPath);
  const gitRoot = await findGitRoot(targetPath);
  const workPath = workspaceDir || gitRoot || targetPath;

  // Check 1: Seeds exist (required for queries)
  let seedsFound = false;
  let seedsDetail = "";

  try {
    // Try to find seeds in the repo or workspace
    const discovery = await discoverAllPackages(workPath);

    if (discovery.packages.length > 0) {
      // Check if any package has seeds
      const packagesWithSeeds: string[] = [];
      for (const pkg of discovery.packages) {
        if (await hasBaseSeed(pkg.path)) {
          packagesWithSeeds.push(pkg.name);
        }
      }

      seedsFound = packagesWithSeeds.length > 0;
      seedsDetail = seedsFound
        ? `${packagesWithSeeds.length}/${discovery.packages.length} packages have seeds`
        : `0/${discovery.packages.length} packages have seeds`;
    } else {
      // Single package case - check the path directly
      seedsFound = await hasBaseSeed(workPath);
      seedsDetail = seedsFound ? "Seeds found at root" : "No seeds found";
    }
  } catch {
    seedsFound = false;
    seedsDetail = "Could not check for seeds";
  }

  if (seedsFound) {
    checks.push({
      id: "seeds_exist",
      category: "seeds",
      passed: true,
      required: true,
      message: "Analysis data available",
      detail: seedsDetail,
    });
  } else {
    checks.push({
      id: "seeds_exist",
      category: "seeds",
      passed: false,
      required: true,
      message: "No analysis data found",
      detail:
        "No seed files (.devac/seed/) found. " + "Run 'devac sync' to analyze the codebase first.",
      fixCommand: "devac sync",
      fixDescription: "Analyze the codebase to create query data",
    });
  }

  // Check 2: Hub queryable (optional - enables cross-repo queries)
  if (workspaceDir) {
    const hubDir = path.join(workspaceDir, ".devac");
    const hubExists = await checkHubExists(hubDir);
    checks.push({
      ...hubExists,
      id: "hub_queryable",
      required: false,
      message: hubExists.passed
        ? "Hub available for cross-repo queries"
        : "Hub not available (cross-repo queries disabled)",
    });
  }

  return buildReadiness("query", checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Prerequisites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check prerequisites for status command.
 * Status has minimal requirements - it should always try to show something.
 *
 * @param inputPath Path to check (defaults to cwd)
 * @returns CommandReadiness result
 */
export async function checkStatusPrerequisites(inputPath?: string): Promise<CommandReadiness> {
  const targetPath = path.resolve(inputPath || process.cwd());
  const checks: PrerequisiteCheck[] = [];

  // Status should work almost anywhere, but check for workspace
  const workspaceDir = await findWorkspaceDir(targetPath);
  const gitRoot = await findGitRoot(targetPath);

  if (workspaceDir || gitRoot) {
    checks.push({
      id: "context_found",
      category: "workspace",
      passed: true,
      required: true,
      message: "Context found",
      detail: workspaceDir ? `Workspace: ${workspaceDir}` : `Repository: ${gitRoot}`,
    });

    // Check hub lock status (same as checkSyncPrerequisites)
    const hubDir = path.join(workspaceDir || gitRoot || targetPath, ".devac");
    const validation = await validateHubLocation(hubDir);
    if (validation.valid) {
      checks.push(await checkHubNotLocked(hubDir));
    }
  } else {
    checks.push({
      id: "context_found",
      category: "workspace",
      passed: true, // Status can still run, just shows limited info
      required: true,
      message: "No workspace or repository context",
      detail: "Running without workspace context. Some status sections may be unavailable.",
    });
  }

  return buildReadiness("status", checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness Output for Status Display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get readiness information for status display.
 * Shows whether sync/query operations can proceed.
 *
 * @param inputPath Path to check (defaults to cwd)
 * @returns ReadinessOutput for status display
 */
export async function getReadinessForStatus(inputPath?: string): Promise<ReadinessOutput> {
  const [syncReadiness, queryReadiness] = await Promise.all([
    checkSyncPrerequisites(inputPath),
    checkQueryPrerequisites(inputPath),
  ]);

  // Build summary line
  const syncStatus = syncReadiness.ready ? "✓ ready" : `✗ ${syncReadiness.state}`;
  const queryStatus = queryReadiness.ready ? "✓ ready" : `✗ ${queryReadiness.state}`;
  const summary = `sync: ${syncStatus}  query: ${queryStatus}`;

  // Build brief output
  const brief: string[] = [];
  brief.push(`  sync:  ${syncStatus}`);
  if (!syncReadiness.ready && syncReadiness.blockers.length > 0) {
    const blocker = syncReadiness.blockers[0];
    if (blocker) {
      brief.push(`         └─ ${blocker.message}`);
    }
  }
  brief.push(`  query: ${queryStatus}`);
  if (!queryReadiness.ready && queryReadiness.blockers.length > 0) {
    const blocker = queryReadiness.blockers[0];
    if (blocker) {
      brief.push(`         └─ ${blocker.message}`);
    }
  }

  // Build full output
  const full: string[] = [...brief];
  if (syncReadiness.warnings.length > 0 || queryReadiness.warnings.length > 0) {
    full.push("");
    full.push("  Warnings:");
    for (const warning of [...syncReadiness.warnings, ...queryReadiness.warnings]) {
      full.push(`    ⚠ ${warning.message}`);
      if (warning.detail) {
        full.push(`      ${warning.detail}`);
      }
    }
  }

  return {
    summary,
    brief,
    full,
    sync: syncReadiness,
    query: queryReadiness,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a readiness result as an error message.
 * Used by CLI commands to show clear, actionable errors.
 *
 * @param command The command that failed
 * @param readiness The readiness result
 * @param options Formatting options
 * @returns Formatted error message
 */
export function formatPrerequisiteError(
  command: string,
  readiness: CommandReadiness,
  options: FormatErrorOptions = {}
): string {
  const { includeFix = true, verbose = false } = options;
  const lines: string[] = [];

  // Header
  lines.push(`Cannot ${command}: ${readiness.summary}`);
  lines.push("");

  // Show blockers
  for (const blocker of readiness.blockers) {
    lines.push(`  ✗ ${blocker.message}`);
    if (blocker.detail) {
      lines.push(`    ${blocker.detail}`);
    }
    if (includeFix && blocker.fixCommand) {
      lines.push("");
      lines.push(`  Fix: ${blocker.fixCommand}`);
      if (blocker.fixDescription) {
        lines.push(`       ${blocker.fixDescription}`);
      }
    }
    lines.push("");
  }

  // Show warnings if verbose
  if (verbose && readiness.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of readiness.warnings) {
      lines.push(`  ⚠ ${warning.message}`);
      if (warning.detail) {
        lines.push(`    ${warning.detail}`);
      }
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a CommandReadiness result from a list of checks.
 */
function buildReadiness(
  command: "sync" | "query" | "status",
  checks: PrerequisiteCheck[]
): CommandReadiness {
  const blockers = checks.filter((c) => !c.passed && c.required);
  const warnings = checks.filter((c) => !c.passed && !c.required);
  const ready = blockers.length === 0;

  // Determine system state
  let state: SystemState = "ready";
  if (!ready) {
    // Check for specific conditions
    const noSeeds = blockers.some((b) => b.id === "seeds_exist");
    const noWorkspace = blockers.some((b) => b.id === "workspace_found");
    const hubLocked = warnings.some((w) => w.id === "hub_writable");

    if (noSeeds && !noWorkspace) {
      state = "first-run"; // Has workspace but no seeds
    } else if (noWorkspace) {
      state = "broken"; // Can't find workspace
    } else if (hubLocked) {
      state = "locked";
    } else {
      state = "partial";
    }
  } else if (warnings.length > 0) {
    const hubLocked = warnings.some((w) => w.id === "hub_writable");
    if (hubLocked) {
      state = "partial"; // Ready but with limitations
    }
  }

  // Build summary
  let summary: string;
  if (ready) {
    if (warnings.length > 0) {
      summary = `ready (${warnings.length} warning${warnings.length > 1 ? "s" : ""})`;
    } else {
      summary = "ready";
    }
  } else {
    const firstBlocker = blockers[0];
    summary = firstBlocker?.message || "prerequisites not met";
  }

  // Build human-readable message
  const humanLines: string[] = [];
  if (ready) {
    humanLines.push(`${command} is ready to run.`);
    for (const warning of warnings) {
      humanLines.push(`  ⚠ ${warning.message}`);
    }
  } else {
    humanLines.push(`${command} cannot proceed:`);
    for (const blocker of blockers) {
      humanLines.push(`  ✗ ${blocker.message}`);
      if (blocker.fixCommand) {
        humanLines.push(`    → ${blocker.fixCommand}`);
      }
    }
  }

  return {
    command,
    ready,
    state,
    blockers,
    warnings,
    allChecks: checks,
    summary,
    humanMessage: humanLines.join("\n"),
  };
}
