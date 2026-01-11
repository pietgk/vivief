/**
 * Context Command
 *
 * Discovers and displays cross-repository context.
 * Includes CI status and LLM review subcommands.
 */

import {
  buildReviewPrompt,
  createHubClient,
  createSubIssues,
  discoverContext,
  formatCIStatus,
  formatContext,
  formatIssues,
  formatReviewAsMarkdown,
  formatReviews,
  gatherDiffs,
  getCIStatusForContext,
  getIssuesForContext,
  getReviewsForContext,
  parseReviewResponse,
  syncCIStatusToHub,
  syncIssuesToHub,
  syncReviewsToHub,
} from "@pietgk/devac-core";
import type {
  CIStatusOptions,
  CIStatusResult,
  CISyncResult,
  DiscoveryOptions,
  IssueSyncResult,
  IssuesOptions,
  IssuesResult,
  RepoContext,
  ReviewOptions,
  ReviewResult,
  ReviewSyncResult,
  ReviewsOptions,
  ReviewsResult,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";

export interface ContextOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Discovery options */
  discovery?: DiscoveryOptions;
}

export interface ContextResult {
  success: boolean;
  context?: RepoContext;
  formatted?: string;
  error?: string;
}

/**
 * Discover and display context
 */
export async function contextCommand(options: ContextOptions): Promise<ContextResult> {
  try {
    const context = await discoverContext(options.cwd, options.discovery);

    if (options.format === "json") {
      return {
        success: true,
        context,
      };
    }

    return {
      success: true,
      context,
      formatted: formatContext(context),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// CI Status Command
// ============================================================================

export interface ContextCIOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Include individual check details */
  includeChecks?: boolean;
  /** Sync CI status to the central Hub */
  syncToHub?: boolean;
  /** Only sync failing checks to Hub (default: false) */
  failingOnly?: boolean;
  /** CI status options */
  ciOptions?: CIStatusOptions;
}

export interface ContextCIResult {
  success: boolean;
  result?: CIStatusResult;
  syncResult?: CISyncResult;
  formatted?: string;
  error?: string;
}

/**
 * Get CI status for all repos/worktrees in context
 */
export async function contextCICommand(options: ContextCIOptions): Promise<ContextCIResult> {
  try {
    // Discover context
    const context = await discoverContext(options.cwd);

    // Get CI status
    const ciOptions: CIStatusOptions = {
      includeChecks: options.includeChecks ?? false,
      ...options.ciOptions,
    };

    const result = await getCIStatusForContext(context, ciOptions);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Optionally sync to Hub
    let syncResult: CISyncResult | undefined;
    if (options.syncToHub) {
      const hubDir = await getWorkspaceHubDir();
      const client = createHubClient({ hubDir });
      syncResult = await syncCIStatusToHub(client, result, {
        failingOnly: options.failingOnly ?? false,
        clearExisting: true,
      });
    }

    if (options.format === "json") {
      return {
        success: true,
        result,
        syncResult,
      };
    }

    // Format output
    let formatted = formatCIStatus(result);
    if (syncResult) {
      formatted += formatSyncResult(syncResult);
    }

    return {
      success: true,
      result,
      syncResult,
      formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format the sync result for display
 */
function formatSyncResult(syncResult: CISyncResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Hub Sync:");
  lines.push(`  Pushed ${syncResult.pushed} diagnostic items to Hub`);
  lines.push(`  Processed ${syncResult.reposProcessed} repositories`);
  if (syncResult.errors.length > 0) {
    lines.push(`  Errors: ${syncResult.errors.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Format the issue sync result for display
 */
function formatIssueSyncResult(syncResult: IssueSyncResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Hub Sync (Issues):");
  lines.push(`  Pushed ${syncResult.pushed} issues to Hub`);
  lines.push(`  Processed ${syncResult.reposProcessed} repositories`);
  if (syncResult.errors.length > 0) {
    lines.push(`  Errors: ${syncResult.errors.join(", ")}`);
  }
  return lines.join("\n");
}

// ============================================================================
// Issues Command
// ============================================================================

export interface ContextIssuesOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Only fetch open issues (default: true) */
  openOnly?: boolean;
  /** Maximum issues per repo */
  limit?: number;
  /** Filter by labels */
  labels?: string[];
  /** Sync issues to the central Hub */
  syncToHub?: boolean;
  /** Issues options */
  issuesOptions?: IssuesOptions;
}

export interface ContextIssuesResult {
  success: boolean;
  result?: IssuesResult;
  syncResult?: IssueSyncResult;
  formatted?: string;
  error?: string;
}

/**
 * Get GitHub issues for all repos in context
 */
export async function contextIssuesCommand(
  options: ContextIssuesOptions
): Promise<ContextIssuesResult> {
  try {
    // Discover context
    const context = await discoverContext(options.cwd);

    // Get issues
    const issuesOptions: IssuesOptions = {
      openOnly: options.openOnly ?? true,
      limit: options.limit ?? 50,
      labels: options.labels,
      ...options.issuesOptions,
    };

    const result = await getIssuesForContext(context, issuesOptions);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Optionally sync to Hub
    let syncResult: IssueSyncResult | undefined;
    if (options.syncToHub) {
      const hubDir = await getWorkspaceHubDir();
      const client = createHubClient({ hubDir });
      syncResult = await syncIssuesToHub(client, result, {
        clearExisting: true,
      });
    }

    if (options.format === "json") {
      return {
        success: true,
        result,
        syncResult,
      };
    }

    // Format output
    let formatted = formatIssues(result);
    if (syncResult) {
      formatted += formatIssueSyncResult(syncResult);
    }

    return {
      success: true,
      result,
      syncResult,
      formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// PR Reviews Command
// ============================================================================

export interface ContextReviewsOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Only include pending/changes_requested reviews (default: true) */
  pendingOnly?: boolean;
  /** Include review comments with file locations (default: true) */
  includeComments?: boolean;
  /** Sync reviews to the central Hub */
  syncToHub?: boolean;
  /** Only sync reviews with changes_requested state (default: false) */
  changesRequestedOnly?: boolean;
  /** Reviews options */
  reviewsOptions?: ReviewsOptions;
}

export interface ContextReviewsResult {
  success: boolean;
  result?: ReviewsResult;
  syncResult?: ReviewSyncResult;
  formatted?: string;
  error?: string;
}

/**
 * Get PR reviews for all repos in context
 */
export async function contextReviewsCommand(
  options: ContextReviewsOptions
): Promise<ContextReviewsResult> {
  try {
    // Discover context
    const context = await discoverContext(options.cwd);

    // Get reviews
    const reviewsOptions: ReviewsOptions = {
      pendingOnly: options.pendingOnly ?? true,
      includeComments: options.includeComments ?? true,
      ...options.reviewsOptions,
    };

    const result = await getReviewsForContext(context, reviewsOptions);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Optionally sync to Hub
    let syncResult: ReviewSyncResult | undefined;
    if (options.syncToHub) {
      const hubDir = await getWorkspaceHubDir();
      const client = createHubClient({ hubDir });
      syncResult = await syncReviewsToHub(client, result, {
        clearExisting: true,
        changesRequestedOnly: options.changesRequestedOnly ?? false,
      });
    }

    if (options.format === "json") {
      return {
        success: true,
        result,
        syncResult,
      };
    }

    // Format output
    let formatted = formatReviews(result);
    if (syncResult) {
      formatted += formatReviewSyncResult(syncResult);
    }

    return {
      success: true,
      result,
      syncResult,
      formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format the review sync result for display
 */
function formatReviewSyncResult(syncResult: ReviewSyncResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Hub Sync (Reviews):");
  lines.push(`  Pushed ${syncResult.pushed} review items to Hub`);
  lines.push(`  Processed ${syncResult.reposProcessed} repositories`);
  if (syncResult.errors.length > 0) {
    lines.push(`  Errors: ${syncResult.errors.join(", ")}`);
  }
  return lines.join("\n");
}

// ============================================================================
// Review Command (LLM Code Review)
// ============================================================================

export interface ContextReviewOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Focus area for the review */
  focus?: "security" | "performance" | "tests" | "all";
  /** Base branch to diff against */
  baseBranch?: string;
  /** Create sub-issues for follow-up work */
  createSubIssues?: boolean;
  /** Review options */
  reviewOptions?: ReviewOptions;
}

export interface ContextReviewResult {
  success: boolean;
  result?: ReviewResult;
  prompt?: string;
  formatted?: string;
  subIssuesCreated?: number[];
  error?: string;
}

/**
 * Run LLM review on changes in context
 *
 * This command gathers diffs and generates a review prompt.
 * The actual LLM call is left to the user (output the prompt to pass to an LLM).
 *
 * If --create-sub-issues is passed and a response is provided, it will
 * create GitHub issues for follow-up work.
 */
export async function contextReviewCommand(
  options: ContextReviewOptions
): Promise<ContextReviewResult> {
  try {
    // Discover context
    const context = await discoverContext(options.cwd);

    // Gather diffs
    const reviewOpts: ReviewOptions = {
      focus: options.focus ?? "all",
      baseBranch: options.baseBranch ?? "main",
      ...options.reviewOptions,
    };

    const diffs = await gatherDiffs(context, reviewOpts);

    if (diffs.diffs.length === 0) {
      return {
        success: true,
        formatted: "No changes found to review.",
        result: {
          success: true,
          summary: "No changes found.",
          findings: [],
          suggestedSubIssues: [],
          stats: { totalFiles: 0, totalChanges: 0, reposReviewed: 0 },
        },
      };
    }

    // Build the review prompt
    const prompt = buildReviewPrompt(diffs, reviewOpts);

    // For now, we output the prompt for the user to pass to an LLM
    // In a future version, we could integrate with Claude API directly
    if (options.format === "json") {
      return {
        success: true,
        prompt,
        result: {
          success: true,
          summary: `Gathered diffs from ${diffs.diffs.length} repos, ${diffs.totalFiles} files, ${diffs.totalChanges} changes.`,
          findings: [],
          suggestedSubIssues: [],
          stats: {
            totalFiles: diffs.totalFiles,
            totalChanges: diffs.totalChanges,
            reposReviewed: diffs.diffs.length,
          },
        },
      };
    }

    // Format output with the prompt
    const formatted = formatReviewPromptOutput(diffs, prompt);

    return {
      success: true,
      prompt,
      formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process an LLM response and optionally create sub-issues
 */
export async function processReviewResponse(
  cwd: string,
  response: string,
  options: { createSubIssues?: boolean } = {}
): Promise<ContextReviewResult> {
  try {
    // Discover context to get issue number
    const context = await discoverContext(cwd);

    // Gather diffs for stats
    const diffs = await gatherDiffs(context);

    // Parse the response
    const result = parseReviewResponse(response, diffs);

    // Optionally create sub-issues
    let subIssuesCreated: number[] | undefined;
    if (options.createSubIssues && result.suggestedSubIssues.length > 0 && context.issueNumber) {
      const createResults = await createSubIssues(result.suggestedSubIssues, context.issueNumber);
      subIssuesCreated = createResults
        .filter(
          (r): r is typeof r & { issueNumber: number } => r.success && r.issueNumber !== undefined
        )
        .map((r) => r.issueNumber);
    }

    return {
      success: true,
      result,
      formatted: formatReviewAsMarkdown(result),
      subIssuesCreated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format the review prompt output for display
 */
function formatReviewPromptOutput(
  diffs: {
    diffs: Array<{ repo: string; filesChanged: string[] }>;
    totalFiles: number;
    totalChanges: number;
  },
  prompt: string
): string {
  const lines: string[] = [];

  lines.push("# Review Prompt Generated");
  lines.push("");
  lines.push(`Gathered changes from ${diffs.diffs.length} repositories:`);
  lines.push("");

  for (const diff of diffs.diffs) {
    lines.push(`  - ${diff.repo}: ${diff.filesChanged.length} files`);
  }

  lines.push("");
  lines.push(`Total: ${diffs.totalFiles} files, ${diffs.totalChanges} changes`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Prompt (copy and paste to an LLM)");
  lines.push("");
  lines.push("```");
  lines.push(prompt);
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("After getting a response, you can process it with:");
  lines.push("  devac context review --process-response <response-file>");
  lines.push("");

  return lines.join("\n");
}

/**
 * Register the context command with the CLI program
 */
export function registerContextCommand(program: Command): void {
  const context = program
    .command("context")
    .description("Discover and display cross-repository context")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await contextCommand({
        cwd: process.cwd(),
        format: options.json ? "json" : "text",
      });

      if (result.success) {
        if (options.json) {
          console.log(JSON.stringify(result.context, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ Context discovery failed: ${result.error}`);
        process.exit(1);
      }
    });

  // CI subcommand
  context
    .command("ci")
    .description("Get CI status for repos in context")
    .option("--json", "Output as JSON")
    .option("--include-checks", "Include individual check details")
    .option("--sync-to-hub", "Sync CI status to central Hub")
    .option("--failing-only", "Only sync failing checks to Hub")
    .action(async (options, command) => {
      // Merge parent options with subcommand options (subcommand takes precedence)
      const opts = { ...command.parent?.opts(), ...options };
      const result = await contextCICommand({
        cwd: process.cwd(),
        format: opts.json ? "json" : "text",
        includeChecks: opts.includeChecks,
        syncToHub: opts.syncToHub,
        failingOnly: opts.failingOnly,
      });

      if (result.success) {
        if (opts.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ CI status failed: ${result.error}`);
        process.exit(1);
      }
    });

  // Issues subcommand
  context
    .command("issues")
    .description("Get GitHub issues for repos in context")
    .option("--json", "Output as JSON")
    .option("--all", "Include closed issues")
    .option("-l, --limit <count>", "Maximum issues per repo", "50")
    .option("--labels <labels...>", "Filter by labels")
    .option("--sync-to-hub", "Sync issues to central Hub")
    .action(async (options, command) => {
      const opts = { ...command.parent?.opts(), ...options };
      const result = await contextIssuesCommand({
        cwd: process.cwd(),
        format: opts.json ? "json" : "text",
        openOnly: !opts.all,
        limit: opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
        labels: opts.labels,
        syncToHub: opts.syncToHub,
      });

      if (result.success) {
        if (opts.json) {
          console.log(
            JSON.stringify({ result: result.result, syncResult: result.syncResult }, null, 2)
          );
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ Issues fetch failed: ${result.error}`);
        process.exit(1);
      }
    });

  // Review subcommand
  context
    .command("review")
    .description("Generate LLM review prompt for changes")
    .option("--json", "Output as JSON")
    .option("--focus <area>", "Focus area (security, performance, tests, all)", "all")
    .option("--base <branch>", "Base branch to diff against", "main")
    .option("--create-sub-issues", "Create sub-issues for follow-up work")
    .action(async (options, command) => {
      const opts = { ...command.parent?.opts(), ...options };
      const result = await contextReviewCommand({
        cwd: process.cwd(),
        format: opts.json ? "json" : "text",
        focus: opts.focus as "security" | "performance" | "tests" | "all",
        baseBranch: opts.base,
        createSubIssues: opts.createSubIssues,
      });

      if (result.success) {
        if (opts.json) {
          console.log(JSON.stringify({ prompt: result.prompt, result: result.result }, null, 2));
        } else {
          console.log(result.formatted);
        }
      } else {
        console.error(`✗ Review generation failed: ${result.error}`);
        process.exit(1);
      }
    });
}
