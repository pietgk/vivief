/**
 * DevAC Status Command
 *
 * Shows unified status across all DevAC pillars:
 * - Context: Where am I? What issue?
 * - DevAC Health: Is DevAC running? (watch, hub, mcp)
 * - Code Diagnostics: Is code healthy? (errors, lint, tests, coverage)
 * - Work Activity: What's pending? (PRs, reviews)
 * - Next: What should I do?
 *
 * @see docs/vision/concepts.md for the Three Pillars model
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CentralHub } from "@pietgk/devac-core";
import type { Command } from "commander";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusOptions {
  /** Path to check status from (defaults to cwd) */
  path: string;

  /** Output format: "oneline" | "brief" | "full" */
  format: "oneline" | "brief" | "full";

  /** Output as JSON */
  json?: boolean;
}

export interface StatusResult {
  success: boolean;
  error?: string;

  /** Context information */
  context: {
    /** Current working directory */
    cwd: string;
    /** Detected workspace path (if any) */
    workspacePath?: string;
    /** Whether we're in a workspace */
    isWorkspace: boolean;
    /** Current repo name (if in a repo) */
    repoName?: string;
    /** Current branch */
    branch?: string;
    /** Detected issue ID (from worktree name) */
    issueId?: string;
    /** Worktree slug */
    worktreeSlug?: string;
  };

  /** DevAC infrastructure health */
  health: {
    /** Is hub connected/available */
    hubConnected: boolean;
    /** Hub path */
    hubPath?: string;
    /** Number of repos registered */
    reposRegistered: number;
    /** Is watch running (detected via lockfile) */
    watchActive: boolean;
  };

  /** Code diagnostics summary */
  diagnostics: {
    /** Total error count */
    errors: number;
    /** Total warning count */
    warnings: number;
    /** By source */
    bySource: {
      tsc: { errors: number; warnings: number };
      eslint: { errors: number; warnings: number };
      test: { errors: number; warnings: number };
      coverage: { errors: number; warnings: number };
    };
  };

  /** Work activity (GitHub-related) */
  activity: {
    /** Open PRs count */
    openPRs: number;
    /** Pending reviews count */
    pendingReviews: number;
    /** Open issues count */
    openIssues: number;
  };

  /** Suggested next steps */
  next: string[];

  /** Formatted output (for non-JSON) */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect if we're in a worktree and extract issue info
 */
function detectWorktreeInfo(dirPath: string): {
  repoName?: string;
  issueId?: string;
  slug?: string;
} {
  const dirName = path.basename(dirPath);

  // Worktree naming pattern: {repo}-{issueId}-{slug}
  // issueId format: {source}{originRepo}-{number} e.g., ghapi-123
  // Example: api-ghapi-123-auth → repo: api, issueId: ghapi-123, slug: auth

  // Try to parse as worktree (split on last dash for slug, then parse issueId)
  const parts = dirName.split("-");
  if (parts.length >= 3) {
    // Check if this looks like a worktree (has gh/gl prefix in middle)
    const issuePattern = /^(gh|gl)[a-z0-9]+-\d+$/;
    for (let i = 1; i < parts.length - 1; i++) {
      const potentialIssueId = parts.slice(i, -1).join("-");
      if (issuePattern.test(potentialIssueId)) {
        return {
          repoName: parts.slice(0, i).join("-"),
          issueId: potentialIssueId,
          slug: parts[parts.length - 1],
        };
      }
    }
  }

  return {};
}

/**
 * Get current git branch
 */
function getCurrentBranch(repoPath: string): string | undefined {
  const headPath = path.join(repoPath, ".git", "HEAD");
  try {
    const head = fs.readFileSync(headPath, "utf-8").trim();
    if (head.startsWith("ref: refs/heads/")) {
      return head.replace("ref: refs/heads/", "");
    }
    return head.slice(0, 7); // Detached HEAD - show short SHA
  } catch {
    return undefined;
  }
}

/**
 * Check if watch is active (via lockfile)
 */
function isWatchActive(workspacePath: string): boolean {
  const lockPath = path.join(workspacePath, ".devac", "watch.lock");
  try {
    return fs.existsSync(lockPath);
  } catch {
    return false;
  }
}

/**
 * Format one-liner status
 */
function formatOneLine(result: StatusResult): string {
  const parts: string[] = [];

  // Context
  if (result.context.issueId) {
    parts.push(`${result.context.repoName}-${result.context.issueId}`);
  } else if (result.context.repoName) {
    parts.push(result.context.repoName);
  } else if (result.context.isWorkspace) {
    parts.push("workspace");
  } else {
    parts.push(path.basename(result.context.cwd));
  }

  // Diagnostics
  const diagParts: string[] = [];
  if (result.diagnostics.errors > 0) {
    diagParts.push(`errors:${result.diagnostics.errors}`);
  }
  if (result.diagnostics.warnings > 0) {
    diagParts.push(`warnings:${result.diagnostics.warnings}`);
  }
  if (diagParts.length === 0) {
    diagParts.push("ok");
  }
  parts.push(diagParts.join(" "));

  // Health indicators
  const healthParts: string[] = [];
  if (result.health.hubConnected) {
    healthParts.push("hub:ok");
  }
  if (result.health.watchActive) {
    healthParts.push("watch:active");
  }
  if (healthParts.length > 0) {
    parts.push(healthParts.join(" "));
  }

  // Next action
  const nextAction = result.next[0];
  if (nextAction) {
    parts.push(`next:${nextAction.toLowerCase().replace(/\s+/g, "-")}`);
  }

  return parts.join("  ");
}

/**
 * Format brief status
 */
function formatBrief(result: StatusResult): string {
  const lines: string[] = [];

  lines.push("DevAC Status");

  // Context
  let contextStr = result.context.cwd;
  if (result.context.issueId) {
    contextStr = `${result.context.repoName}-${result.context.issueId}-${result.context.worktreeSlug}`;
    if (result.context.branch) {
      contextStr += ` (${result.context.branch})`;
    }
  } else if (result.context.repoName) {
    contextStr = result.context.repoName;
    if (result.context.branch) {
      contextStr += ` (${result.context.branch})`;
    }
  }
  lines.push(`  Context:      ${contextStr}`);

  // DevAC Health
  const healthParts: string[] = [];
  healthParts.push(result.health.watchActive ? "watch:active" : "watch:inactive");
  healthParts.push(result.health.hubConnected ? "hub:connected" : "hub:disconnected");
  lines.push(`  DevAC Health: ${healthParts.join("  ")}`);

  // Diagnostics
  const diagParts: string[] = [];
  if (result.diagnostics.bySource.tsc.errors > 0 || result.diagnostics.bySource.tsc.warnings > 0) {
    diagParts.push(
      `tsc:${result.diagnostics.bySource.tsc.errors}e/${result.diagnostics.bySource.tsc.warnings}w`
    );
  }
  if (
    result.diagnostics.bySource.eslint.errors > 0 ||
    result.diagnostics.bySource.eslint.warnings > 0
  ) {
    diagParts.push(
      `lint:${result.diagnostics.bySource.eslint.errors}e/${result.diagnostics.bySource.eslint.warnings}w`
    );
  }
  if (
    result.diagnostics.bySource.test.errors > 0 ||
    result.diagnostics.bySource.test.warnings > 0
  ) {
    diagParts.push(`test:${result.diagnostics.bySource.test.errors > 0 ? "failing" : "ok"}`);
  }
  if (diagParts.length === 0) {
    diagParts.push("all clear");
  }
  lines.push(`  Diagnostics:  ${diagParts.join("  ")}`);

  // Activity
  if (result.activity.openPRs > 0 || result.activity.pendingReviews > 0) {
    const activityParts: string[] = [];
    if (result.activity.openPRs > 0) {
      activityParts.push(`prs:${result.activity.openPRs}`);
    }
    if (result.activity.pendingReviews > 0) {
      activityParts.push(`reviews:${result.activity.pendingReviews}`);
    }
    lines.push(`  Activity:     ${activityParts.join("  ")}`);
  }

  // Next
  if (result.next.length > 0) {
    lines.push(`  Next:         ${result.next[0]}`);
  }

  return lines.join("\n");
}

/**
 * Format full status
 */
function formatFull(result: StatusResult): string {
  const lines: string[] = [];

  lines.push("DevAC Full Status Report");
  lines.push("═".repeat(50));
  lines.push("");

  // CONTEXT
  lines.push("CONTEXT");
  lines.push("─".repeat(30));
  lines.push(`  Path:       ${result.context.cwd}`);
  if (result.context.workspacePath) {
    lines.push(`  Workspace:  ${result.context.workspacePath}`);
  }
  if (result.context.repoName) {
    lines.push(`  Repository: ${result.context.repoName}`);
  }
  if (result.context.branch) {
    lines.push(`  Branch:     ${result.context.branch}`);
  }
  if (result.context.issueId) {
    lines.push(`  Issue:      ${result.context.issueId}`);
    if (result.context.worktreeSlug) {
      lines.push(
        `  Worktree:   ${result.context.repoName}-${result.context.issueId}-${result.context.worktreeSlug}`
      );
    }
  }
  lines.push("");

  // DEVAC HEALTH
  lines.push("DEVAC HEALTH");
  lines.push("─".repeat(30));
  lines.push(`  Watch:      ${result.health.watchActive ? "Active" : "Inactive"}`);
  lines.push(
    `  Hub:        ${
      result.health.hubConnected ? "Connected" : "Disconnected"
    }${result.health.hubPath ? ` (${result.health.hubPath})` : ""}`
  );
  lines.push(`  Repos:      ${result.health.reposRegistered} registered`);
  lines.push("");

  // DIAGNOSTICS
  lines.push("DIAGNOSTICS");
  lines.push("─".repeat(30));
  if (result.diagnostics.errors === 0 && result.diagnostics.warnings === 0) {
    lines.push("  ✓ All clear - no issues found");
  } else {
    lines.push(
      `  Total:      ${result.diagnostics.errors} errors, ${result.diagnostics.warnings} warnings`
    );
    lines.push("");
    if (
      result.diagnostics.bySource.tsc.errors > 0 ||
      result.diagnostics.bySource.tsc.warnings > 0
    ) {
      lines.push(
        `  TypeScript: ${result.diagnostics.bySource.tsc.errors} errors, ${result.diagnostics.bySource.tsc.warnings} warnings`
      );
    }
    if (
      result.diagnostics.bySource.eslint.errors > 0 ||
      result.diagnostics.bySource.eslint.warnings > 0
    ) {
      lines.push(
        `  Lint:       ${result.diagnostics.bySource.eslint.errors} errors, ${result.diagnostics.bySource.eslint.warnings} warnings`
      );
    }
    if (result.diagnostics.bySource.test.errors > 0) {
      lines.push(`  Tests:      ${result.diagnostics.bySource.test.errors} failing`);
    }
    if (result.diagnostics.bySource.coverage.warnings > 0) {
      lines.push(`  Coverage:   ${result.diagnostics.bySource.coverage.warnings} below threshold`);
    }
  }
  lines.push("");

  // ACTIVITY
  if (
    result.activity.openPRs > 0 ||
    result.activity.pendingReviews > 0 ||
    result.activity.openIssues > 0
  ) {
    lines.push("ACTIVITY");
    lines.push("─".repeat(30));
    if (result.activity.openPRs > 0) {
      lines.push(`  Open PRs:       ${result.activity.openPRs}`);
    }
    if (result.activity.pendingReviews > 0) {
      lines.push(`  Pending Reviews: ${result.activity.pendingReviews}`);
    }
    if (result.activity.openIssues > 0) {
      lines.push(`  Open Issues:    ${result.activity.openIssues}`);
    }
    lines.push("");
  }

  // NEXT STEPS
  if (result.next.length > 0) {
    lines.push("NEXT STEPS");
    lines.push("─".repeat(30));
    result.next.forEach((step, i) => {
      lines.push(`  ${i + 1}. ${step}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute status command
 */
export async function statusCommand(options: StatusOptions): Promise<StatusResult> {
  const cwd = path.resolve(options.path);

  // Initialize result with defaults
  const result: StatusResult = {
    success: true,
    context: {
      cwd,
      isWorkspace: false,
    },
    health: {
      hubConnected: false,
      reposRegistered: 0,
      watchActive: false,
    },
    diagnostics: {
      errors: 0,
      warnings: 0,
      bySource: {
        tsc: { errors: 0, warnings: 0 },
        eslint: { errors: 0, warnings: 0 },
        test: { errors: 0, warnings: 0 },
        coverage: { errors: 0, warnings: 0 },
      },
    },
    activity: {
      openPRs: 0,
      pendingReviews: 0,
      openIssues: 0,
    },
    next: [],
  };

  try {
    // Detect worktree info from current directory
    const worktreeInfo = detectWorktreeInfo(cwd);
    if (worktreeInfo.repoName) {
      result.context.repoName = worktreeInfo.repoName;
      result.context.issueId = worktreeInfo.issueId;
      result.context.worktreeSlug = worktreeInfo.slug;
    }

    // Get current branch
    result.context.branch = getCurrentBranch(cwd);

    // Try to find workspace (walk up to find parent with multiple repos)
    let checkPath = cwd;
    let workspacePath: string | undefined;
    for (let i = 0; i < 5; i++) {
      // Check up to 5 levels
      const parentPath = path.dirname(checkPath);
      if (parentPath === checkPath) break;

      // Check if parent looks like a workspace (has .devac or multiple git repos)
      const devacPath = path.join(parentPath, ".devac");
      if (fs.existsSync(devacPath)) {
        workspacePath = parentPath;
        break;
      }
      checkPath = parentPath;
    }

    if (workspacePath) {
      result.context.workspacePath = workspacePath;
      result.context.isWorkspace = true;

      // Check watch status
      result.health.watchActive = isWatchActive(workspacePath);

      // Try to connect to hub
      const hubDir = path.join(workspacePath, ".devac");
      const hubPath = path.join(hubDir, "central.duckdb");
      if (fs.existsSync(hubPath)) {
        result.health.hubPath = hubPath;
        try {
          const hub = new CentralHub({ hubDir });
          await hub.init();
          result.health.hubConnected = true;

          // Get registered repos count
          const repos = await hub.listRepos();
          result.health.reposRegistered = repos.length;

          // Get diagnostics from hub
          try {
            const diagnostics = await hub.getDiagnostics({});
            for (const item of diagnostics) {
              const isError = item.severity === "error" || item.severity === "critical";
              const isWarning = item.severity === "warning";

              if (isError) {
                result.diagnostics.errors++;
              } else if (isWarning) {
                result.diagnostics.warnings++;
              }

              // By source
              const source = item.source as keyof typeof result.diagnostics.bySource;
              if (result.diagnostics.bySource[source]) {
                if (isError) {
                  result.diagnostics.bySource[source].errors++;
                } else if (isWarning) {
                  result.diagnostics.bySource[source].warnings++;
                }
              }

              // Activity (workflow category)
              if (item.category === "task" || item.category === "feedback") {
                result.activity.openIssues++;
              } else if (item.category === "code-review") {
                result.activity.pendingReviews++;
              }
            }
          } catch {
            // Hub might not have diagnostics table yet
          }

          await hub.close();
        } catch {
          // Hub exists but couldn't connect
        }
      }
    }

    // Determine next steps based on current state
    if (result.diagnostics.errors > 0) {
      if (result.diagnostics.bySource.tsc.errors > 0) {
        result.next.push(`Fix ${result.diagnostics.bySource.tsc.errors} type errors`);
      }
      if (result.diagnostics.bySource.eslint.errors > 0) {
        result.next.push(`Fix ${result.diagnostics.bySource.eslint.errors} lint errors`);
      }
      if (result.diagnostics.bySource.test.errors > 0) {
        result.next.push("Fix failing tests");
      }
    } else if (result.diagnostics.warnings > 0) {
      result.next.push(`Address ${result.diagnostics.warnings} warnings`);
    } else if (!result.health.hubConnected) {
      result.next.push("Initialize hub: devac workspace init");
    } else if (!result.health.watchActive) {
      result.next.push("Start watch: devac workspace watch");
    } else {
      result.next.push("All clear - ready to code!");
    }

    // Format output based on requested format
    if (!options.json) {
      switch (options.format) {
        case "oneline":
          result.formatted = formatOneLine(result);
          break;
        case "brief":
          result.formatted = formatBrief(result);
          break;
        case "full":
          result.formatted = formatFull(result);
          break;
      }
    }

    return result;
  } catch (error) {
    return {
      ...result,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Register the status command
 */
export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show DevAC status (context, health, diagnostics, next steps)")
    .option("-p, --path <path>", "Path to check status from", process.cwd())
    .option("--brief", "Show brief summary (default)")
    .option("--full", "Show full detailed status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      // Determine format
      let format: "oneline" | "brief" | "full" = "brief";
      if (options.full) {
        format = "full";
      }

      const result = await statusCommand({
        path: options.path,
        format,
        json: options.json,
      });

      if (result.success) {
        if (options.json) {
          // Remove formatted field for JSON output
          const { formatted, ...jsonResult } = result;
          console.log(JSON.stringify(jsonResult, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });
}
