#!/usr/bin/env node

/**
 * devac-worktree CLI Entry Point
 *
 * Git worktree + Claude CLI workflow for GitHub issues
 */

import { parseIssueId } from "@pietgk/devac-core";
import { Command } from "commander";
import {
  cleanCommand,
  cleanMergedCommand,
  formatStatus,
  formatWorktreeList,
  listCommand,
  resumeCommand,
  startCommand,
  statusCommand,
} from "./commands/index.js";
import { VERSION } from "./version.js";

/**
 * Parse issue argument - supports both formats:
 * - Legacy: "37" (numeric only, requires being in a repo)
 * - New: "ghvivief-37" (full issue ID with source and repo)
 */
export function parseIssueArg(issueArg: string): {
  issueNumber: number;
  issueId?: string;
  repoName?: string;
} {
  // Try to parse as full issue ID first (e.g., "ghvivief-37")
  const parsed = parseIssueId(issueArg);
  if (parsed) {
    return {
      issueNumber: parsed.number,
      issueId: parsed.full,
      repoName: parsed.originRepo,
    };
  }

  // Fall back to legacy numeric format
  const numericValue = Number.parseInt(issueArg, 10);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    throw new Error(
      `Invalid issue: "${issueArg}". Use format "ghrepo-123" (e.g., ghvivief-37) or just the number if inside a repo.`
    );
  }

  return { issueNumber: numericValue };
}

const program = new Command();

program
  .name("devac-worktree")
  .description("Git worktree + Claude CLI workflow for GitHub issues")
  .version(VERSION);

// ─────────────────────────────────────────────────────────────────────────────
// START COMMAND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect multiple --also values into an array
 */
function collectAlso(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Parse comma-separated repos into an array
 */
export function parseRepos(value: string): string[] {
  return value
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

program
  .command("start <issue>")
  .description(
    "Create worktree and launch Claude for an issue. " +
      "Use 'ghrepo-123' format (e.g., ghvivief-37) to work from anywhere, " +
      "or just '123' when inside a repo."
  )
  .option("--skip-install", "Skip dependency installation")
  .option("--new-session", "Launch Claude CLI in the worktree")
  .option("--create-pr", "Create a draft PR immediately")
  .option(
    "--also <repo>",
    "Also create worktree in sibling repo (can be repeated)",
    collectAlso,
    []
  )
  .option(
    "--repos <repos>",
    "Create worktrees in these repos (comma-separated, use from parent directory)",
    parseRepos
  )
  .option("-v, --verbose", "Verbose output")
  .action(async (issue: string, options) => {
    let parsedIssue: ReturnType<typeof parseIssueArg>;
    try {
      parsedIssue = parseIssueArg(issue);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    const result = await startCommand({
      issueNumber: parsedIssue.issueNumber,
      issueId: parsedIssue.issueId,
      repoName: parsedIssue.repoName,
      skipInstall: options.skipInstall,
      newSession: options.newSession,
      createPr: options.createPr,
      verbose: options.verbose,
      also: options.also,
      repos: options.repos,
    });

    if (!result.success) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }

    if (!options.newSession && !options.repos) {
      console.log(`✓ Worktree created at ${result.worktreePath}`);
      console.log(`✓ Branch: ${result.branch}`);
      console.log("\nTo start working:");
      console.log(`  cd ${result.worktreePath}`);
      console.log("  claude");
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// LIST COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List active worktrees")
  .option("-v, --verbose", "Show detailed information")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const result = await listCommand({
      verbose: options.verbose,
      json: options.json,
    });

    if (options.json) {
      console.log(JSON.stringify(result.worktrees, null, 2));
    } else {
      console.log(formatWorktreeList(result.worktrees, { verbose: options.verbose }));
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// STATUS COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show worktrees with issue state and PR status")
  .option("-v, --verbose", "Show detailed information")
  .option("--json", "Output as JSON")
  .option("--issue-wide", "Show all worktrees for current issue across repos")
  .action(async (options) => {
    const result = await statusCommand({
      verbose: options.verbose,
      json: options.json,
      issueWide: options.issueWide,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        formatStatus(result.worktrees, {
          verbose: options.verbose,
          issueNumber: result.issueNumber,
        })
      );
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// RESUME COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("resume <issue>")
  .description(
    "Resume work on an existing worktree. " +
      "Use 'ghrepo-123' format or just '123' when inside a repo."
  )
  .option("--new-session", "Launch Claude CLI in the worktree")
  .option("-v, --verbose", "Verbose output")
  .action(async (issue: string, options) => {
    let parsedIssue: ReturnType<typeof parseIssueArg>;
    try {
      parsedIssue = parseIssueArg(issue);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    const result = await resumeCommand({
      issueNumber: parsedIssue.issueNumber,
      newSession: options.newSession,
      verbose: options.verbose,
    });

    if (!result.success) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }

    if (!options.newSession) {
      console.log(`✓ Worktree found at ${result.worktreePath}`);
      console.log(`✓ Branch: ${result.branch}`);
      console.log("\nTo continue working:");
      console.log(`  cd ${result.worktreePath}`);
      console.log("  claude");
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("clean <issue>")
  .description(
    "Remove worktree after PR is merged. " +
      "Use 'ghrepo-123' format or just '123' when inside a repo."
  )
  .option("-f, --force", "Force removal (skip PR check AND remove with modified files)")
  .option("--skip-pr-check", "Skip the PR merged check only")
  .option("--keep-branch", "Keep the git branch")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-v, --verbose", "Verbose output")
  .action(async (issue: string, options) => {
    let parsedIssue: ReturnType<typeof parseIssueArg>;
    try {
      parsedIssue = parseIssueArg(issue);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    const result = await cleanCommand({
      issueNumber: parsedIssue.issueNumber,
      force: options.force,
      skipPrCheck: options.skipPrCheck,
      keepBranch: options.keepBranch,
      yes: options.yes,
      verbose: options.verbose,
    });

    if (!result.success) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }

    console.log(`✓ Removed worktree: ${result.removed}`);
  });

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN-MERGED COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command("clean-merged")
  .description("Clean all worktrees with merged PRs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-v, --verbose", "Verbose output")
  .action(async (options) => {
    const result = await cleanMergedCommand({
      yes: options.yes,
      verbose: options.verbose,
    });

    console.log(`✓ Cleaned ${result.cleaned} worktrees`);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const error of result.errors) {
        console.log(`  • ${error}`);
      }
    }
  });

// Parse and run (only when executed as CLI, not when imported for testing)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("devac-worktree");

if (isMainModule) {
  program.parse();
}
