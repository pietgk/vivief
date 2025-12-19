/**
 * Context Command
 *
 * Discovers and displays cross-repository context.
 * Includes CI status and LLM review subcommands.
 */

import {
  buildReviewPrompt,
  createSubIssues,
  discoverContext,
  formatCIStatus,
  formatContext,
  formatReviewAsMarkdown,
  gatherDiffs,
  getCIStatusForContext,
  parseReviewResponse,
} from "@pietgk/devac-core";
import type {
  CIStatusOptions,
  CIStatusResult,
  DiscoveryOptions,
  RepoContext,
  ReviewOptions,
  ReviewResult,
} from "@pietgk/devac-core";

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
  /** CI status options */
  ciOptions?: CIStatusOptions;
}

export interface ContextCIResult {
  success: boolean;
  result?: CIStatusResult;
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

    if (options.format === "json") {
      return {
        success: true,
        result,
      };
    }

    return {
      success: true,
      result,
      formatted: formatCIStatus(result),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Review Command
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
