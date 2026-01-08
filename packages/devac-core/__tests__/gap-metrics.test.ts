/**
 * Gap Metrics Tests
 *
 * Tests for the gap metrics calculator used in the architecture improvement loop.
 * Tests F1 score calculations, container matching, and composite scoring.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeGap,
  calculateContainerF1,
  calculateExternalF1,
  calculateF1,
  calculateRelationshipF1,
  calculateSignalToNoise,
} from "../src/views/gap-metrics.js";
import type {
  LikeC4Element,
  LikeC4Relationship,
  ParsedC4Model,
} from "../src/views/likec4-json-parser.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock LikeC4Element
 */
function createMockElement(id: string, title: string, kind = "component"): LikeC4Element {
  return {
    id,
    title,
    kind,
  };
}

/**
 * Create a mock LikeC4Relationship
 */
function createMockRelationship(id: string, source: string, target: string): LikeC4Relationship {
  return {
    id,
    source,
    target,
  };
}

/**
 * Create a mock ParsedC4Model with specified elements
 */
function createMockModel(config: {
  containers?: Array<{ id: string; title: string }>;
  components?: Array<{ id: string; title: string; parent?: string }>;
  externals?: Array<{ id: string; title: string }>;
  relationships?: Array<{ id: string; source: string; target: string }>;
}): ParsedC4Model {
  const containers = new Map<string, LikeC4Element>();
  const components = new Map<string, LikeC4Element>();
  const externals = new Map<string, LikeC4Element>();
  const relationshipsBySource = new Map<string, LikeC4Relationship[]>();
  const relationshipsByTarget = new Map<string, LikeC4Relationship[]>();

  // Populate containers
  for (const c of config.containers ?? []) {
    containers.set(c.id, createMockElement(c.id, c.title, "container"));
  }

  // Populate components
  for (const c of config.components ?? []) {
    const element = createMockElement(c.id, c.title, "component");
    if (c.parent) {
      element.parent = c.parent;
    }
    components.set(c.id, element);
  }

  // Populate externals
  for (const e of config.externals ?? []) {
    externals.set(e.id, createMockElement(e.id, e.title, "external"));
  }

  // Populate relationships
  for (const r of config.relationships ?? []) {
    const rel = createMockRelationship(r.id, r.source, r.target);

    // Index by source
    const sourceRels = relationshipsBySource.get(r.source) ?? [];
    sourceRels.push(rel);
    relationshipsBySource.set(r.source, sourceRels);

    // Index by target
    const targetRels = relationshipsByTarget.get(r.target) ?? [];
    targetRels.push(rel);
    relationshipsByTarget.set(r.target, targetRels);
  }

  // Build raw model for elements array
  const allElements: LikeC4Element[] = [
    ...containers.values(),
    ...components.values(),
    ...externals.values(),
  ];
  const allRelationships: LikeC4Relationship[] = [];
  for (const rels of relationshipsBySource.values()) {
    allRelationships.push(...rels);
  }

  return {
    containers,
    components,
    externals,
    relationshipsBySource,
    relationshipsByTarget,
    raw: {
      elements: allElements,
      relationships: allRelationships,
      views: [],
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("Gap Metrics", () => {
  describe("calculateF1", () => {
    it("returns 1.0 for identical sets", () => {
      const actual = new Set(["a", "b", "c"]);
      const predicted = new Set(["a", "b", "c"]);
      const result = calculateF1(actual, predicted);

      expect(result.f1).toBe(1);
      expect(result.precision).toBe(1);
      expect(result.recall).toBe(1);
      expect(result.truePositives).toBe(3);
      expect(result.falsePositives).toBe(0);
      expect(result.falseNegatives).toBe(0);
    });

    it("returns 0.0 for completely disjoint sets", () => {
      const actual = new Set(["a", "b"]);
      const predicted = new Set(["c", "d"]);
      const result = calculateF1(actual, predicted);

      expect(result.f1).toBe(0);
      expect(result.truePositives).toBe(0);
      expect(result.falsePositives).toBe(2);
      expect(result.falseNegatives).toBe(2);
    });

    it("handles partial overlap correctly", () => {
      const actual = new Set(["a", "b", "c"]);
      const predicted = new Set(["a", "b", "d"]);
      const result = calculateF1(actual, predicted);

      // TP=2 (a,b), FP=1 (d), FN=1 (c)
      // Precision = 2/3, Recall = 2/3, F1 = 2/3
      expect(result.truePositives).toBe(2);
      expect(result.falsePositives).toBe(1);
      expect(result.falseNegatives).toBe(1);
      expect(result.f1).toBeCloseTo(2 / 3, 5);
    });

    it("handles empty actual set", () => {
      const actual = new Set<string>();
      const predicted = new Set(["a", "b"]);
      const result = calculateF1(actual, predicted);

      expect(result.f1).toBe(0);
      expect(result.recall).toBe(0);
      expect(result.precision).toBe(0);
    });

    it("handles empty predicted set", () => {
      const actual = new Set(["a", "b"]);
      const predicted = new Set<string>();
      const result = calculateF1(actual, predicted);

      expect(result.f1).toBe(0);
      expect(result.recall).toBe(0);
      expect(result.precision).toBe(0);
    });

    it("handles both empty sets", () => {
      const result = calculateF1(new Set(), new Set());
      expect(result.f1).toBe(0);
    });
  });

  describe("calculateContainerF1", () => {
    it("matches identical containers", () => {
      const validated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
      });
      const generated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
      });

      const result = calculateContainerF1(validated, generated);
      expect(result.score).toBe(1);
      expect(result.details.matched).toHaveLength(2);
      expect(result.details.missing).toHaveLength(0);
      expect(result.details.extra).toHaveLength(0);
    });

    it("matches containers by normalized name (case insensitive)", () => {
      const validated = createMockModel({
        containers: [{ id: "a", title: "Analysis Layer" }],
      });
      const generated = createMockModel({
        containers: [
          { id: "b", title: "analysislayer" }, // different casing, no space
        ],
      });

      const result = calculateContainerF1(validated, generated);
      expect(result.score).toBe(1);
      expect(result.details.matched).toHaveLength(1);
    });

    it("identifies missing containers", () => {
      const validated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
      });
      const generated = createMockModel({
        containers: [{ id: "analysis", title: "Analysis Layer" }],
      });

      const result = calculateContainerF1(validated, generated);
      expect(result.score).toBeLessThan(1);
      expect(result.details.missing).toContain("Storage Layer");
    });

    it("identifies extra containers", () => {
      const validated = createMockModel({
        containers: [{ id: "analysis", title: "Analysis Layer" }],
      });
      const generated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "utils", title: "Utils" },
        ],
      });

      const result = calculateContainerF1(validated, generated);
      expect(result.score).toBeLessThan(1);
      expect(result.details.extra).toContain("Utils");
    });

    it("handles empty models", () => {
      const validated = createMockModel({ containers: [] });
      const generated = createMockModel({ containers: [] });

      const result = calculateContainerF1(validated, generated);
      expect(result.score).toBe(0); // No containers to match
    });
  });

  describe("calculateSignalToNoise", () => {
    it("returns 1.0 when component counts are equal", () => {
      const validated = createMockModel({
        components: [
          { id: "parser", title: "Parser" },
          { id: "analyzer", title: "Analyzer" },
        ],
      });
      const generated = createMockModel({
        components: [
          { id: "parser", title: "Parser" },
          { id: "analyzer", title: "Analyzer" },
        ],
      });

      const result = calculateSignalToNoise(validated, generated);
      expect(result.score).toBe(1);
    });

    it("penalizes too many generated components (noise)", () => {
      const validated = createMockModel({
        components: [{ id: "parser", title: "Parser" }],
      });
      const generated = createMockModel({
        components: [
          { id: "parser", title: "Parser" },
          { id: "helper1", title: "Helper1" },
          { id: "helper2", title: "Helper2" },
          { id: "helper3", title: "Helper3" },
          { id: "helper4", title: "Helper4" },
        ],
      });

      const result = calculateSignalToNoise(validated, generated);
      expect(result.score).toBeLessThan(1);
    });

    it("penalizes too few generated components", () => {
      const validated = createMockModel({
        components: [
          { id: "parser", title: "Parser" },
          { id: "analyzer", title: "Analyzer" },
          { id: "storage", title: "Storage" },
          { id: "hub", title: "Hub" },
        ],
      });
      const generated = createMockModel({
        components: [{ id: "parser", title: "Parser" }],
      });

      const result = calculateSignalToNoise(validated, generated);
      expect(result.score).toBeLessThan(1);
    });
  });

  describe("calculateRelationshipF1", () => {
    it("matches identical relationships", () => {
      const validated = createMockModel({
        relationships: [
          { id: "r1", source: "a", target: "b" },
          { id: "r2", source: "b", target: "c" },
        ],
      });
      const generated = createMockModel({
        relationships: [
          { id: "r1", source: "a", target: "b" },
          { id: "r2", source: "b", target: "c" },
        ],
      });

      const result = calculateRelationshipF1(validated, generated);
      expect(result.score).toBe(1);
      expect(result.details.matched).toHaveLength(2);
    });

    it("identifies missing relationships", () => {
      const validated = createMockModel({
        relationships: [
          { id: "r1", source: "a", target: "b" },
          { id: "r2", source: "b", target: "c" },
        ],
      });
      const generated = createMockModel({
        relationships: [{ id: "r1", source: "a", target: "b" }],
      });

      const result = calculateRelationshipF1(validated, generated);
      expect(result.score).toBeLessThan(1);
      expect(result.details.missing).toHaveLength(1);
    });

    it("handles empty relationship sets", () => {
      const validated = createMockModel({ relationships: [] });
      const generated = createMockModel({ relationships: [] });

      const result = calculateRelationshipF1(validated, generated);
      expect(result.score).toBe(0);
    });
  });

  describe("calculateExternalF1", () => {
    it("matches identical externals", () => {
      const validated = createMockModel({
        externals: [
          { id: "duckdb", title: "DuckDB" },
          { id: "filesystem", title: "File System" },
        ],
      });
      const generated = createMockModel({
        externals: [
          { id: "duckdb", title: "DuckDB" },
          { id: "filesystem", title: "File System" },
        ],
      });

      const result = calculateExternalF1(validated, generated);
      expect(result.score).toBe(1);
    });

    it("identifies missing externals", () => {
      const validated = createMockModel({
        externals: [
          { id: "duckdb", title: "DuckDB" },
          { id: "s3", title: "AWS S3" },
        ],
      });
      const generated = createMockModel({
        externals: [{ id: "duckdb", title: "DuckDB" }],
      });

      const result = calculateExternalF1(validated, generated);
      expect(result.details.missing).toContain("AWS S3");
    });
  });

  describe("analyzeGap", () => {
    it("returns composite score combining all metrics", () => {
      const validated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
        components: [
          { id: "parser", title: "Parser" },
          { id: "analyzer", title: "Analyzer" },
        ],
        externals: [{ id: "duckdb", title: "DuckDB" }],
        relationships: [{ id: "r1", source: "parser", target: "analyzer" }],
      });

      // Generated matches validated exactly
      const generated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
        components: [
          { id: "parser", title: "Parser" },
          { id: "analyzer", title: "Analyzer" },
        ],
        externals: [{ id: "duckdb", title: "DuckDB" }],
        relationships: [{ id: "r1", source: "parser", target: "analyzer" }],
      });

      const analysis = analyzeGap(validated, generated);

      expect(analysis.compositeScore).toBeGreaterThan(0.9);
      expect(analysis.containerF1.score).toBe(1);
      expect(analysis.externalF1.score).toBe(1);
      expect(analysis.relationshipF1.score).toBe(1);
    });

    it("returns lower score when generated differs from validated", () => {
      const validated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
          { id: "federation", title: "Federation Layer" },
        ],
        components: [{ id: "parser", title: "Parser" }],
        externals: [{ id: "duckdb", title: "DuckDB" }],
      });

      // Generated is missing federation layer
      const generated = createMockModel({
        containers: [
          { id: "analysis", title: "Analysis Layer" },
          { id: "storage", title: "Storage Layer" },
        ],
        components: [{ id: "parser", title: "Parser" }],
        externals: [{ id: "duckdb", title: "DuckDB" }],
      });

      const analysis = analyzeGap(validated, generated);

      expect(analysis.compositeScore).toBeLessThan(1);
      expect(analysis.containerF1.score).toBeLessThan(1);
      expect(analysis.containerF1.details.missing).toContain("Federation Layer");
    });

    it("generates human-readable summary", () => {
      const validated = createMockModel({
        containers: [{ id: "a", title: "A" }],
      });
      const generated = createMockModel({
        containers: [{ id: "a", title: "A" }],
      });

      const analysis = analyzeGap(validated, generated);

      expect(analysis.summary).toContain("Gap Score:");
      expect(analysis.summary).toContain("Container F1:");
    });
  });
});
