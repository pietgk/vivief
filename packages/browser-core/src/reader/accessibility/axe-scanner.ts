/**
 * AxeScanner - Runtime accessibility scanning using axe-core
 *
 * Wraps axe-core/playwright for automated accessibility testing.
 * Converts axe-core results to DevAC A11yViolation effects.
 *
 * Part of DevAC Phase 2: Runtime Detection (Issue #235)
 */

import AxeBuilder from "@axe-core/playwright";
import type { AxeResults, NodeResult, Result } from "axe-core";
import type { ElementHandle, Page } from "playwright";

// ============================================================================
// Types
// ============================================================================

/**
 * Impact severity levels (axe-core compatible)
 */
export type AxeImpact = "critical" | "serious" | "moderate" | "minor";

/**
 * WCAG conformance level
 */
export type WcagLevel = "A" | "AA" | "AAA";

/**
 * Platform for accessibility validation
 */
export type A11yPlatform = "web" | "react-native";

/**
 * Detection source for accessibility issues
 */
export type A11yDetectionSource = "static" | "runtime" | "semantic";

/**
 * Accessibility violation from axe-core scan
 */
export interface A11yViolation {
  /** Rule identifier (e.g., "color-contrast", "button-name") */
  ruleId: string;

  /** Human-readable rule description */
  ruleName: string;

  /** Impact severity level */
  impact: AxeImpact;

  /** WCAG success criterion (e.g., "1.4.3", "4.1.2") */
  wcagCriterion: string;

  /** WCAG conformance level */
  wcagLevel: WcagLevel;

  /** How this violation was detected */
  detectionSource: A11yDetectionSource;

  /** Platform this violation applies to */
  platform: A11yPlatform;

  /** Human-readable description of the violation */
  message: string;

  /** HTML snippet of the element with the violation */
  htmlSnippet: string;

  /** CSS selector for the element */
  cssSelector: string;

  /** XPath selector for the element (if available) */
  xpathSelector?: string;

  /** Suggested fix for the violation */
  suggestion?: string;

  /** Help URL for more information */
  helpUrl?: string;

  /** File path (if determinable from source maps) */
  filePath?: string;

  /** Line number (if determinable) */
  line?: number;

  /** Column number (if determinable) */
  column?: number;
}

/**
 * Options for AxeScanner
 */
export interface AxeScanOptions {
  /** Include only these rule IDs */
  includeRules?: string[];

  /** Exclude these rule IDs */
  excludeRules?: string[];

  /** WCAG conformance level to check (default: AA) */
  wcagLevel?: WcagLevel;

  /** Include incomplete results (rules that couldn't be fully evaluated) */
  includeIncomplete?: boolean;

  /** CSS selector to scope the scan (default: whole page) */
  selector?: string;

  /** Context label for the scan (e.g., "after-button-click") */
  contextLabel?: string;

  /** Include passes in the result (default: false) */
  includePasses?: boolean;
}

/**
 * Result from an AxeScanner scan
 */
export interface AxeScanResult {
  /** List of violations found */
  violations: A11yViolation[];

  /** List of passed rules (if includePasses is true) */
  passes?: A11yViolation[];

  /** List of incomplete checks (if includeIncomplete is true) */
  incomplete?: A11yViolation[];

  /** URL that was scanned */
  url: string;

  /** Timestamp of the scan */
  timestamp: string;

  /** Context label for this scan */
  contextLabel?: string;

  /** Time taken in milliseconds */
  timeMs: number;

  /** Total elements checked */
  elementsChecked: number;

  /** Summary statistics */
  summary: {
    violationCount: number;
    passCount: number;
    incompleteCount: number;
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
  };
}

// ============================================================================
// WCAG Mapping Helpers
// ============================================================================

/**
 * Map axe-core tags to WCAG criterion and level
 */
function extractWcagInfo(tags: string[]): { criterion: string; level: WcagLevel } {
  // Default values
  let criterion = "unknown";
  let level: WcagLevel = "A";

  for (const tag of tags) {
    // Match patterns like "wcag2a", "wcag2aa", "wcag21a", "wcag21aa"
    const wcagMatch = tag.match(/wcag2?1?(a+)/i);
    if (wcagMatch?.[1]) {
      const levelStr = wcagMatch[1].toUpperCase();
      if (levelStr === "AAA") level = "AAA";
      else if (levelStr === "AA") level = "AA";
      else level = "A";
    }

    // Match patterns like "wcag111" (1.1.1), "wcag143" (1.4.3)
    const criterionMatch = tag.match(/wcag(\d)(\d)(\d)/);
    if (criterionMatch) {
      criterion = `${criterionMatch[1]}.${criterionMatch[2]}.${criterionMatch[3]}`;
    }
  }

  return { criterion, level };
}

/**
 * Convert axe-core NodeResult to A11yViolation
 */
function nodeResultToViolation(
  rule: Result,
  node: NodeResult,
  platform: A11yPlatform = "web"
): A11yViolation {
  const { criterion, level } = extractWcagInfo(rule.tags);

  // Build suggestion from failureSummary
  let suggestion: string | undefined;
  if (node.failureSummary) {
    // Clean up the failure summary to be more actionable
    suggestion = node.failureSummary
      .replace(/^Fix (any|all) of the following:\s*/i, "")
      .split("\n")
      .filter((line) => line.trim())
      .join(". ");
  }

  return {
    ruleId: rule.id,
    ruleName: rule.help,
    impact: (node.impact ?? rule.impact ?? "moderate") as AxeImpact,
    wcagCriterion: criterion,
    wcagLevel: level,
    detectionSource: "runtime",
    platform,
    message: `${rule.help}: ${rule.description}`,
    htmlSnippet: node.html,
    cssSelector: node.target.join(" "),
    xpathSelector: node.xpath?.join(" "),
    suggestion,
    helpUrl: rule.helpUrl,
  };
}

// ============================================================================
// AxeScanner Class
// ============================================================================

/**
 * AxeScanner - Runtime accessibility scanner using axe-core
 *
 * @example
 * ```typescript
 * const scanner = new AxeScanner(page);
 *
 * // Full page scan
 * const result = await scanner.scan();
 *
 * // Scan after interaction
 * await page.click("#submit-button");
 * const afterClick = await scanner.scan({ contextLabel: "after-submit" });
 *
 * // Scan specific element
 * const modalResult = await scanner.scan({ selector: "[role='dialog']" });
 * ```
 */
export class AxeScanner {
  private readonly page: Page;
  private readonly platform: A11yPlatform;

  constructor(page: Page, platform: A11yPlatform = "web") {
    this.page = page;
    this.platform = platform;
  }

  /**
   * Run an accessibility scan on the page
   */
  async scan(options: AxeScanOptions = {}): Promise<AxeScanResult> {
    const startTime = Date.now();
    const {
      includeRules,
      excludeRules,
      wcagLevel = "AA",
      includeIncomplete = false,
      selector,
      contextLabel,
      includePasses = false,
    } = options;

    // Configure AxeBuilder
    let builder = new AxeBuilder({ page: this.page });

    // Apply WCAG level filter
    const wcagTags = this.getWcagTags(wcagLevel);
    builder = builder.withTags(wcagTags);

    // Apply rule filters
    if (includeRules && includeRules.length > 0) {
      builder = builder.withRules(includeRules);
    }

    if (excludeRules && excludeRules.length > 0) {
      builder = builder.disableRules(excludeRules);
    }

    // Apply selector scope
    if (selector) {
      builder = builder.include(selector);
    }

    // Run the scan
    const results: AxeResults = await builder.analyze();

    // Convert results
    const violations = this.convertResults(results.violations);
    const passes = includePasses ? this.convertResults(results.passes) : undefined;
    const incomplete = includeIncomplete ? this.convertResults(results.incomplete) : undefined;

    // Calculate summary
    const summary = {
      violationCount: violations.length,
      passCount: passes?.length ?? results.passes.length,
      incompleteCount: incomplete?.length ?? results.incomplete.length,
      criticalCount: violations.filter((v) => v.impact === "critical").length,
      seriousCount: violations.filter((v) => v.impact === "serious").length,
      moderateCount: violations.filter((v) => v.impact === "moderate").length,
      minorCount: violations.filter((v) => v.impact === "minor").length,
    };

    return {
      violations,
      passes,
      incomplete,
      url: results.url,
      timestamp: results.timestamp,
      contextLabel,
      timeMs: Date.now() - startTime,
      elementsChecked:
        results.passes.length + results.violations.length + results.incomplete.length,
      summary,
    };
  }

  /**
   * Scan a specific element on the page
   */
  async scanElement(
    element: ElementHandle,
    options: Omit<AxeScanOptions, "selector"> = {}
  ): Promise<AxeScanResult> {
    // Get a unique selector for the element
    const selector = await element.evaluate((el: Element) => {
      // Try to build a unique selector
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) {
        return `[data-testid="${el.getAttribute("data-testid")}"]`;
      }
      // Fallback to tag with index
      const tag = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          return `${tag}:nth-of-type(${index})`;
        }
      }
      return tag;
    });

    return this.scan({ ...options, selector });
  }

  /**
   * Scan after an interaction (e.g., button click, form submit)
   *
   * Waits for any animations or dynamic content to settle before scanning.
   */
  async scanAfterInteraction(
    interactionLabel: string,
    options: AxeScanOptions = {},
    waitMs = 500
  ): Promise<AxeScanResult> {
    // Wait for any animations or dynamic content
    await this.page.waitForTimeout(waitMs);

    // Wait for network to be idle (no pending requests)
    try {
      await this.page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {
      // Timeout is acceptable - some pages never reach networkidle
    }

    return this.scan({
      ...options,
      contextLabel: interactionLabel,
    });
  }

  /**
   * Get WCAG tags for the specified level
   */
  private getWcagTags(level: WcagLevel): string[] {
    switch (level) {
      case "A":
        return ["wcag2a", "wcag21a"];
      case "AA":
        return ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
      case "AAA":
        return ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag21aaa"];
    }
  }

  /**
   * Convert axe-core results to A11yViolation array
   */
  private convertResults(results: Result[]): A11yViolation[] {
    const violations: A11yViolation[] = [];

    for (const rule of results) {
      for (const node of rule.nodes) {
        violations.push(nodeResultToViolation(rule, node, this.platform));
      }
    }

    return violations;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AxeScanner instance
 */
export function createAxeScanner(page: Page, platform: A11yPlatform = "web"): AxeScanner {
  return new AxeScanner(page, platform);
}

/**
 * Quick scan a page for accessibility violations
 */
export async function quickScan(
  page: Page,
  options: AxeScanOptions = {}
): Promise<A11yViolation[]> {
  const scanner = createAxeScanner(page);
  const result = await scanner.scan(options);
  return result.violations;
}
