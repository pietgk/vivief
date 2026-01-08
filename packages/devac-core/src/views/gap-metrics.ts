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
 * @see docs/plans/gap-metrics.md
 */

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
 * @returns Complete gap analysis with composite score
 */
export function analyzeGap(validated: ParsedC4Model, generated: ParsedC4Model): GapAnalysis {
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

  // Generate summary
  const summary = [
    `Gap Score: ${(compositeScore * 100).toFixed(1)}%`,
    "",
    "Breakdown:",
    `  Container F1: ${(containerF1.score * 100).toFixed(1)}% - ${containerF1.explanation}`,
    `  Signal/Noise: ${(signalToNoise.score * 100).toFixed(1)}% - ${signalToNoise.explanation}`,
    `  Relationship F1: ${(relationshipF1.score * 100).toFixed(1)}% - ${relationshipF1.explanation}`,
    `  External F1: ${(externalF1.score * 100).toFixed(1)}% - ${externalF1.explanation}`,
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
  };
}

/**
 * Format gap analysis for terminal output
 */
export function formatGapAnalysis(analysis: GapAnalysis): string {
  const scoreBar = (score: number) => {
    const filled = Math.round(score * 20);
    const empty = 20 - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${(score * 100).toFixed(0)}%`;
  };

  const lines = [
    "═══════════════════════════════════════════════════════════",
    "                    GAP ANALYSIS REPORT                     ",
    "═══════════════════════════════════════════════════════════",
    "",
    `  COMPOSITE SCORE: ${scoreBar(analysis.compositeScore)}`,
    "",
    "───────────────────────────────────────────────────────────",
    "  BREAKDOWN:",
    "───────────────────────────────────────────────────────────",
    "",
    `  Container F1:    ${scoreBar(analysis.containerF1.score)}`,
    `                   ${analysis.containerF1.explanation}`,
    "",
    `  Signal/Noise:    ${scoreBar(analysis.signalToNoise.score)}`,
    `                   ${analysis.signalToNoise.explanation}`,
    "",
    `  Relationship F1: ${scoreBar(analysis.relationshipF1.score)}`,
    `                   ${analysis.relationshipF1.explanation}`,
    "",
    `  External F1:     ${scoreBar(analysis.externalF1.score)}`,
    `                   ${analysis.externalF1.explanation}`,
    "",
    "═══════════════════════════════════════════════════════════",
  ];

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

  return lines.join("\n");
}
