/**
 * Tests for gap-metrics.ts
 *
 * Tests the gap analysis functionality for comparing validated vs generated
 * C4 architecture models.
 */

import { describe, expect, test } from "vitest";
import type { GroupingRule } from "../../src/rules/grouping-rules.js";
import type { SignificanceRule } from "../../src/rules/significance-rules.js";
import {
  DEFAULT_GAP_TARGETS,
  analyzeGap,
  calculateContainerF1,
  calculateExternalF1,
  calculateF1,
  calculateRelationshipF1,
  calculateSignalToNoise,
  formatGapAnalysis,
} from "../../src/views/gap-metrics.js";
import type { ParsedC4Model } from "../../src/views/likec4-json-parser.js";
import type { LikeC4Element, LikeC4Relationship } from "../../src/views/likec4-json-parser.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockElement(id: string, title?: string): LikeC4Element {
  return {
    id,
    kind: "container",
    title: title ?? id,
  };
}

function createMockRelationship(
  id: string,
  source: string,
  target: string,
  title?: string
): LikeC4Relationship {
  return {
    id,
    source,
    target,
    title,
  };
}

function createEmptyModel(): ParsedC4Model {
  return {
    containers: new Map(),
    components: new Map(),
    externals: new Map(),
    relationshipsBySource: new Map(),
    relationshipsByTarget: new Map(),
    raw: { elements: [], relationships: [], views: [] },
  };
}

function createModelWithContainers(containers: string[]): ParsedC4Model {
  const model = createEmptyModel();
  for (const name of containers) {
    model.containers.set(name, createMockElement(name, name));
  }
  return model;
}

function createModelWithComponents(components: string[]): ParsedC4Model {
  const model = createEmptyModel();
  for (const name of components) {
    model.components.set(name, createMockElement(name, name));
  }
  return model;
}

function createModelWithExternals(externals: string[]): ParsedC4Model {
  const model = createEmptyModel();
  for (const name of externals) {
    model.externals.set(name, createMockElement(name, name));
  }
  return model;
}

function createModelWithRelationships(
  relationships: Array<{ source: string; target: string }>
): ParsedC4Model {
  const model = createEmptyModel();
  relationships.forEach((rel, i) => {
    const relationship = createMockRelationship(`rel-${i}`, rel.source, rel.target);
    const existing = model.relationshipsBySource.get(rel.source) ?? [];
    existing.push(relationship);
    model.relationshipsBySource.set(rel.source, existing);
  });
  return model;
}

// =============================================================================
// calculateF1 Tests
// =============================================================================

describe("calculateF1", () => {
  test("returns perfect score for identical sets", () => {
    const setA = new Set(["a", "b", "c"]);
    const setB = new Set(["a", "b", "c"]);

    const result = calculateF1(setA, setB);

    expect(result.f1).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.truePositives).toBe(3);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
  });

  test("returns zero for completely different sets", () => {
    const setA = new Set(["a", "b", "c"]);
    const setB = new Set(["x", "y", "z"]);

    const result = calculateF1(setA, setB);

    expect(result.f1).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(3);
    expect(result.falseNegatives).toBe(3);
  });

  test("calculates partial overlap correctly", () => {
    const setA = new Set(["a", "b", "c"]); // goal
    const setB = new Set(["a", "b", "d"]); // output

    const result = calculateF1(setA, setB);

    // TP = 2 (a, b)
    // FP = 1 (d - in output but not goal)
    // FN = 1 (c - in goal but not output)
    expect(result.truePositives).toBe(2);
    expect(result.falsePositives).toBe(1);
    expect(result.falseNegatives).toBe(1);

    // Precision = TP / (TP + FP) = 2/3
    expect(result.precision).toBeCloseTo(2 / 3);

    // Recall = TP / (TP + FN) = 2/3
    expect(result.recall).toBeCloseTo(2 / 3);

    // F1 = 2 * (P * R) / (P + R) = 2 * (2/3 * 2/3) / (4/3) = 2/3
    expect(result.f1).toBeCloseTo(2 / 3);
  });

  test("handles empty goal set", () => {
    const setA = new Set<string>();
    const setB = new Set(["a", "b"]);

    const result = calculateF1(setA, setB);

    expect(result.f1).toBe(0);
    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(2);
    expect(result.falseNegatives).toBe(0);
  });

  test("handles empty output set", () => {
    const setA = new Set(["a", "b"]);
    const setB = new Set<string>();

    const result = calculateF1(setA, setB);

    expect(result.f1).toBe(0);
    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(2);
  });

  test("handles both empty sets", () => {
    const setA = new Set<string>();
    const setB = new Set<string>();

    const result = calculateF1(setA, setB);

    // Both empty sets result in 0 precision/recall (no items to compare)
    expect(result.f1).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
  });

  test("calculates high precision low recall correctly", () => {
    const setA = new Set(["a", "b", "c", "d", "e"]); // goal: 5 items
    const setB = new Set(["a"]); // output: 1 item

    const result = calculateF1(setA, setB);

    // TP = 1, FP = 0, FN = 4
    expect(result.truePositives).toBe(1);
    expect(result.precision).toBe(1); // 1/1
    expect(result.recall).toBeCloseTo(0.2); // 1/5
  });

  test("calculates low precision high recall correctly", () => {
    const setA = new Set(["a"]); // goal: 1 item
    const setB = new Set(["a", "b", "c", "d", "e"]); // output: 5 items

    const result = calculateF1(setA, setB);

    // TP = 1, FP = 4, FN = 0
    expect(result.truePositives).toBe(1);
    expect(result.precision).toBeCloseTo(0.2); // 1/5
    expect(result.recall).toBe(1); // 1/1
  });
});

// =============================================================================
// calculateContainerF1 Tests
// =============================================================================

describe("calculateContainerF1", () => {
  test("returns perfect score for matching containers", () => {
    const validated = createModelWithContainers(["API Layer", "Data Layer", "UI Layer"]);
    const generated = createModelWithContainers(["API Layer", "Data Layer", "UI Layer"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
    expect(result.name).toBe("Container F1");
    expect(result.details.missing).toHaveLength(0);
    expect(result.details.extra).toHaveLength(0);
    expect(result.details.matched).toHaveLength(3);
  });

  test("handles missing containers", () => {
    const validated = createModelWithContainers(["API Layer", "Data Layer", "UI Layer"]);
    const generated = createModelWithContainers(["API Layer"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.missing).toContain("Data Layer");
    expect(result.details.missing).toContain("UI Layer");
    expect(result.details.matched).toContain("API Layer");
  });

  test("handles extra containers", () => {
    const validated = createModelWithContainers(["API Layer"]);
    const generated = createModelWithContainers(["API Layer", "Extra Layer", "Another Layer"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.extra).toContain("Extra Layer");
    expect(result.details.extra).toContain("Another Layer");
    expect(result.details.matched).toContain("API Layer");
  });

  test("uses fuzzy matching for container names", () => {
    const validated = createModelWithContainers(["Analysis Layer"]);
    const generated = createModelWithContainers(["AnalysisLayer"]); // No space

    const result = calculateContainerF1(validated, generated);

    // Should match due to normalization (removing spaces, lowercasing)
    expect(result.score).toBe(1);
    expect(result.details.matched).toHaveLength(1);
  });

  test("normalizes underscores and hyphens", () => {
    const validated = createModelWithContainers(["data_layer"]);
    const generated = createModelWithContainers(["data-layer"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
  });

  test("handles empty models", () => {
    const validated = createEmptyModel();
    const generated = createEmptyModel();

    const result = calculateContainerF1(validated, generated);

    // Empty models result in 0 score (no items to compare)
    expect(result.score).toBe(0);
  });

  test("includes explanation in result", () => {
    const validated = createModelWithContainers(["A", "B", "C"]);
    const generated = createModelWithContainers(["A", "B", "D"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.explanation).toContain("2/3 containers matched");
    expect(result.explanation).toContain("1 extra generated");
  });
});

// =============================================================================
// calculateSignalToNoise Tests
// =============================================================================

describe("calculateSignalToNoise", () => {
  test("returns high score for similar component counts", () => {
    const validated = createModelWithComponents(["A", "B", "C", "D", "E"]);
    const generated = createModelWithComponents(["A", "B", "C", "D", "F"]);

    const result = calculateSignalToNoise(validated, generated);

    // Ratio = 1.0, should be high score
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.name).toBe("Signal-to-Noise");
  });

  test("penalizes too many generated components (noise)", () => {
    const validated = createModelWithComponents(["A", "B"]); // 2 components
    const generated = createModelWithComponents(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]); // 10 components

    const result = calculateSignalToNoise(validated, generated);

    // Ratio = 5.0, should have lower score
    expect(result.score).toBeLessThan(0.5);
    expect(result.explanation).toContain("ratio: 5.00");
  });

  test("penalizes too few generated components (missing)", () => {
    const validated = createModelWithComponents(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]); // 10
    const generated = createModelWithComponents(["A", "B"]); // 2

    const result = calculateSignalToNoise(validated, generated);

    // Ratio = 0.2, should have lower score
    expect(result.score).toBeLessThan(0.5);
  });

  test("handles no components generated", () => {
    const validated = createModelWithComponents(["A", "B", "C"]);
    const generated = createEmptyModel();

    const result = calculateSignalToNoise(validated, generated);

    expect(result.score).toBe(0);
    expect(result.explanation).toBe("No components generated");
  });

  test("handles no validated components", () => {
    const validated = createEmptyModel();
    const generated = createModelWithComponents(["A", "B"]);

    const result = calculateSignalToNoise(validated, generated);

    expect(result.score).toBe(0.5);
    expect(result.explanation).toBe("No components in validated model");
  });

  test("handles both empty", () => {
    const validated = createEmptyModel();
    const generated = createEmptyModel();

    const result = calculateSignalToNoise(validated, generated);

    // No components generated means score is 0
    expect(result.score).toBe(0);
  });

  test("includes matched, missing, and extra in details", () => {
    const validated = createModelWithComponents(["A", "B", "C"]);
    const generated = createModelWithComponents(["A", "B", "D", "E"]);

    const result = calculateSignalToNoise(validated, generated);

    expect(result.details.matched).toContain("a");
    expect(result.details.matched).toContain("b");
    expect(result.details.missing).toContain("c");
    expect(result.details.extra).toContain("d");
    expect(result.details.extra).toContain("e");
  });

  test("limits extra list to 10 items", () => {
    const validated = createModelWithComponents(["A"]);
    const extras = Array.from({ length: 20 }, (_, i) => `Extra${i}`);
    const generated = createModelWithComponents(["A", ...extras]);

    const result = calculateSignalToNoise(validated, generated);

    expect(result.details.extra.length).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// calculateRelationshipF1 Tests
// =============================================================================

describe("calculateRelationshipF1", () => {
  test("returns perfect score for matching relationships", () => {
    const validated = createModelWithRelationships([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
    const generated = createModelWithRelationships([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);

    const result = calculateRelationshipF1(validated, generated);

    expect(result.score).toBe(1);
    expect(result.name).toBe("Relationship F1");
  });

  test("handles missing relationships", () => {
    const validated = createModelWithRelationships([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
    ]);
    const generated = createModelWithRelationships([{ source: "A", target: "B" }]);

    const result = calculateRelationshipF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.missing.length).toBe(2);
  });

  test("handles extra relationships", () => {
    const validated = createModelWithRelationships([{ source: "A", target: "B" }]);
    const generated = createModelWithRelationships([
      { source: "A", target: "B" },
      { source: "X", target: "Y" },
      { source: "Y", target: "Z" },
    ]);

    const result = calculateRelationshipF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.extra.length).toBe(2);
  });

  test("normalizes relationship keys using last segment", () => {
    const validated = createModelWithRelationships([
      { source: "system.module.A", target: "system.module.B" },
    ]);
    const generated = createModelWithRelationships([{ source: "other.A", target: "other.B" }]);

    const result = calculateRelationshipF1(validated, generated);

    // Should match because both normalize to a->b
    expect(result.score).toBe(1);
  });

  test("handles empty models", () => {
    const validated = createEmptyModel();
    const generated = createEmptyModel();

    const result = calculateRelationshipF1(validated, generated);

    // Empty models result in 0 score (no relationships to compare)
    expect(result.score).toBe(0);
  });

  test("includes explanation with match count", () => {
    const validated = createModelWithRelationships([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
    const generated = createModelWithRelationships([{ source: "A", target: "B" }]);

    const result = calculateRelationshipF1(validated, generated);

    expect(result.explanation).toContain("1/2 relationships matched");
  });

  test("limits extra list to 10 items", () => {
    const validated = createModelWithRelationships([{ source: "A", target: "B" }]);
    const extras = Array.from({ length: 20 }, (_, i) => ({
      source: `Extra${i}`,
      target: `Target${i}`,
    }));
    const generated = createModelWithRelationships([{ source: "A", target: "B" }, ...extras]);

    const result = calculateRelationshipF1(validated, generated);

    expect(result.details.extra.length).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// calculateExternalF1 Tests
// =============================================================================

describe("calculateExternalF1", () => {
  test("returns perfect score for matching externals", () => {
    const validated = createModelWithExternals(["AWS S3", "PostgreSQL", "Redis"]);
    const generated = createModelWithExternals(["AWS S3", "PostgreSQL", "Redis"]);

    const result = calculateExternalF1(validated, generated);

    expect(result.score).toBe(1);
    expect(result.name).toBe("External F1");
  });

  test("handles missing external systems", () => {
    const validated = createModelWithExternals(["AWS S3", "PostgreSQL", "Redis"]);
    const generated = createModelWithExternals(["AWS S3"]);

    const result = calculateExternalF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.missing).toContain("PostgreSQL");
    expect(result.details.missing).toContain("Redis");
  });

  test("handles extra external systems", () => {
    const validated = createModelWithExternals(["AWS S3"]);
    const generated = createModelWithExternals(["AWS S3", "MongoDB", "Kafka"]);

    const result = calculateExternalF1(validated, generated);

    expect(result.score).toBeLessThan(1);
    expect(result.details.extra).toContain("MongoDB");
    expect(result.details.extra).toContain("Kafka");
  });

  test("uses fuzzy matching for external names", () => {
    const validated = createModelWithExternals(["AWS_S3"]);
    const generated = createModelWithExternals(["aws-s3"]);

    const result = calculateExternalF1(validated, generated);

    expect(result.score).toBe(1);
  });

  test("handles empty models", () => {
    const validated = createEmptyModel();
    const generated = createEmptyModel();

    const result = calculateExternalF1(validated, generated);

    // Empty models result in 0 score (no externals to compare)
    expect(result.score).toBe(0);
  });

  test("includes explanation with match count", () => {
    const validated = createModelWithExternals(["A", "B", "C"]);
    const generated = createModelWithExternals(["A", "B"]);

    const result = calculateExternalF1(validated, generated);

    expect(result.explanation).toContain("2/3 external systems matched");
  });
});

// =============================================================================
// analyzeGap Tests
// =============================================================================

describe("analyzeGap", () => {
  test("returns complete gap analysis", () => {
    const validated = createModelWithContainers(["API", "Data"]);
    validated.components = new Map([
      ["comp1", createMockElement("comp1")],
      ["comp2", createMockElement("comp2")],
    ]);
    validated.externals = new Map([["ext1", createMockElement("ext1")]]);
    validated.relationshipsBySource = new Map([
      ["API", [createMockRelationship("rel1", "API", "Data")]],
    ]);

    const generated = createModelWithContainers(["API", "Data"]);
    generated.components = new Map([
      ["comp1", createMockElement("comp1")],
      ["comp2", createMockElement("comp2")],
    ]);
    generated.externals = new Map([["ext1", createMockElement("ext1")]]);
    generated.relationshipsBySource = new Map([
      ["API", [createMockRelationship("rel1", "API", "Data")]],
    ]);

    const result = analyzeGap(validated, generated);

    expect(result.containerF1).toBeDefined();
    expect(result.signalToNoise).toBeDefined();
    expect(result.relationshipF1).toBeDefined();
    expect(result.externalF1).toBeDefined();
    expect(result.compositeScore).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test("calculates composite score correctly", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);

    const result = analyzeGap(validated, generated);

    // All metrics should be 1.0 for perfect match
    expect(result.compositeScore).toBeGreaterThan(0);
    expect(result.compositeScore).toBeLessThanOrEqual(1);
  });

  test("includes summary with target comparisons", () => {
    const validated = createModelWithContainers(["API", "Data"]);
    const generated = createModelWithContainers(["API"]);

    const result = analyzeGap(validated, generated);

    expect(result.summary).toContain("Gap Score:");
    expect(result.summary).toContain("Container F1:");
    expect(result.summary).toContain("Signal/Noise:");
    expect(result.summary).toContain("Relationship F1:");
    expect(result.summary).toContain("External F1:");
  });

  test("respects custom targets", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);

    const customTargets = {
      composite: 0.9,
      containerF1: 0.95,
      signalToNoise: 0.8,
      relationshipF1: 0.85,
      externalF1: 0.75,
    };

    const result = analyzeGap(validated, generated, { targets: customTargets });

    expect(result.summary).toContain("target: 90%");
  });

  test("includes rule analysis when rules provided", () => {
    const validated = createModelWithContainers(["API Layer"]);
    const generated = createModelWithContainers(["API Layer"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "rule1",
        name: "API Rule",
        match: { entityName: "api" },
        emit: { container: "API Layer" },
      },
    ];

    const significanceRules: SignificanceRule[] = [
      {
        id: "sig1",
        name: "Critical API",
        match: { entityName: "api" },
        emit: { level: "critical" },
      },
    ];

    const result = analyzeGap(validated, generated, {
      groupingRules,
      significanceRules,
    });

    expect(result.ruleAnalysis).toBeDefined();
    expect(result.ruleAnalysis?.grouping).toBeDefined();
    expect(result.ruleAnalysis?.significance).toBeDefined();
  });

  test("handles missing containers in summary", () => {
    const validated = createModelWithContainers(["API", "Data", "UI"]);
    const generated = createModelWithContainers(["API"]);

    const result = analyzeGap(validated, generated);

    expect(result.summary).toContain("Missing containers:");
  });

  test("handles extra containers in summary", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API", "Extra1", "Extra2"]);

    const result = analyzeGap(validated, generated);

    expect(result.summary).toContain("Extra containers:");
  });
});

// =============================================================================
// formatGapAnalysis Tests
// =============================================================================

describe("formatGapAnalysis", () => {
  test("formats analysis for terminal output", () => {
    const validated = createModelWithContainers(["API", "Data"]);
    const generated = createModelWithContainers(["API", "Data"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("GAP ANALYSIS REPORT");
    expect(formatted).toContain("COMPOSITE SCORE");
    expect(formatted).toContain("BREAKDOWN");
    expect(formatted).toContain("Container F1");
    expect(formatted).toContain("Signal/Noise");
    expect(formatted).toContain("Relationship F1");
    expect(formatted).toContain("External F1");
    expect(formatted).toContain("SUGGESTIONS");
  });

  test("includes score bars with progress indicators", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("█"); // Filled part of progress bar
    expect(formatted).toContain("%");
  });

  test("shows ON TARGET when meeting threshold", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    // Set low targets that will be met
    const formatted = formatGapAnalysis(analysis, {
      targets: { composite: 0.1 },
    });

    expect(formatted).toContain("ON TARGET");
  });

  test("shows BELOW TARGET when not meeting threshold", () => {
    const validated = createModelWithContainers(["API", "Data", "UI", "Service"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis, {
      targets: { composite: 0.99 },
    });

    expect(formatted).toContain("BELOW TARGET");
  });

  test("includes rule analysis section when present", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "rule1",
        name: "API Rule",
        match: { entityName: "api" },
        emit: { container: "API Layer" },
      },
    ];

    const analysis = analyzeGap(validated, generated, { groupingRules });
    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("RULE ANALYSIS");
    expect(formatted).toContain("Grouping Rules");
    expect(formatted).toContain("Significance Rules");
  });

  test("lists missing containers when present", () => {
    const validated = createModelWithContainers(["API", "Data", "UI"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("MISSING CONTAINERS");
  });

  test("lists extra containers with limit", () => {
    const validated = createModelWithContainers(["API"]);
    const extras = Array.from({ length: 10 }, (_, i) => `Extra${i}`);
    const generated = createModelWithContainers(["API", ...extras]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("EXTRA CONTAINERS");
    expect(formatted).toContain("... and");
  });

  test("includes improvement suggestions", () => {
    const validated = createModelWithContainers(["API", "Data", "UI"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    expect(formatted).toContain("SUGGESTIONS");
    expect(formatted).toContain("•");
  });

  test("uses default targets when not specified", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);
    const analysis = analyzeGap(validated, generated);

    const formatted = formatGapAnalysis(analysis);

    // Should use DEFAULT_GAP_TARGETS - composite is 0.65 = 65%
    expect(formatted).toContain("Target: 65%");
  });

  test("shows verbose output when enabled", () => {
    const validated = createModelWithContainers(["API"]);
    const generated = createModelWithContainers(["API"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "rule1",
        name: "API Rule",
        match: { entityName: "api" },
        emit: { container: "API" },
      },
    ];

    const analysis = analyzeGap(validated, generated, { groupingRules });
    const formatted = formatGapAnalysis(analysis, { verbose: true });

    expect(formatted).toContain("Matched rules:");
  });
});

// =============================================================================
// DEFAULT_GAP_TARGETS Tests
// =============================================================================

describe("DEFAULT_GAP_TARGETS", () => {
  test("has all required target properties", () => {
    expect(DEFAULT_GAP_TARGETS.composite).toBeDefined();
    expect(DEFAULT_GAP_TARGETS.containerF1).toBeDefined();
    expect(DEFAULT_GAP_TARGETS.signalToNoise).toBeDefined();
    expect(DEFAULT_GAP_TARGETS.relationshipF1).toBeDefined();
    expect(DEFAULT_GAP_TARGETS.externalF1).toBeDefined();
  });

  test("targets are valid percentages", () => {
    expect(DEFAULT_GAP_TARGETS.composite).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAP_TARGETS.composite).toBeLessThanOrEqual(1);
    expect(DEFAULT_GAP_TARGETS.containerF1).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAP_TARGETS.containerF1).toBeLessThanOrEqual(1);
    expect(DEFAULT_GAP_TARGETS.signalToNoise).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAP_TARGETS.signalToNoise).toBeLessThanOrEqual(1);
    expect(DEFAULT_GAP_TARGETS.relationshipF1).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAP_TARGETS.relationshipF1).toBeLessThanOrEqual(1);
    expect(DEFAULT_GAP_TARGETS.externalF1).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAP_TARGETS.externalF1).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe("Edge cases", () => {
  test("handles models with only IDs (no titles)", () => {
    const validated: ParsedC4Model = {
      containers: new Map([["container1", { id: "container1", kind: "container", title: "" }]]),
      components: new Map(),
      externals: new Map(),
      relationshipsBySource: new Map(),
      relationshipsByTarget: new Map(),
      raw: { elements: [], relationships: [], views: [] },
    };
    const generated: ParsedC4Model = {
      containers: new Map([["container1", { id: "container1", kind: "container", title: "" }]]),
      components: new Map(),
      externals: new Map(),
      relationshipsBySource: new Map(),
      relationshipsByTarget: new Map(),
      raw: { elements: [], relationships: [], views: [] },
    };

    const result = analyzeGap(validated, generated);

    expect(result.containerF1.score).toBe(1);
  });

  test("handles special characters in names", () => {
    const validated = createModelWithContainers(["API-v2.0 (Production)"]);
    const generated = createModelWithContainers(["API-v2.0 (Production)"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
  });

  test("handles unicode characters in names", () => {
    const validated = createModelWithContainers(["API层", "数据层"]);
    const generated = createModelWithContainers(["API层", "数据层"]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
  });

  test("handles very long container names", () => {
    const longName = "A".repeat(1000);
    const validated = createModelWithContainers([longName]);
    const generated = createModelWithContainers([longName]);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
  });

  test("handles large number of containers", () => {
    const names = Array.from({ length: 100 }, (_, i) => `Container${i}`);
    const validated = createModelWithContainers(names);
    const generated = createModelWithContainers(names);

    const result = calculateContainerF1(validated, generated);

    expect(result.score).toBe(1);
  });
});

// =============================================================================
// Rule Matching Tests
// =============================================================================

describe("Rule analysis", () => {
  test("matches grouping rules by file path string", () => {
    const validated = createModelWithContainers(["src/api"]);
    const generated = createModelWithContainers(["src/api"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "api-rule",
        name: "API Rule",
        match: { filePath: "api" },
        emit: { container: "API Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.matchedRules).toContain("api-rule");
  });

  test("matches grouping rules by entity name string", () => {
    const validated = createModelWithContainers(["UserService"]);
    const generated = createModelWithContainers(["UserService"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "service-rule",
        name: "Service Rule",
        match: { entityName: "service" },
        emit: { container: "Service Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.matchedRules).toContain("service-rule");
  });

  test("matches grouping rules by domain", () => {
    const validated = createModelWithContainers(["Payment"]);
    const generated = createModelWithContainers(["Payment"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "payment-rule",
        name: "Payment Rule",
        match: { domain: "payment" },
        emit: { container: "Payment Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.matchedRules).toContain("payment-rule");
  });

  test("matches grouping rules by domain array", () => {
    const validated = createModelWithContainers(["Auth"]);
    const generated = createModelWithContainers(["Auth"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "security-rule",
        name: "Security Rule",
        match: { domain: ["auth", "security"] },
        emit: { container: "Security Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.matchedRules).toContain("security-rule");
  });

  test("matches grouping rules by regex", () => {
    const validated = createModelWithContainers(["UserController"]);
    const generated = createModelWithContainers(["UserController"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "controller-rule",
        name: "Controller Rule",
        match: { entityName: /Controller$/i },
        emit: { container: "Controller Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.matchedRules).toContain("controller-rule");
  });

  test("matches significance rules by entity name", () => {
    const validated = createModelWithComponents(["PublicAPI"]);
    const generated = createModelWithComponents(["PublicAPI"]);

    const significanceRules: SignificanceRule[] = [
      {
        id: "public-api",
        name: "Public API",
        match: { entityName: "public" },
        emit: { level: "critical" },
      },
    ];

    const result = analyzeGap(validated, generated, { significanceRules });

    expect(result.ruleAnalysis?.significance.matchedRules).toContain("public-api");
    expect(result.ruleAnalysis?.significance.byLevel.critical).toBeGreaterThan(0);
  });

  test("matches significance rules by regex", () => {
    const validated = createModelWithComponents(["TestHelper"]);
    const generated = createModelWithComponents(["TestHelper"]);

    const significanceRules: SignificanceRule[] = [
      {
        id: "test-utils",
        name: "Test Utilities",
        match: { entityName: /^Test/ },
        emit: { level: "hidden" },
      },
    ];

    const result = analyzeGap(validated, generated, { significanceRules });

    expect(result.ruleAnalysis?.significance.matchedRules).toContain("test-utils");
    expect(result.ruleAnalysis?.significance.byLevel.hidden).toBeGreaterThan(0);
  });

  test("tracks layer coverage from grouping rules", () => {
    const validated = createModelWithContainers(["APIHandler", "DataStore"]);
    const generated = createModelWithContainers(["APIHandler", "DataStore"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "api-rule",
        name: "API Rule",
        match: { entityName: "api" },
        emit: { container: "API Layer" },
      },
      {
        id: "data-rule",
        name: "Data Rule",
        match: { entityName: "data" },
        emit: { container: "Data Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.layerCoverage.get("API Layer")).toBe(1);
    expect(result.ruleAnalysis?.grouping.layerCoverage.get("Data Layer")).toBe(1);
  });

  test("calculates filtering ratio correctly", () => {
    const validated = createModelWithComponents(["A", "B", "C", "D"]);
    const generated = createModelWithComponents(["A", "B", "C", "D"]);

    const significanceRules: SignificanceRule[] = [
      {
        id: "hide-a",
        name: "Hide A",
        match: { entityName: "a" },
        emit: { level: "hidden" },
      },
      {
        id: "hide-b",
        name: "Hide B",
        match: { entityName: "b" },
        emit: { level: "hidden" },
      },
    ];

    const result = analyzeGap(validated, generated, { significanceRules });

    // 2 out of 4 are hidden = 0.5 filtering ratio
    expect(result.ruleAnalysis?.significance.filteringRatio).toBe(0.5);
  });

  test("counts unmatched containers", () => {
    const validated = createModelWithContainers(["NoMatch1", "NoMatch2"]);
    const generated = createModelWithContainers(["NoMatch1", "NoMatch2"]);

    const groupingRules: GroupingRule[] = [
      {
        id: "specific-rule",
        name: "Specific Rule",
        match: { entityName: "xyz" }, // Won't match anything
        emit: { container: "XYZ Layer" },
      },
    ];

    const result = analyzeGap(validated, generated, { groupingRules });

    expect(result.ruleAnalysis?.grouping.unmatched).toBe(2);
  });
});
