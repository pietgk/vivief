/**
 * Recovery Prompt Utilities
 *
 * Interactive prompts for fixing health check issues in the DevAC CLI.
 */

import * as readline from "node:readline";
import type { HealthIssue } from "@pietgk/devac-core";
import { colors } from "./colors.js";

/**
 * Create a simple prompt for user input
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Display health issues and prompt user for recovery
 *
 * @param issues - List of detected health issues
 * @returns true if user wants to apply fixes, false otherwise
 */
export async function promptForRecovery(issues: HealthIssue[]): Promise<boolean> {
  console.error("");
  console.error(colors.yellow("! DevAC Health Check Failed"));
  console.error("");

  console.error("Issues detected:");
  for (const issue of issues) {
    console.error(`  ${colors.red("*")} ${issue.message}`);
  }

  console.error("");
  console.error("Proposed fix:");
  issues.forEach((issue, i) => {
    console.error(`  ${i + 1}. ${issue.fix.description}`);
  });

  console.error("");
  const answer = await prompt(`Apply fix? [${colors.bold("Y")}/n]: `);
  return answer.toLowerCase() !== "n";
}

/**
 * Apply fixes for all detected issues with progress output
 *
 * @param issues - List of issues to fix
 */
export async function applyFixesWithProgress(issues: HealthIssue[]): Promise<void> {
  for (const issue of issues) {
    try {
      await issue.fix.execute();
      console.error(`${colors.green("+")} ${issue.fix.description}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${colors.red("x")} Failed: ${issue.fix.description} - ${message}`);
    }
  }
  console.error("");
}

/**
 * Display a warning about issues when running in non-interactive mode
 *
 * @param issues - List of detected issues
 */
export function warnNonInteractive(issues: HealthIssue[]): void {
  console.error("");
  console.error(colors.yellow("! DevAC Health Check Warning"));
  console.error("");

  console.error("Issues detected (non-interactive mode, cannot prompt for fix):");
  for (const issue of issues) {
    console.error(`  ${colors.dim("*")} ${issue.message}`);
  }

  console.error("");
  console.error(
    colors.dim("Hint: Run with --heal to auto-fix, or run interactively to be prompted")
  );
  console.error("");
}
