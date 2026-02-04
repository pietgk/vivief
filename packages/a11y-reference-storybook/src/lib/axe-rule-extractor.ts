/**
 * Axe-Core Rule Metadata Extractor
 *
 * Extracts rule metadata from axe-core using its API.
 * Used to generate reference stories for each accessibility rule.
 */

import axe from "axe-core";

/**
 * Extracted metadata for an axe-core rule
 */
export interface AxeRuleMetadata {
  /** Unique rule identifier (e.g., "image-alt") */
  ruleId: string;
  /** Human-readable description */
  description: string;
  /** Short help text for the rule */
  help: string;
  /** URL to Deque University documentation */
  helpUrl: string;
  /** Tags including WCAG criteria (e.g., ["wcag2a", "wcag111"]) */
  tags: string[];
  /** Impact level when rule fails */
  impact: "critical" | "serious" | "moderate" | "minor";
  /** Extracted WCAG criteria (e.g., ["1.1.1", "2.1.1"]) */
  wcagCriteria: string[];
  /** WCAG conformance level */
  wcagLevel: "A" | "AA" | "AAA" | null;
  /** Category: whether rule can fire in component-level context */
  category: "component" | "page";
  /** Whether the rule is enabled by default */
  enabled: boolean;
}

/**
 * Summary of extracted rules
 */
export interface ExtractionSummary {
  /** Total number of rules extracted */
  totalRules: number;
  /** Number of component-level rules */
  componentLevel: number;
  /** Number of page-level rules */
  pageLevel: number;
  /** Rules grouped by impact */
  byImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  /** Rules grouped by WCAG level */
  byWcagLevel: {
    A: number;
    AA: number;
    AAA: number;
    other: number;
  };
  /** axe-core version used */
  axeCoreVersion: string;
}

/**
 * Page-level rules that require full document context.
 * These rules check document-level properties that won't fire in a Storybook story.
 */
const PAGE_LEVEL_RULES = new Set([
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "landmark-one-main",
  "bypass",
  "page-has-heading-one",
  "meta-viewport",
  "meta-refresh",
  "valid-lang",
  "frame-tested",
  "landmark-unique",
  "skip-link",
]);

/**
 * Extract WCAG criteria from tags (e.g., "wcag111" -> "1.1.1")
 */
function extractWcagCriteria(tags: string[]): string[] {
  const criteria: string[] = [];

  for (const tag of tags) {
    // Match patterns like "wcag111", "wcag241", "wcag143"
    const match = tag.match(/^wcag(\d)(\d)(\d+)?$/);
    if (match) {
      const [, level, section, criterion] = match;
      if (criterion) {
        criteria.push(`${level}.${section}.${criterion}`);
      } else {
        // For tags like "wcag21" without criterion
        criteria.push(`${level}.${section}`);
      }
    }
  }

  return [...new Set(criteria)].sort();
}

/**
 * Determine WCAG level from tags
 */
function determineWcagLevel(tags: string[]): "A" | "AA" | "AAA" | null {
  // Check in order of strictness (AAA > AA > A)
  if (tags.includes("wcag2aaa") || tags.includes("wcag21aaa")) {
    return "AAA";
  }
  if (tags.includes("wcag2aa") || tags.includes("wcag21aa") || tags.includes("wcag22aa")) {
    return "AA";
  }
  if (tags.includes("wcag2a") || tags.includes("wcag21a") || tags.includes("wcag22a")) {
    return "A";
  }
  // Check for ACT rules
  if (tags.includes("ACT")) {
    // ACT rules are typically A or AA
    return "A";
  }
  return null;
}

/**
 * Determine if a rule is component-level or page-level
 */
function determineCategory(ruleId: string, tags: string[]): "component" | "page" {
  if (PAGE_LEVEL_RULES.has(ruleId)) {
    return "page";
  }

  // Rules that check landmarks at document level
  if (tags.includes("cat.structure") && ruleId.startsWith("landmark-")) {
    // Some landmark rules can fire at component level
    if (
      ruleId === "landmark-banner-is-top-level" ||
      ruleId === "landmark-contentinfo-is-top-level" ||
      ruleId === "landmark-main-is-top-level" ||
      ruleId === "landmark-complementary-is-top-level"
    ) {
      return "component";
    }
    // Others are page-level
    if (ruleId === "landmark-one-main" || ruleId === "landmark-unique") {
      return "page";
    }
  }

  return "component";
}

/**
 * Impact levels for known rules based on axe-core documentation
 * Rules not in this list default to "moderate"
 */
const RULE_IMPACT_MAP: Record<string, AxeRuleMetadata["impact"]> = {
  // Critical impact - blocks access
  "image-alt": "critical",
  "button-name": "critical",
  "link-name": "serious",
  label: "critical",
  "input-image-alt": "critical",
  "aria-hidden-focus": "serious",
  "aria-required-children": "critical",
  "aria-required-parent": "critical",
  "color-contrast": "serious",
  "document-title": "serious",
  "duplicate-id": "minor",
  "duplicate-id-active": "serious",
  "empty-heading": "minor",
  "frame-title": "serious",
  "html-has-lang": "serious",
  "input-button-name": "critical",
  "meta-viewport": "critical",
  "object-alt": "serious",
  "select-name": "critical",
  "svg-img-alt": "serious",
  "td-headers-attr": "serious",
  "th-has-data-cells": "serious",
  "video-caption": "critical",
  // Default to moderate for rules not explicitly listed
};

/**
 * Get impact for a rule based on known impacts or default
 */
function getImpact(ruleId: string): AxeRuleMetadata["impact"] {
  return RULE_IMPACT_MAP[ruleId] ?? "moderate";
}

/**
 * Extract metadata for all axe-core rules
 */
export function extractAllRules(): AxeRuleMetadata[] {
  // Get all rules from axe-core
  const rules = axe.getRules();

  return rules.map((rule) => {
    const tags = rule.tags || [];

    return {
      ruleId: rule.ruleId,
      description: rule.description || "",
      help: rule.help || "",
      helpUrl: rule.helpUrl || "",
      tags,
      impact: getImpact(rule.ruleId),
      wcagCriteria: extractWcagCriteria(tags),
      wcagLevel: determineWcagLevel(tags),
      category: determineCategory(rule.ruleId, tags),
      enabled: true, // All rules are enabled by default in axe-core
    };
  });
}

/**
 * Extract rules filtered by WCAG levels
 *
 * @param levels - Array of WCAG levels to include (e.g., ["wcag2a", "wcag2aa"])
 */
export function extractRulesByLevel(levels: string[]): AxeRuleMetadata[] {
  const allRules = extractAllRules();

  if (levels.length === 0) {
    return allRules;
  }

  return allRules.filter((rule) => rule.tags.some((tag) => levels.includes(tag)));
}

/**
 * Extract only component-level rules (suitable for Storybook testing)
 */
export function extractComponentRules(): AxeRuleMetadata[] {
  return extractAllRules().filter((rule) => rule.category === "component");
}

/**
 * Extract only page-level rules
 */
export function extractPageRules(): AxeRuleMetadata[] {
  return extractAllRules().filter((rule) => rule.category === "page");
}

/**
 * Get a summary of extracted rules
 */
export function getExtractionSummary(rules?: AxeRuleMetadata[]): ExtractionSummary {
  const allRules = rules ?? extractAllRules();

  const summary: ExtractionSummary = {
    totalRules: allRules.length,
    componentLevel: allRules.filter((r) => r.category === "component").length,
    pageLevel: allRules.filter((r) => r.category === "page").length,
    byImpact: {
      critical: allRules.filter((r) => r.impact === "critical").length,
      serious: allRules.filter((r) => r.impact === "serious").length,
      moderate: allRules.filter((r) => r.impact === "moderate").length,
      minor: allRules.filter((r) => r.impact === "minor").length,
    },
    byWcagLevel: {
      A: allRules.filter((r) => r.wcagLevel === "A").length,
      AA: allRules.filter((r) => r.wcagLevel === "AA").length,
      AAA: allRules.filter((r) => r.wcagLevel === "AAA").length,
      other: allRules.filter((r) => r.wcagLevel === null).length,
    },
    axeCoreVersion: axe.version,
  };

  return summary;
}

/**
 * Get axe-core version
 */
export function getAxeCoreVersion(): string {
  return axe.version;
}

/**
 * Find a rule by ID
 */
export function findRuleById(ruleId: string): AxeRuleMetadata | undefined {
  return extractAllRules().find((rule) => rule.ruleId === ruleId);
}

/**
 * Find rules by WCAG criterion (e.g., "1.1.1")
 */
export function findRulesByCriterion(criterion: string): AxeRuleMetadata[] {
  return extractAllRules().filter((rule) => rule.wcagCriteria.includes(criterion));
}
