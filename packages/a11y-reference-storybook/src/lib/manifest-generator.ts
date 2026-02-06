/**
 * Manifest Generator
 *
 * Generates the a11y-rule-manifest.json file that maps all rules
 * to their generated stories and expected results.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AxeRuleMetadata } from "./axe-rule-extractor.js";
import { getAxeCoreVersion } from "./axe-rule-extractor.js";
import type { GeneratedStory } from "./story-generator.js";

/**
 * Rule entry in the manifest
 */
export interface ManifestRuleEntry {
  /** Rule ID */
  ruleId: string;
  /** Human-readable description */
  description: string;
  /** WCAG criteria this rule checks */
  wcag: string[];
  /** Impact level */
  impact: "critical" | "serious" | "moderate" | "minor";
  /** URL to Deque documentation */
  helpUrl: string;
  /** Category: component or page level */
  category: "component" | "page";
  /** Generated story names */
  stories: {
    /** Stories that should trigger violations */
    violations: string[];
    /** Stories that should pass */
    passes: string[];
  };
  /** Fix example if available */
  fixExample?: {
    before: string;
    after: string;
    explanation: string;
  };
}

/**
 * Summary statistics
 */
export interface ManifestSummary {
  /** Total number of rules in manifest */
  totalRules: number;
  /** Number of component-level rules */
  componentLevel: number;
  /** Number of page-level rules */
  pageLevel: number;
  /** Total number of stories generated */
  storiesGenerated: number;
  /** Number of violation stories */
  violationStories: number;
  /** Number of pass stories */
  passStories: number;
}

/**
 * The full manifest structure
 */
export interface A11yRuleManifest {
  /** ISO timestamp of generation */
  generatedAt: string;
  /** Version of axe-core used */
  axeCoreVersion: string;
  /** All rules with their stories */
  rules: ManifestRuleEntry[];
  /** Summary statistics */
  summary: ManifestSummary;
}

/**
 * Generate violation and pass story names from GeneratedStory
 */
function getStoryNames(story: GeneratedStory): { violations: string[]; passes: string[] } {
  const violations: string[] = [];
  const passes: string[] = [];

  // Generate story names based on counts
  if (story.violationCount === 1) {
    violations.push("Violation");
  } else {
    for (let i = 1; i <= story.violationCount; i++) {
      violations.push(`Violation${i}`);
    }
  }

  if (story.passCount === 1) {
    passes.push("Pass");
  } else {
    for (let i = 1; i <= story.passCount; i++) {
      passes.push(`Pass${i}`);
    }
  }

  return { violations, passes };
}

/**
 * Generate manifest from rules and generated stories
 */
export function generateManifest(
  rules: AxeRuleMetadata[],
  stories: GeneratedStory[]
): A11yRuleManifest {
  // Create a map of stories by rule ID
  const storyMap = new Map<string, GeneratedStory>();
  for (const story of stories) {
    storyMap.set(story.ruleId, story);
  }

  // Build rule entries
  const ruleEntries: ManifestRuleEntry[] = [];
  let totalViolations = 0;
  let totalPasses = 0;
  let componentCount = 0;
  let pageCount = 0;

  for (const rule of rules) {
    const story = storyMap.get(rule.ruleId);
    const storyNames = story ? getStoryNames(story) : { violations: [], passes: [] };

    totalViolations += storyNames.violations.length;
    totalPasses += storyNames.passes.length;

    if (rule.category === "component") {
      componentCount++;
    } else {
      pageCount++;
    }

    ruleEntries.push({
      ruleId: rule.ruleId,
      description: rule.description,
      wcag: rule.wcagCriteria,
      impact: rule.impact,
      helpUrl: rule.helpUrl,
      category: rule.category,
      stories: storyNames,
    });
  }

  // Sort rules by ID
  ruleEntries.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  // Build manifest
  const manifest: A11yRuleManifest = {
    generatedAt: new Date().toISOString(),
    axeCoreVersion: getAxeCoreVersion(),
    rules: ruleEntries,
    summary: {
      totalRules: rules.length,
      componentLevel: componentCount,
      pageLevel: pageCount,
      storiesGenerated: totalViolations + totalPasses,
      violationStories: totalViolations,
      passStories: totalPasses,
    },
  };

  return manifest;
}

/**
 * Write manifest to file
 */
export function writeManifest(manifest: A11yRuleManifest, outputPath: string): void {
  const content = JSON.stringify(manifest, null, 2);
  writeFileSync(outputPath, content);
}

/**
 * Generate and write manifest in one step
 */
export function generateAndWriteManifest(
  rules: AxeRuleMetadata[],
  stories: GeneratedStory[],
  outputDir: string
): A11yRuleManifest {
  const manifest = generateManifest(rules, stories);
  const outputPath = join(outputDir, "a11y-rule-manifest.json");
  writeManifest(manifest, outputPath);
  return manifest;
}

/**
 * Format manifest summary for console output
 */
export function formatManifestSummary(manifest: A11yRuleManifest): string {
  const lines = [
    "A11y Reference Manifest Generated",
    "=================================",
    `Generated at: ${manifest.generatedAt}`,
    `axe-core version: ${manifest.axeCoreVersion}`,
    "",
    "Summary:",
    `  Total rules: ${manifest.summary.totalRules}`,
    `  Component-level: ${manifest.summary.componentLevel}`,
    `  Page-level: ${manifest.summary.pageLevel}`,
    "",
    "Stories:",
    `  Total: ${manifest.summary.storiesGenerated}`,
    `  Violations: ${manifest.summary.violationStories}`,
    `  Passes: ${manifest.summary.passStories}`,
  ];

  return lines.join("\n");
}
