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
import {
  type WorkspaceStatus,
  createHubClient,
  discoverContext,
  getCIStatusForContext,
  getWorkspaceStatus,
  setGlobalLogLevel,
  syncCIStatusToHub,
} from "@pietgk/devac-core";
import type { Command } from "commander";

// ─────────────────────────────────────────────────────────────────────────────
// Auto-discovered Workspace Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveredRepo {
  name: string;
  docsFile: string; // "AGENTS.md" or "CLAUDE.md"
  description?: string; // First paragraph from docs
}

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

  /** Show only seed status (skip diagnostics) */
  seedsOnly?: boolean;

  /** Skip live CI fetch, use hub cache only (faster) */
  cached?: boolean;

  /** After gathering, sync CI results to hub */
  sync?: boolean;

  /** Hook injection mode - output hook-compatible JSON for Claude Code hooks */
  inject?: boolean;
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

  /** Work activity (GitHub-related) - from hub cache */
  activity: {
    /** Open PRs count */
    openPRs: number;
    /** Pending reviews count */
    pendingReviews: number;
    /** Open issues count */
    openIssues: number;
  };

  /** Workflow status (CI/GitHub) - live from GitHub */
  workflow?: {
    /** Whether CI status was fetched successfully */
    available: boolean;
    /** Error message if CI fetch failed */
    error?: string;
    /** CI status for each repo */
    statuses: Array<{
      repo: string;
      status: "passing" | "failing" | "pending" | "no-pr" | "unknown";
      prNumber?: number;
      prTitle?: string;
    }>;
    /** Summary counts */
    summary: {
      total: number;
      passing: number;
      failing: number;
      pending: number;
      noPr: number;
    };
  };

  /** Suggested next steps */
  next: string[];

  /** Seed status for repos (from devac-core) */
  seeds?: WorkspaceStatus;

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
 * Extract the first paragraph from a markdown file for use as a description.
 * Returns undefined if file doesn't exist or has no suitable content.
 */
function extractFirstParagraph(filePath: string): string | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    let inParagraph = false;
    const paragraphLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip headings and empty lines at the start
      if (!inParagraph) {
        if (trimmed.startsWith("#") || trimmed === "") {
          continue;
        }
        // Found start of first paragraph
        inParagraph = true;
      }

      // Collect paragraph lines until empty line or heading
      if (inParagraph) {
        if (trimmed === "" || trimmed.startsWith("#")) {
          break;
        }
        paragraphLines.push(trimmed);
      }
    }

    if (paragraphLines.length === 0) {
      return undefined;
    }

    // Join and truncate to reasonable length
    const paragraph = paragraphLines.join(" ");
    const maxLen = 100;
    return paragraph.length > maxLen ? `${paragraph.substring(0, maxLen)}...` : paragraph;
  } catch {
    return undefined;
  }
}

/**
 * Auto-discover repositories in a workspace directory.
 * Looks for git repos with AGENTS.md or CLAUDE.md docs files.
 */
function discoverWorkspaceRepos(workspacePath: string): DiscoveredRepo[] {
  const repos: DiscoveredRepo[] = [];

  try {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip non-directories and the "workspace" config repo itself
      if (!entry.isDirectory() || entry.name === "workspace") {
        continue;
      }

      const repoPath = path.join(workspacePath, entry.name);

      // Check if it's a git repository
      const gitPath = path.join(repoPath, ".git");
      if (!fs.existsSync(gitPath)) {
        continue;
      }

      // Find docs file (prefer AGENTS.md, fallback to CLAUDE.md)
      const docsFile = ["AGENTS.md", "CLAUDE.md"].find((f) =>
        fs.existsSync(path.join(repoPath, f))
      );

      // Skip repos without docs files
      if (!docsFile) {
        continue;
      }

      // Extract description from first paragraph
      const description = extractFirstParagraph(path.join(repoPath, docsFile));

      repos.push({
        name: entry.name,
        docsFile,
        description,
      });
    }
  } catch {
    // Directory read failed, return empty
  }

  // Sort by name for consistent output
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Format discovered repos for injection
 */
function formatWorkspaceContext(repos: DiscoveredRepo[]): string {
  const lines: string[] = [];
  lines.push(`Workspace with ${repos.length} repos:`);
  lines.push("");
  for (const repo of repos) {
    const desc = repo.description ? ` - ${repo.description}` : "";
    lines.push(`  - ${repo.name}${desc} (see @${repo.name}/${repo.docsFile})`);
  }
  return lines.join("\n");
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
function formatBrief(result: StatusResult, seedsOnly = false): string {
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

  // Seed Status (new section)
  if (result.seeds && result.seeds.repos.length > 0) {
    lines.push("");
    lines.push("  Seeds:");
    for (const repo of result.seeds.repos) {
      const { summary } = repo.seedStatus;
      const analyzed = summary.base + summary.both;
      const total = summary.total;

      let statusStr: string;
      if (total === 0) {
        statusStr = "no packages";
      } else if (analyzed === total) {
        statusStr = `${analyzed} package${analyzed !== 1 ? "s" : ""} analyzed`;
      } else if (analyzed === 0) {
        statusStr = "not analyzed";
      } else {
        statusStr = `${analyzed}/${total} analyzed`;
      }

      const hubStr = repo.hubStatus === "registered" ? " (registered)" : "";
      const repoName = repo.name.padEnd(20);
      lines.push(`    ${repoName}${hubStr}: ${statusStr}`);
    }
  }

  // Skip diagnostics if --seeds-only
  if (!seedsOnly) {
    // Diagnostics
    const diagParts: string[] = [];
    if (
      result.diagnostics.bySource.tsc.errors > 0 ||
      result.diagnostics.bySource.tsc.warnings > 0
    ) {
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

    // Workflow (CI/GitHub) - live status
    if (result.workflow) {
      lines.push("");
      lines.push("  Workflow:");
      if (!result.workflow.available) {
        lines.push(`    ⚠️  ${result.workflow.error ?? "CI status unavailable"}`);
      } else if (result.workflow.statuses.length === 0) {
        lines.push("    No repos with CI status");
      } else {
        for (const status of result.workflow.statuses) {
          const icon = getWorkflowIcon(status.status);
          const prInfo = status.prNumber ? `PR #${status.prNumber}` : "no PR";
          lines.push(`    ${icon} ${status.repo.padEnd(18)} ${prInfo}`);
        }
        // Summary line
        const { summary } = result.workflow;
        if (summary.failing > 0) {
          lines.push(`    Summary: ${summary.failing} failing, ${summary.passing} passing`);
        }
      }
    }
  }

  // Next
  if (result.next.length > 0) {
    lines.push(`  Next:         ${result.next[0]}`);
  }

  return lines.join("\n");
}

/**
 * Get icon for workflow/CI status
 */
function getWorkflowIcon(status: "passing" | "failing" | "pending" | "no-pr" | "unknown"): string {
  switch (status) {
    case "passing":
      return "✓";
    case "failing":
      return "✗";
    case "pending":
      return "⏳";
    case "no-pr":
      return "○";
    case "unknown":
      return "?";
  }
}

/**
 * Format full status
 */
function formatFull(result: StatusResult, seedsOnly = false): string {
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

  // SEED STATUS (new section)
  if (result.seeds && result.seeds.repos.length > 0) {
    lines.push("SEED STATUS");
    lines.push("─".repeat(50));

    for (const repo of result.seeds.repos) {
      const hubStr =
        repo.hubStatus === "registered"
          ? "(registered)"
          : repo.hubStatus === "pending"
            ? "(pending)"
            : "(unregistered)";

      lines.push(`${repo.name} ${hubStr}`);

      if (repo.seedStatus.packages.length === 0) {
        lines.push("  No packages detected");
      } else {
        for (const pkg of repo.seedStatus.packages) {
          const stateStr = formatSeedState(pkg.state);
          const dateStr = pkg.baseLastModified ? pkg.baseLastModified.split("T")[0] : "";

          let details = "";
          if (pkg.state === "none") {
            const relativePath = path.relative(result.seeds.workspacePath, pkg.packagePath);
            details = `run: devac analyze -p ${relativePath}`;
          } else if (pkg.state === "both" && pkg.deltaLastModified) {
            const branchDate = pkg.deltaLastModified.split("T")[0];
            details = `base: ${dateStr}, delta: ${branchDate}`;
          } else if (dateStr) {
            details = dateStr;
          }

          const pkgName = pkg.packageName.padEnd(20);
          lines.push(`  ${pkgName} [${stateStr}]  ${details}`);
        }
      }

      lines.push("");
    }

    // Summary
    lines.push("SEED SUMMARY");
    lines.push("─".repeat(30));
    lines.push(`  Repositories:       ${result.seeds.summary.totalRepos}`);
    lines.push(`  With seeds:         ${result.seeds.summary.reposWithSeeds}`);
    lines.push(`  Registered in hub:  ${result.seeds.summary.reposRegistered}`);
    lines.push(`  Packages analyzed:  ${result.seeds.summary.packagesAnalyzed}`);
    lines.push(`  Packages pending:   ${result.seeds.summary.packagesNeedAnalysis}`);
    lines.push("");
  }

  // Skip diagnostics if --seeds-only
  if (!seedsOnly) {
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
        lines.push(
          `  Coverage:   ${result.diagnostics.bySource.coverage.warnings} below threshold`
        );
      }
    }
    lines.push("");

    // ACTIVITY (from hub cache)
    if (
      result.activity.openPRs > 0 ||
      result.activity.pendingReviews > 0 ||
      result.activity.openIssues > 0
    ) {
      lines.push("ACTIVITY (cached)");
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

    // WORKFLOW (CI/GitHub) - live status
    if (result.workflow) {
      lines.push("WORKFLOW (CI/GitHub)");
      lines.push("─".repeat(45));
      if (!result.workflow.available) {
        lines.push(`  ⚠️  ${result.workflow.error ?? "CI status unavailable"}`);
      } else if (result.workflow.statuses.length === 0) {
        lines.push("  No repos with CI status");
      } else {
        for (const status of result.workflow.statuses) {
          const icon = getWorkflowIcon(status.status);
          const prInfo = status.prNumber ? `PR #${status.prNumber}` : "no PR";
          let line = `  ${icon} ${status.repo.padEnd(20)} ${prInfo}`;
          if (status.prTitle) {
            // Truncate long titles
            const maxLen = 40;
            const title =
              status.prTitle.length > maxLen
                ? `${status.prTitle.substring(0, maxLen)}...`
                : status.prTitle;
            line += ` - ${title}`;
          }
          lines.push(line);
        }
        lines.push("");
        // Summary
        const { summary } = result.workflow;
        lines.push(
          `  Summary: ${summary.passing} passing, ${summary.failing} failing, ` +
            `${summary.pending} pending, ${summary.noPr} no PR`
        );
      }
      lines.push("");
    }
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

/**
 * Format seed state for display
 */
function formatSeedState(state: string): string {
  switch (state) {
    case "none":
      return "none ";
    case "base":
      return "base ";
    case "delta":
      return "delta";
    case "both":
      return "both ";
    default:
      return state.padEnd(5);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute status command
 */
export async function statusCommand(options: StatusOptions): Promise<StatusResult> {
  // In inject mode, silence all logging to ensure clean JSON output
  if (options.inject) {
    setGlobalLogLevel("silent");
  }

  const cwd = path.resolve(options.path);
  const seedsOnly = options.seedsOnly ?? false;

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

    // Helper to check if a directory is a workspace
    const isWorkspaceDir = (dirPath: string): boolean => {
      // Check for .devac directory (DevAC hub)
      if (fs.existsSync(path.join(dirPath, ".devac"))) {
        return true;
      }
      // Check for workspace/CLAUDE.md (workspace config repo with docs)
      if (fs.existsSync(path.join(dirPath, "workspace", "CLAUDE.md"))) {
        return true;
      }
      return false;
    };

    // First check if cwd itself is a workspace
    if (isWorkspaceDir(cwd)) {
      workspacePath = cwd;
    }

    // If not found, walk up the tree
    if (!workspacePath) {
      for (let i = 0; i < 5; i++) {
        // Check up to 5 levels
        const parentPath = path.dirname(checkPath);
        if (parentPath === checkPath) break;

        if (isWorkspaceDir(parentPath)) {
          workspacePath = parentPath;
          break;
        }
        checkPath = parentPath;
      }
    }

    // Get seed status from devac-core
    try {
      result.seeds = await getWorkspaceStatus({ path: cwd, full: true });
      if (result.seeds.isWorkspace && !workspacePath) {
        workspacePath = result.seeds.workspacePath;
      }
    } catch {
      // Seed status detection failed, continue without it
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
          const client = createHubClient({ hubDir });
          result.health.hubConnected = true;

          // Get registered repos count
          const repos = await client.listRepos();
          result.health.reposRegistered = repos.length;

          // Fast path for --inject mode (hook injection)
          if (options.inject) {
            const contextParts: string[] = [];

            // Auto-discover repos in workspace
            const discoveredRepos = discoverWorkspaceRepos(workspacePath);
            if (discoveredRepos.length > 0) {
              contextParts.push(formatWorkspaceContext(discoveredRepos));
            }

            // Get diagnostics if available
            try {
              const counts = await client.getDiagnosticsCounts();
              const totalIssues = counts.error + counts.warning;
              if (totalIssues > 0) {
                contextParts.push(
                  `DevAC Status: ${counts.error} errors, ${counts.warning} warnings\nRun get_all_diagnostics to see details.`
                );
              }
            } catch {
              // Diagnostics not available, continue without
            }

            // Silent if nothing to inject
            if (contextParts.length === 0) {
              return result;
            }

            // Output hook-compatible JSON
            const hookOutput = {
              hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: `<system-reminder>\n${contextParts.join("\n\n")}\n</system-reminder>`,
              },
            };
            console.log(JSON.stringify(hookOutput));
            return result;
          }

          // Get diagnostics from hub (skip if --seeds-only)
          if (!seedsOnly) {
            try {
              const diagnostics = await client.getDiagnostics({});
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
          }
        } catch {
          // Hub exists but couldn't connect
        }
      }

      // Fallback inject mode when hub not available but workspace has repos
      if (options.inject) {
        const discoveredRepos = discoverWorkspaceRepos(workspacePath);
        if (discoveredRepos.length > 0) {
          const hookOutput = {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: `<system-reminder>\n${formatWorkspaceContext(discoveredRepos)}\n</system-reminder>`,
            },
          };
          console.log(JSON.stringify(hookOutput));
        }
        return result;
      }
    }

    // Fetch live CI status (unless --cached or --seeds-only)
    if (!seedsOnly && !options.cached) {
      try {
        // Discover context for CI status
        const context = await discoverContext(cwd);

        // Get CI status for all repos/worktrees
        const ciResult = await getCIStatusForContext(context, {
          includeChecks: false,
          timeout: 15000,
        });

        if (ciResult.success) {
          result.workflow = {
            available: true,
            statuses: ciResult.statuses.map((s) => ({
              repo: s.repo,
              status: s.status,
              prNumber: s.prNumber,
              prTitle: s.prTitle,
            })),
            summary: {
              total: ciResult.summary.total,
              passing: ciResult.summary.passing,
              failing: ciResult.summary.failing,
              pending: ciResult.summary.pending,
              noPr: ciResult.summary.noPr,
            },
          };

          // Optionally sync to hub
          if (options.sync && workspacePath) {
            const hubDir = path.join(workspacePath, ".devac");
            try {
              const client = createHubClient({ hubDir });
              await syncCIStatusToHub(client, ciResult, {
                failingOnly: false,
                clearExisting: true,
              });
            } catch {
              // Sync failed, but don't fail the whole command
            }
          }
        } else {
          result.workflow = {
            available: false,
            error: ciResult.error,
            statuses: [],
            summary: { total: 0, passing: 0, failing: 0, pending: 0, noPr: 0 },
          };
        }
      } catch (error) {
        result.workflow = {
          available: false,
          error: error instanceof Error ? error.message : String(error),
          statuses: [],
          summary: { total: 0, passing: 0, failing: 0, pending: 0, noPr: 0 },
        };
      }
    }

    // Determine next steps based on current state
    // Check for packages needing analysis first
    if (result.seeds && result.seeds.summary.packagesNeedAnalysis > 0) {
      result.next.push("Sync workspace: devac sync");
    }
    // Check for CI failures (highest priority workflow issue)
    if (result.workflow?.available && result.workflow.summary.failing > 0) {
      const failingRepos = result.workflow.statuses
        .filter((s) => s.status === "failing")
        .map((s) => s.repo);
      result.next.push(`Fix CI failures in: ${failingRepos.join(", ")}`);
    }
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
      result.next.push("Initialize hub: devac hub init, then devac sync");
    } else if (!result.health.watchActive) {
      result.next.push("Start watch: devac workspace watch");
    } else if (result.next.length === 0) {
      result.next.push("All clear - ready to code!");
    }

    // Format output based on requested format
    if (!options.json) {
      switch (options.format) {
        case "oneline":
          result.formatted = formatOneLine(result);
          break;
        case "brief":
          result.formatted = formatBrief(result, seedsOnly);
          break;
        case "full":
          result.formatted = formatFull(result, seedsOnly);
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
    .description("Show DevAC status (context, health, seeds, diagnostics, workflow, next steps)")
    .option("-p, --path <path>", "Path to check status from", process.cwd())
    .option("--brief", "Show brief summary (default)")
    .option("--full", "Show full detailed status")
    .option("--json", "Output as JSON")
    .option("--seeds-only", "Show only seed status (skip diagnostics)")
    .option("--cached", "Skip live CI fetch, use hub cache only (faster)")
    .option("--sync", "Sync CI results to hub after gathering")
    .option("--inject", "Output hook-compatible JSON for Claude Code hooks (silent if no issues)")
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
        seedsOnly: options.seedsOnly,
        cached: options.cached,
        sync: options.sync,
        inject: options.inject,
      });

      // In inject mode, output is already handled in statusCommand
      if (options.inject) {
        return;
      }

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
