/**
 * Parallel Scanner
 *
 * Worker pool coordination for scanning multiple stories in parallel
 * using Playwright browser contexts.
 */

import { AxeScanner, type WcagLevel } from "@pietgk/browser-core";
import pLimit from "p-limit";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright";
import { navigateToStory } from "./play-function-runner.js";
import type { ProgressCallback, StoryEntry, StoryScanResult, WcagCliLevel } from "./types.js";

/**
 * Options for parallel scanning
 */
export interface ParallelScanOptions {
  /** Number of parallel workers */
  workers: number;
  /** Timeout per story in milliseconds */
  timeout: number;
  /** WCAG level to check */
  wcag: WcagCliLevel;
  /** Run browser in headed mode */
  headed: boolean;
  /** Base Storybook URL */
  storybookUrl: string;
}

/**
 * Map CLI WCAG level to AxeScanner WcagLevel
 */
function mapWcagLevel(cliLevel: WcagCliLevel): WcagLevel {
  switch (cliLevel) {
    case "wcag2a":
      return "A";
    case "wcag2aa":
    case "wcag21aa":
      return "AA";
    default:
      return "AA";
  }
}

/**
 * Scan a single story
 */
async function scanStory(
  page: Page,
  story: StoryEntry,
  storybookUrl: string,
  timeout: number,
  wcagLevel: WcagLevel
): Promise<StoryScanResult> {
  const startTime = Date.now();
  const storyTitle = `${story.title}/${story.name}`;

  try {
    // Navigate to the story
    await navigateToStory(page, storybookUrl, story.id, { timeout });

    // Run accessibility scan
    const scanner = new AxeScanner(page);
    const result = await scanner.scan({
      wcagLevel,
      contextLabel: story.id,
    });

    const timeMs = Date.now() - startTime;

    return {
      storyId: story.id,
      storyTitle,
      status: result.violations.length > 0 ? "fail" : "pass",
      violations: result.violations,
      timeMs,
    };
  } catch (error) {
    const timeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      storyId: story.id,
      storyTitle,
      status: "error",
      violations: [],
      timeMs,
      error: errorMessage,
    };
  }
}

/**
 * Scan stories in parallel using a worker pool
 *
 * Uses a single browser with multiple pages (not separate processes)
 * for efficient parallel execution.
 *
 * @param stories - Stories to scan
 * @param options - Scanning options
 * @param onProgress - Progress callback
 * @returns Array of scan results
 */
export async function scanStoriesInParallel(
  stories: StoryEntry[],
  options: ParallelScanOptions,
  onProgress?: ProgressCallback
): Promise<StoryScanResult[]> {
  const { workers, timeout, wcag, headed, storybookUrl } = options;
  const wcagLevel = mapWcagLevel(wcag);

  // Launch browser
  const browser: Browser = await chromium.launch({
    headless: !headed,
  });

  // Create a browser context (all pages share cookies, cache, etc.)
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  // Create worker pool with concurrency limit
  const limit = pLimit(workers);

  // Pre-create pages for workers
  const pages: Page[] = [];
  for (let i = 0; i < workers; i++) {
    pages.push(await context.newPage());
  }

  let completed = 0;
  const total = stories.length;

  // Scan all stories in parallel
  const results = await Promise.all(
    stories.map((story, index) =>
      limit(async () => {
        // Get a page from the pool (round-robin)
        const pageIndex = index % workers;
        const page = pages[pageIndex] as Page;

        const result = await scanStory(page, story, storybookUrl, timeout, wcagLevel);

        completed++;
        onProgress?.(completed, total, story.id);

        return result;
      })
    )
  );

  // Cleanup
  await context.close();
  await browser.close();

  return results;
}

/**
 * Calculate summary statistics from scan results
 */
export function calculateSummary(
  results: StoryScanResult[],
  skippedCount: number,
  totalTimeMs: number
): {
  totalStories: number;
  scannedStories: number;
  skippedStories: number;
  passedStories: number;
  failedStories: number;
  errorStories: number;
  totalViolations: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  totalTimeMs: number;
  topIssues: Array<{ ruleId: string; count: number }>;
} {
  const scannedStories = results.length;
  const passedStories = results.filter((r) => r.status === "pass").length;
  const failedStories = results.filter((r) => r.status === "fail").length;
  const errorStories = results.filter((r) => r.status === "error").length;

  // Collect all violations
  const allViolations = results.flatMap((r) => r.violations);
  const totalViolations = allViolations.length;

  // Count by impact
  const criticalCount = allViolations.filter((v) => v.impact === "critical").length;
  const seriousCount = allViolations.filter((v) => v.impact === "serious").length;
  const moderateCount = allViolations.filter((v) => v.impact === "moderate").length;
  const minorCount = allViolations.filter((v) => v.impact === "minor").length;

  // Calculate top issues by rule ID
  const issueCounts = new Map<string, number>();
  for (const violation of allViolations) {
    const count = issueCounts.get(violation.ruleId) || 0;
    issueCounts.set(violation.ruleId, count + 1);
  }

  const topIssues = Array.from(issueCounts.entries())
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalStories: scannedStories + skippedCount,
    scannedStories,
    skippedStories: skippedCount,
    passedStories,
    failedStories,
    errorStories,
    totalViolations,
    criticalCount,
    seriousCount,
    moderateCount,
    minorCount,
    totalTimeMs,
    topIssues,
  };
}
