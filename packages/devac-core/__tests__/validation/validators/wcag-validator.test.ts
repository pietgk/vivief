/**
 * Tests for WCAG Validator
 *
 * Part of DevAC Phase 2: WCAG Validation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedEdge, ParsedNode } from "../../../src/types/index.js";
import {
  WcagValidator,
  createWcagValidator,
} from "../../../src/validation/validators/wcag-validator.js";

// ============================================================================
// Mocks
// ============================================================================

const mockSeedReader = {
  readNodes: vi.fn(),
  readEdges: vi.fn(),
};

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(overrides: Partial<ParsedNode> = {}): ParsedNode {
  return {
    entity_id: `node-${Math.random().toString(36).slice(2, 9)}`,
    name: "TestElement",
    qualified_name: "TestElement",
    kind: "html_element",
    file_path: "/test/file.tsx",
    start_line: 10,
    start_column: 5,
    end_line: 10,
    end_column: 50,
    is_exported: false,
    is_default_export: false,
    visibility: "public",
    is_async: false,
    is_generator: false,
    is_static: false,
    is_abstract: false,
    type_signature: null,
    documentation: null,
    decorators: [],
    type_parameters: [],
    properties: {},
    source_file_hash: "abc123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createTestEdge(overrides: Partial<ParsedEdge> = {}): ParsedEdge {
  return {
    source_entity_id: "source-node",
    target_entity_id: "target-node",
    edge_type: "REFERENCES",
    source_file_path: "/test/file.tsx",
    source_line: 10,
    source_column: 5,
    properties: {},
    source_file_hash: "abc123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("WcagValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validate", () => {
    it("should return success when no issues found", async () => {
      const goodNode = createTestNode({
        properties: { htmlElement: "button" },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [goodNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.success).toBe(true);
      expect(result.issues.length).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.checkedCount).toBe(1);
      expect(result.passedCount).toBe(1);
      expect(result.passRate).toBe(100);
    });

    it("should detect keyboard accessibility issues", async () => {
      const badNode = createTestNode({
        properties: {
          htmlElement: "div",
          potentialA11yIssue: true,
        },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [badNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.success).toBe(false);
      expect(result.issues.length).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.issues[0]?.source).toBe("wcag");
      expect(result.issues[0]?.code).toBe("wcag-keyboard-accessible");
    });

    it("should detect positive tabIndex issues", async () => {
      const badNode = createTestNode({
        properties: {
          htmlElement: "div",
          tabIndex: 5,
        },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [badNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.success).toBe(true); // warnings don't fail
      expect(result.issues.length).toBe(1);
      expect(result.warningCount).toBe(1);
      expect(result.issues[0]?.code).toBe("wcag-no-positive-tabindex");
    });

    it("should detect broken ARIA references", async () => {
      const sourceNode = createTestNode({
        entity_id: "source-node",
        properties: {
          htmlElement: "div",
          ariaProps: {
            "aria-labelledby": "missing-id",
          },
        },
      });

      const edge = createTestEdge({
        source_entity_id: "source-node",
        edge_type: "REFERENCES",
        properties: {
          ariaRelationType: "aria-labelledby",
          targetElementId: "missing-id",
        },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [sourceNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [edge],
        rowCount: 1,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.code).toBe("wcag-valid-aria-reference");
    });

    it("should filter by WCAG level", async () => {
      const badNode = createTestNode({
        properties: {
          htmlElement: "div",
          potentialA11yIssue: true, // Level A issue
        },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [badNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate({ level: "A" });

      expect(result.issues.length).toBe(1);
    });

    it("should filter by specific rules", async () => {
      const badNode = createTestNode({
        properties: {
          htmlElement: "div",
          potentialA11yIssue: true,
          tabIndex: 5,
        },
      });

      mockSeedReader.readNodes.mockResolvedValue({
        rows: [badNode],
        rowCount: 1,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate({
        rules: ["wcag-no-positive-tabindex"],
      });

      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.code).toBe("wcag-no-positive-tabindex");
    });

    it("should use specified branch for seed data", async () => {
      mockSeedReader.readNodes.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      await validator.validate({ branch: "feature-branch" });

      expect(mockSeedReader.readNodes).toHaveBeenCalledWith("feature-branch");
      expect(mockSeedReader.readEdges).toHaveBeenCalledWith("feature-branch");
    });

    it("should handle seed reader errors gracefully", async () => {
      mockSeedReader.readNodes.mockRejectedValue(new Error("Failed to read seeds"));

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.success).toBe(false);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.message).toContain("Failed to read seeds");
      expect(result.errorCount).toBe(1);
    });

    it("should include timeMs in result", async () => {
      mockSeedReader.readNodes.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 5,
      });
      mockSeedReader.readEdges.mockResolvedValue({
        rows: [],
        rowCount: 0,
        timeMs: 2,
      });

      const validator = new WcagValidator(mockSeedReader as never);
      const result = await validator.validate();

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("createWcagValidator", () => {
  it("should create a WcagValidator instance", () => {
    const validator = createWcagValidator(mockSeedReader as never);
    expect(validator).toBeInstanceOf(WcagValidator);
  });
});
