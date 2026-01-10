/**
 * Gap Metrics Calculator
 *
 * Computes gap metrics between validated architecture (goal) and
 * generated architecture (output) to measure improvement loop progress.
 *
 * Metrics defined in docs/plans/gap-metrics.md:
 * - Container F1: Container mapping accuracy
 * - Signal-to-noise: Component significance filtering
 * - Relationship F1: Relationship capture accuracy
 * - External F1: External system recognition
 * - Composite Score: Weighted combination
 *
 * Enhanced with grouping and significance rule analysis (v0.24).
 *
 * @see docs/plans/gap-metrics.md
 */

import type { GroupingRule } from "../rules/grouping-rules.js";
import type { SignificanceRule } from "../rules/significance-rules.js";
import type { LikeC4Relationship, ParsedC4Model } from "./likec4-json-parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * F1 score calculation result
 */
export interface F1Score {
  /** Precision: correct / predicted */
  precision: number;
  /** Recall: correct / actual */
  recall: number;
  /** F1: harmonic mean of precision and recall */
  f1: number;
  /** True positives (matched items) */
  truePositives: number;
  /** False positives (predicted but not actual) */
  falsePositives: number;
  /** False negatives (actual but not predicted) */
  falseNegatives: number;
}

/**
 * Gap metric result for a specific category
 */
export interface GapMetric {
  /** Metric name */
  name: string;
  /** Calculated score (0-1) */
  score: number;
  /** Human-readable explanation */
  explanation: string;
  /** Detailed breakdown */
  details: {
    /** Items in validated but not generated (gaps) */
    missing: string[];
    /** Items in generated but not validated (noise) */
    extra: string[];
    /** Items matched */
    matched: string[];
  };
}

/**
 * Full gap analysis result
 */
export interface GapAnalysis {
  /** Container mapping F1 */
  containerF1: GapMetric;
  /** Signal-to-noise ratio for components */
  signalToNoise: GapMetric;
  /** Relationship capture F1 */
  relationshipF1: GapMetric;
  /** External system recognition F1 */
  externalF1: GapMetric;
  /** Weighted composite score */
  compositeScore: number;
  /** Summary for display */
  summary: string;
  /** Rule analysis results (if rules provided) */
  ruleAnalysis?: RuleAnalysisResult;
}

/**
 * Target thresholds for gap metrics
 */
export interface GapTargets {
  containerF1: number;
  signalToNoise: number;
  relationshipF1: number;
  externalF1: number;
  composite: number;
}

/**
 * Default target thresholds (from issue #161)
 */
export const DEFAULT_GAP_TARGETS: GapTargets = {
  containerF1: 0.7,
  signalToNoise: 0.5,
  relationshipF1: 0.6,
  externalF1: 0.7,
  composite: 0.65,
};

/**
 * Rule analysis result for grouping and significance
 */
export interface RuleAnalysisResult {
  /** Grouping rules analysis */
  grouping: {
    /** Total containers identified by rules */
    containersIdentified: number;
    /** Container coverage by layer */
    layerCoverage: Map<string, number>;
    /** Rules that matched */
    matchedRules: string[];
    /** Unmatched items (not assigned to any container) */
    unmatched: number;
  };
  /** Significance rules analysis */
  significance: {
    /** Effects by significance level */
    byLevel: {
      critical: number;
      important: number;
      minor: number;
      hidden: number;
    };
    /** Rules that matched */
    matchedRules: string[];
    /** Filtering ratio (hidden / total) */
    filteringRatio: number;
  };
}

/**
 * Options for gap analysis
 */
export interface GapAnalysisOptions {
  /** Custom targets to compare against */
  targets?: Partial<GapTargets>;
  /** Grouping rules to analyze */
  groupingRules?: GroupingRule[];
  /** Significance rules to analyze */
  significanceRules?: SignificanceRule[];
  /** Show verbose output */
  verbose?: boolean;
}

// =============================================================================
// Weights (from gap-metrics.md)
// =============================================================================

const WEIGHTS = {
  containerF1: 0.25,
  signalToNoise: 0.2,
  keyCoverage: 0.25, // Combined with signalToNoise for simplicity
  relationshipF1: 0.15,
  externalF1: 0.15,
};

// =============================================================================
// Core F1 Calculation
// =============================================================================

/**
 * Calculate F1 score between two sets of items
 *
 * @param actual - Items that should be present (ground truth)
 * @param predicted - Items that were generated
 * @returns F1 score with breakdown
 */
export function calculateF1(actual: Set<string>, predicted: Set<string>): F1Score {
  const truePositives = [...actual].filter((item) => predicted.has(item)).length;
  const falsePositives = [...predicted].filter((item) => !actual.has(item)).length;
  const falseNegatives = [...actual].filter((item) => !predicted.has(item)).length;

  const precision =
    truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall =
    truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    falseNegatives,
  };
}

// =============================================================================
// Container Metrics
// =============================================================================

/**
 * Normalize container name for fuzzy matching
 * Handles cases like "Analysis Layer" vs "AnalysisLayer" vs "analysis_layer"
 */
function normalizeContainerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, "")
    .replace(/layer$/i, "");
}

/**
 * Calculate container mapping F1 score
 *
 * Compares containers in validated (goal) vs generated (output)
 * Uses fuzzy matching on container names/titles
 *
 * @param validated - Human-validated architecture (goal)
 * @param generated - Machine-generated architecture (output)
 * @returns Gap metric for containers
 */
export function calculateContainerF1(
  validated: ParsedC4Model,
  generated: ParsedC4Model
): GapMetric {
  // Extract container identifiers (use title for matching)
  const validatedContainers = new Set<string>();
  const validatedNames = new Map<string, string>(); // normalized -> original

  for (const container of validated.containers.values()) {
    const normalized = normalizeContainerName(container.title || container.id);
    validatedContainers.add(normalized);
    validatedNames.set(normalized, container.title || container.id);
  }

  const generatedContainers = new Set<string>();
  const generatedNames = new Map<string, string>();

  for (const container of generated.containers.values()) {
    const normalized = normalizeContainerName(container.title || container.id);
    generatedContainers.add(normalized);
    generatedNames.set(normalized, container.title || container.id);
  }

  const f1Result = calculateF1(validatedContainers, generatedContainers);

  // Build detailed breakdown
  const missing = [...validatedContainers]
    .filter((c) => !generatedContainers.has(c))
    .map((c) => validatedNames.get(c) ?? c);

  const extra = [...generatedContainers]
    .filter((c) => !validatedContainers.has(c))
    .map((c) => generatedNames.get(c) ?? c);

  const matched = [...validatedContainers]
    .filter((c) => generatedContainers.has(c))
    .map((c) => validatedNames.get(c) ?? c);

  return {
    name: "Container F1",
    score: f1Result.f1,
    explanation: `${f1Result.truePositives}/${validated.containers.size} containers matched, ${f1Result.falsePositives} extra generated`,
    details: { missing, extra, matched },
  };
}

// =============================================================================
// Signal-to-Noise Metrics
// =============================================================================

/**
 * Calculate signal-to-noise ratio for components
 *
 * Measures how well the generator filters to significant components
 * vs including implementation details
 *
 * @param validated - Human-validated architecture (contains significant components)
 * @param generated - Machine-generated architecture (may include noise)
 * @returns Gap metric for signal-to-noise
 */
export function calculateSignalToNoise(
  validated: ParsedC4Model,
  generated: ParsedC4Model
): GapMetric {
  const validatedCount = validated.components.size;
  const generatedCount = generated.components.size;

  // If validated has N components and generated has M:
  // - If M >> N, too much noise
  // - If M << N, missing components
  // Ideal: M ≈ N (within 50%)

  let score: number;
  let explanation: string;

  if (generatedCount === 0) {
    score = 0;
    explanation = "No components generated";
  } else if (validatedCount === 0) {
    score = generatedCount > 0 ? 0.5 : 1;
    explanation = "No components in validated model";
  } else {
    const ratio = generatedCount / validatedCount;
    if (ratio >= 0.5 && ratio <= 2.0) {
      // Good range: roughly similar count
      score = 1 - Math.abs(1 - ratio) * 0.5;
    } else if (ratio > 2.0) {
      // Too many generated (noise)
      score = Math.max(0, 1 - (ratio - 2) * 0.2);
    } else {
      // Too few generated (missing)
      score = ratio;
    }
    explanation = `${generatedCount} components generated vs ${validatedCount} validated (ratio: ${ratio.toFixed(2)})`;
  }

  // Try to match components by name
  const validatedNames = new Set<string>();
  for (const c of validated.components.values()) {
    validatedNames.add(normalizeContainerName(c.title || c.id));
  }

  const generatedNames = new Set<string>();
  for (const c of generated.components.values()) {
    generatedNames.add(normalizeContainerName(c.title || c.id));
  }

  const matched = [...validatedNames].filter((n) => generatedNames.has(n));
  const missing = [...validatedNames].filter((n) => !generatedNames.has(n));
  const extra = [...generatedNames].filter((n) => !validatedNames.has(n));

  return {
    name: "Signal-to-Noise",
    score: Math.max(0, Math.min(1, score)),
    explanation,
    details: {
      missing,
      extra: extra.slice(0, 10), // Limit noise list
      matched,
    },
  };
}

// =============================================================================
// Relationship Metrics
// =============================================================================

/**
 * Create a normalized relationship key for matching
 */
function relationshipKey(rel: LikeC4Relationship): string {
  // Normalize source and target to last segment
  const source = rel.source.split(".").pop() ?? rel.source;
  const target = rel.target.split(".").pop() ?? rel.target;
  return `${source}->${target}`.toLowerCase();
}

/**
 * Calculate relationship capture F1 score
 *
 * @param validated - Human-validated architecture
 * @param generated - Machine-generated architecture
 * @returns Gap metric for relationships
 */
export function calculateRelationshipF1(
  validated: ParsedC4Model,
  generated: ParsedC4Model
): GapMetric {
  const validatedRels = new Set<string>();
  const validatedLabels = new Map<string, string>();

  for (const rels of validated.relationshipsBySource.values()) {
    for (const rel of rels) {
      const key = relationshipKey(rel);
      validatedRels.add(key);
      validatedLabels.set(key, `${rel.source} -> ${rel.target}`);
    }
  }

  const generatedRels = new Set<string>();
  const generatedLabels = new Map<string, string>();

  for (const rels of generated.relationshipsBySource.values()) {
    for (const rel of rels) {
      const key = relationshipKey(rel);
      generatedRels.add(key);
      generatedLabels.set(key, `${rel.source} -> ${rel.target}`);
    }
  }

  const f1Result = calculateF1(validatedRels, generatedRels);

  const missing = [...validatedRels]
    .filter((r) => !generatedRels.has(r))
    .map((r) => validatedLabels.get(r) ?? r);

  const extra = [...generatedRels]
    .filter((r) => !validatedRels.has(r))
    .map((r) => generatedLabels.get(r) ?? r)
    .slice(0, 10); // Limit

  const matched = [...validatedRels]
    .filter((r) => generatedRels.has(r))
    .map((r) => validatedLabels.get(r) ?? r);

  return {
    name: "Relationship F1",
    score: f1Result.f1,
    explanation: `${f1Result.truePositives}/${validatedRels.size} relationships matched`,
    details: { missing, extra, matched },
  };
}

// =============================================================================
// External System Metrics
// =============================================================================

/**
 * Calculate external system recognition F1 score
 *
 * @param validated - Human-validated architecture
 * @param generated - Machine-generated architecture
 * @returns Gap metric for external systems
 */
export function calculateExternalF1(validated: ParsedC4Model, generated: ParsedC4Model): GapMetric {
  const validatedExternals = new Set<string>();
  const validatedNames = new Map<string, string>();

  for (const ext of validated.externals.values()) {
    const normalized = normalizeContainerName(ext.title || ext.id);
    validatedExternals.add(normalized);
    validatedNames.set(normalized, ext.title || ext.id);
  }

  const generatedExternals = new Set<string>();
  const generatedNames = new Map<string, string>();

  for (const ext of generated.externals.values()) {
    const normalized = normalizeContainerName(ext.title || ext.id);
    generatedExternals.add(normalized);
    generatedNames.set(normalized, ext.title || ext.id);
  }

  const f1Result = calculateF1(validatedExternals, generatedExternals);

  const missing = [...validatedExternals]
    .filter((e) => !generatedExternals.has(e))
    .map((e) => validatedNames.get(e) ?? e);

  const extra = [...generatedExternals]
    .filter((e) => !validatedExternals.has(e))
    .map((e) => generatedNames.get(e) ?? e);

  const matched = [...validatedExternals]
    .filter((e) => generatedExternals.has(e))
    .map((e) => validatedNames.get(e) ?? e);

  return {
    name: "External F1",
    score: f1Result.f1,
    explanation: `${f1Result.truePositives}/${validatedExternals.size} external systems matched`,
    details: { missing, extra, matched },
  };
}

// =============================================================================
// Full Gap Analysis
// =============================================================================

/**
 * Perform full gap analysis between validated and generated architectures
 *
 * @param validated - Human-validated architecture (goal)
 * @param generated - Machine-generated architecture (output)
 * @param options - Analysis options including targets and rules
 * @returns Complete gap analysis with composite score
 */
export function analyzeGap(
  validated: ParsedC4Model,
  generated: ParsedC4Model,
  options?: GapAnalysisOptions
): GapAnalysis {
  const containerF1 = calculateContainerF1(validated, generated);
  const signalToNoise = calculateSignalToNoise(validated, generated);
  const relationshipF1 = calculateRelationshipF1(validated, generated);
  const externalF1 = calculateExternalF1(validated, generated);

  // Calculate composite score
  const compositeScore =
    WEIGHTS.containerF1 * containerF1.score +
    (WEIGHTS.signalToNoise + WEIGHTS.keyCoverage) * signalToNoise.score +
    WEIGHTS.relationshipF1 * relationshipF1.score +
    WEIGHTS.externalF1 * externalF1.score;

  // Analyze rules if provided
  let ruleAnalysis: RuleAnalysisResult | undefined;
  if (options?.groupingRules || options?.significanceRules) {
    ruleAnalysis = analyzeRules(generated, options.groupingRules, options.significanceRules);
  }

  // Get targets for summary
  const targets = { ...DEFAULT_GAP_TARGETS, ...options?.targets };

  // Generate summary with target comparisons
  const summary = [
    `Gap Score: ${(compositeScore * 100).toFixed(1)}% (target: ${(targets.composite * 100).toFixed(0)}%)`,
    "",
    "Breakdown:",
    `  Container F1: ${(containerF1.score * 100).toFixed(1)}% ${getTargetIndicator(containerF1.score, targets.containerF1)} - ${containerF1.explanation}`,
    `  Signal/Noise: ${(signalToNoise.score * 100).toFixed(1)}% ${getTargetIndicator(signalToNoise.score, targets.signalToNoise)} - ${signalToNoise.explanation}`,
    `  Relationship F1: ${(relationshipF1.score * 100).toFixed(1)}% ${getTargetIndicator(relationshipF1.score, targets.relationshipF1)} - ${relationshipF1.explanation}`,
    `  External F1: ${(externalF1.score * 100).toFixed(1)}% ${getTargetIndicator(externalF1.score, targets.externalF1)} - ${externalF1.explanation}`,
    "",
    containerF1.details.missing.length > 0
      ? `Missing containers: ${containerF1.details.missing.join(", ")}`
      : "All containers matched",
    containerF1.details.extra.length > 0
      ? `Extra containers: ${containerF1.details.extra.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    containerF1,
    signalToNoise,
    relationshipF1,
    externalF1,
    compositeScore,
    summary,
    ruleAnalysis,
  };
}

/**
 * Get target indicator for a metric
 */
function getTargetIndicator(score: number, target: number): string {
  if (score >= target) {
    return `(target: ${(target * 100).toFixed(0)}% ✓)`;
  }
  const gap = target - score;
  return `(target: ${(target * 100).toFixed(0)}%, gap: ${(gap * 100).toFixed(1)}%)`;
}

/**
 * Analyze grouping and significance rules against generated model
 */
function analyzeRules(
  generated: ParsedC4Model,
  groupingRules?: GroupingRule[],
  significanceRules?: SignificanceRule[]
): RuleAnalysisResult {
  // Analyze grouping rules
  const layerCoverage = new Map<string, number>();
  const matchedGroupingRules = new Set<string>();
  let containersIdentified = 0;
  let unmatched = 0;

  if (groupingRules && groupingRules.length > 0) {
    // Check which containers could be identified by grouping rules
    for (const container of generated.containers.values()) {
      const containerName = container.title || container.id;
      let matched = false;

      for (const rule of groupingRules) {
        if (matchesGroupingRule(containerName, rule)) {
          matchedGroupingRules.add(rule.id);
          matched = true;
          containersIdentified++;

          if (rule.emit.container) {
            const current = layerCoverage.get(rule.emit.container) ?? 0;
            layerCoverage.set(rule.emit.container, current + 1);
          }
          break;
        }
      }

      if (!matched) {
        unmatched++;
      }
    }
  }

  // Analyze significance rules (simulated based on component count)
  const totalComponents = generated.components.size;
  const byLevel = {
    critical: 0,
    important: 0,
    minor: 0,
    hidden: 0,
  };
  const matchedSignificanceRules = new Set<string>();

  if (significanceRules && significanceRules.length > 0) {
    // Distribute components across significance levels based on rules
    // This is a heuristic since we don't have actual effect data here
    for (const component of generated.components.values()) {
      const componentName = component.title || component.id;
      let assigned = false;

      for (const rule of significanceRules) {
        if (matchesSignificanceRule(componentName, rule)) {
          matchedSignificanceRules.add(rule.id);
          byLevel[rule.emit.level]++;
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        byLevel.minor++; // Default to minor if no rule matches
      }
    }
  } else {
    // Default distribution if no rules provided
    byLevel.minor = totalComponents;
  }

  const total = byLevel.critical + byLevel.important + byLevel.minor + byLevel.hidden;
  const filteringRatio = total > 0 ? byLevel.hidden / total : 0;

  return {
    grouping: {
      containersIdentified,
      layerCoverage,
      matchedRules: [...matchedGroupingRules],
      unmatched,
    },
    significance: {
      byLevel,
      matchedRules: [...matchedSignificanceRules],
      filteringRatio,
    },
  };
}

/**
 * Check if a container name matches a grouping rule
 */
function matchesGroupingRule(containerName: string, rule: GroupingRule): boolean {
  const lowerName = containerName.toLowerCase();

  // Check file path pattern
  if (rule.match.filePath) {
    if (typeof rule.match.filePath === "string") {
      if (lowerName.includes(rule.match.filePath.toLowerCase())) {
        return true;
      }
    } else if (rule.match.filePath.test(containerName)) {
      return true;
    }
  }

  // Check entity name pattern
  if (rule.match.entityName) {
    if (typeof rule.match.entityName === "string") {
      if (lowerName.includes(rule.match.entityName.toLowerCase())) {
        return true;
      }
    } else if (rule.match.entityName.test(containerName)) {
      return true;
    }
  }

  // Check domain
  if (rule.match.domain) {
    const domains = Array.isArray(rule.match.domain) ? rule.match.domain : [rule.match.domain];
    for (const domain of domains) {
      if (lowerName.includes(domain.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a component name matches a significance rule
 */
function matchesSignificanceRule(componentName: string, rule: SignificanceRule): boolean {
  const lowerName = componentName.toLowerCase();

  // Check entity name pattern
  if (rule.match.entityName) {
    if (typeof rule.match.entityName === "string") {
      if (lowerName.includes(rule.match.entityName.toLowerCase())) {
        return true;
      }
    } else if (rule.match.entityName.test(componentName)) {
      return true;
    }
  }

  // Check domain
  if (rule.match.domain) {
    const domains = Array.isArray(rule.match.domain) ? rule.match.domain : [rule.match.domain];
    for (const domain of domains) {
      if (lowerName.includes(domain.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Format gap analysis for terminal output
 */
export function formatGapAnalysis(
  analysis: GapAnalysis,
  options?: { targets?: Partial<GapTargets>; verbose?: boolean }
): string {
  const targets = { ...DEFAULT_GAP_TARGETS, ...options?.targets };

  const scoreBar = (score: number, target?: number) => {
    const filled = Math.round(score * 20);
    const empty = 20 - filled;
    const bar = `[${"█".repeat(filled)}${"░".repeat(empty)}] ${(score * 100).toFixed(0)}%`;
    if (target !== undefined) {
      const indicator = score >= target ? "✓" : `(gap: ${((target - score) * 100).toFixed(0)}%)`;
      return `${bar} ${indicator}`;
    }
    return bar;
  };

  const compositeIndicator =
    analysis.compositeScore >= targets.composite ? "✓ ON TARGET" : "BELOW TARGET";

  const lines = [
    "═══════════════════════════════════════════════════════════",
    "                    GAP ANALYSIS REPORT                     ",
    "═══════════════════════════════════════════════════════════",
    "",
    `  COMPOSITE SCORE: ${scoreBar(analysis.compositeScore)}`,
    `                   Target: ${(targets.composite * 100).toFixed(0)}% - ${compositeIndicator}`,
    "",
    "───────────────────────────────────────────────────────────",
    "  BREAKDOWN:                          Current    Target",
    "───────────────────────────────────────────────────────────",
    "",
    `  Container F1:    ${scoreBar(analysis.containerF1.score, targets.containerF1)}`,
    `                   ${analysis.containerF1.explanation}`,
    "",
    `  Signal/Noise:    ${scoreBar(analysis.signalToNoise.score, targets.signalToNoise)}`,
    `                   ${analysis.signalToNoise.explanation}`,
    "",
    `  Relationship F1: ${scoreBar(analysis.relationshipF1.score, targets.relationshipF1)}`,
    `                   ${analysis.relationshipF1.explanation}`,
    "",
    `  External F1:     ${scoreBar(analysis.externalF1.score, targets.externalF1)}`,
    `                   ${analysis.externalF1.explanation}`,
    "",
    "═══════════════════════════════════════════════════════════",
  ];

  // Add rule analysis if present
  if (analysis.ruleAnalysis) {
    lines.push("");
    lines.push("───────────────────────────────────────────────────────────");
    lines.push("  RULE ANALYSIS:");
    lines.push("───────────────────────────────────────────────────────────");
    lines.push("");

    // Grouping rules
    const grouping = analysis.ruleAnalysis.grouping;
    lines.push("  Grouping Rules:");
    lines.push(`    Containers identified: ${grouping.containersIdentified}`);
    lines.push(`    Unmatched containers: ${grouping.unmatched}`);
    if (grouping.layerCoverage.size > 0) {
      lines.push("    Layer coverage:");
      for (const [layer, count] of grouping.layerCoverage) {
        lines.push(`      - ${layer}: ${count} containers`);
      }
    }
    if (grouping.matchedRules.length > 0 && options?.verbose) {
      lines.push(`    Matched rules: ${grouping.matchedRules.join(", ")}`);
    }
    lines.push("");

    // Significance rules
    const sig = analysis.ruleAnalysis.significance;
    lines.push("  Significance Rules:");
    lines.push(`    Critical: ${sig.byLevel.critical}`);
    lines.push(`    Important: ${sig.byLevel.important}`);
    lines.push(`    Minor: ${sig.byLevel.minor}`);
    lines.push(`    Hidden: ${sig.byLevel.hidden}`);
    lines.push(`    Filtering ratio: ${(sig.filteringRatio * 100).toFixed(1)}%`);
    if (sig.matchedRules.length > 0 && options?.verbose) {
      lines.push(`    Matched rules: ${sig.matchedRules.join(", ")}`);
    }
    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════");
  }

  // Add details for items with gaps
  if (analysis.containerF1.details.missing.length > 0) {
    lines.push("");
    lines.push("  MISSING CONTAINERS:");
    for (const item of analysis.containerF1.details.missing) {
      lines.push(`    - ${item}`);
    }
  }

  if (analysis.containerF1.details.extra.length > 0) {
    lines.push("");
    lines.push("  EXTRA CONTAINERS (noise):");
    for (const item of analysis.containerF1.details.extra.slice(0, 5)) {
      lines.push(`    - ${item}`);
    }
    if (analysis.containerF1.details.extra.length > 5) {
      lines.push(`    ... and ${analysis.containerF1.details.extra.length - 5} more`);
    }
  }

  // Add improvement suggestions
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────");
  lines.push("  SUGGESTIONS:");
  lines.push("───────────────────────────────────────────────────────────");

  const suggestions = getImprovementSuggestions(analysis, targets);
  for (const suggestion of suggestions) {
    lines.push(`  • ${suggestion}`);
  }

  return lines.join("\n");
}

/**
 * Generate improvement suggestions based on gap analysis
 */
function getImprovementSuggestions(analysis: GapAnalysis, targets: GapTargets): string[] {
  const suggestions: string[] = [];

  // Container F1 suggestions
  if (analysis.containerF1.score < targets.containerF1) {
    if (analysis.containerF1.details.extra.length > 5) {
      suggestions.push(
        "Consider adding grouping rules to reduce container noise (too many granular containers)"
      );
    }
    if (analysis.containerF1.details.missing.length > 0) {
      suggestions.push(
        `Add containers for: ${analysis.containerF1.details.missing.slice(0, 3).join(", ")}`
      );
    }
  }

  // Signal-to-noise suggestions
  if (analysis.signalToNoise.score < targets.signalToNoise) {
    suggestions.push(
      "Add significance rules to filter implementation details from architecture view"
    );
  }

  // Relationship F1 suggestions
  if (analysis.relationshipF1.score < targets.relationshipF1) {
    if (analysis.relationshipF1.details.missing.length > 0) {
      suggestions.push(
        "Missing key relationships - check that data flow edges are being generated"
      );
    }
    if (analysis.relationshipF1.details.extra.length > 10) {
      suggestions.push("Too many relationships - consider filtering by significance level");
    }
  }

  // External F1 suggestions
  if (analysis.externalF1.score < targets.externalF1) {
    suggestions.push(
      "Review external system detection rules - some externals may be uncategorized"
    );
  }

  // Rule analysis suggestions
  if (analysis.ruleAnalysis) {
    if (
      analysis.ruleAnalysis.grouping.unmatched > analysis.ruleAnalysis.grouping.containersIdentified
    ) {
      suggestions.push(
        "Most containers are unmatched - add more grouping rules for your codebase patterns"
      );
    }
    if (analysis.ruleAnalysis.significance.filteringRatio < 0.1) {
      suggestions.push(
        "Low filtering ratio - add hidden significance rules for logging, debug, and test utilities"
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push("All metrics are on target - architecture documentation is well-aligned");
  }

  return suggestions;
}
