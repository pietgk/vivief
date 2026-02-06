/**
 * Types for scan-storybook command
 */

import type { A11yViolation } from "@pietgk/browser-core";

/**
 * CLI options for scan-storybook command
 */
export interface ScanStorybookOptions {
  /** Storybook URL (default: http://localhost:6006) */
  url: string;
  /** Number of parallel workers (default: 4) */
  workers: number;
  /** Timeout per story in milliseconds (default: 30000) */
  timeout: number;
  /** WCAG conformance level (default: wcag21aa) */
  wcag: WcagCliLevel;
  /** Filter stories by title pattern */
  filter?: string;
  /** Skip stories with these tags (comma-separated) */
  excludeTags?: string;
  /** Run browser in headed mode */
  headed: boolean;
  /** Output as JSON */
  json: boolean;
  /** Push results to hub (default: true, --no-hub disables) */
  hub: boolean;
  /** Repository ID (auto-detected from git) */
  repoId?: string;
}

/**
 * WCAG levels as CLI options
 */
export type WcagCliLevel = "wcag2a" | "wcag2aa" | "wcag21aa";

/**
 * Entry from Storybook's /index.json
 */
export interface StoryEntry {
  /** Unique story identifier (e.g., "button--primary") */
  id: string;
  /** Story title/path (e.g., "Components/Button") */
  title: string;
  /** Story name (e.g., "Primary") */
  name: string;
  /** Import path to story file (e.g., "./src/Button.stories.tsx") */
  importPath: string;
  /** Story tags (e.g., ["autodocs", "a11y-skip"]) */
  tags: string[];
}

/**
 * Result from scanning a single story
 */
export interface StoryScanResult {
  /** Story identifier */
  storyId: string;
  /** Full story title (title/name) */
  storyTitle: string;
  /** Scan status */
  status: "pass" | "fail" | "error" | "skipped";
  /** Accessibility violations found */
  violations: A11yViolation[];
  /** Time taken to scan in milliseconds */
  timeMs: number;
  /** Error message if status is "error" */
  error?: string;
}

/**
 * Summary of scan results
 */
export interface ScanSummary {
  /** Total stories discovered */
  totalStories: number;
  /** Stories that were scanned */
  scannedStories: number;
  /** Stories skipped due to tags */
  skippedStories: number;
  /** Stories with no violations */
  passedStories: number;
  /** Stories with violations */
  failedStories: number;
  /** Stories that errored during scan */
  errorStories: number;
  /** Total violation count */
  totalViolations: number;
  /** Critical violations */
  criticalCount: number;
  /** Serious violations */
  seriousCount: number;
  /** Moderate violations */
  moderateCount: number;
  /** Minor violations */
  minorCount: number;
  /** Total time in milliseconds */
  totalTimeMs: number;
  /** Top issues by rule ID */
  topIssues: Array<{ ruleId: string; count: number }>;
}

/**
 * Full scan output (for JSON mode)
 */
export interface ScanOutput {
  /** Summary statistics */
  summary: ScanSummary;
  /** Individual story results */
  results: StoryScanResult[];
  /** Hub push result (if hub enabled) */
  hubPush?: {
    pushed: number;
    repoId: string;
  };
}

/**
 * Progress callback for parallel scanning
 */
export type ProgressCallback = (completed: number, total: number, current?: string) => void;
