#!/usr/bin/env node

/**
 * devac-worktree CLI Entry Point
 *
 * Git worktree + Claude CLI workflow for GitHub issues
 */

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
function parseRepos(value: string): string[] {
  return value
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

program
  .command("start <issue-number>")
  .description("Create worktree and launch Claude for an issue")
  .option("--skip-install", "Skip dependency installation")
  .option("--skip-claude", "Skip launching Claude CLI")
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
  .action(async (issueNumber: string, options) => {
    const result = await startCommand({
      issueNumber: Number.parseInt(issueNumber, 10),
      skipInstall: options.skipInstall,
      skipClaude: options.skipClaude,
      createPr: options.createPr,
      verbose: options.verbose,
      also: options.also,
      repos: options.repos,
    });

    if (!result.success) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }

    if (options.skipClaude && !options.repos) {
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
  .command("resume <issue-number>")
  .description("Resume work on an existing worktree")
  .option("--skip-claude", "Skip launching Claude CLI")
  .option("-v, --verbose", "Verbose output")
  .action(async (issueNumber: string, options) => {
    const result = await resumeCommand({
      issueNumber: Number.parseInt(issueNumber, 10),
      skipClaude: options.skipClaude,
      verbose: options.verbose,
    });

    if (!result.success) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }

    if (options.skipClaude) {
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
  .command("clean <issue-number>")
  .description("Remove worktree after PR is merged")
  .option("-f, --force", "Force removal even if PR is not merged")
  .option("--keep-branch", "Keep the git branch")
  .option("-v, --verbose", "Verbose output")
  .action(async (issueNumber: string, options) => {
    const result = await cleanCommand({
      issueNumber: Number.parseInt(issueNumber, 10),
      force: options.force,
      keepBranch: options.keepBranch,
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
  .option("-v, --verbose", "Verbose output")
  .action(async (options) => {
    const result = await cleanMergedCommand({
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

// Parse and run
program.parse();
