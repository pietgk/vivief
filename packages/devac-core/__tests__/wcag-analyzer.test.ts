/**
 * Tests for WCAG Analyzer
 *
 * Part of DevAC Phase 2: WCAG Validation
 */

import { describe, expect, it } from "vitest";
import type { ParsedEdge, ParsedNode } from "../src/types/index.js";
import {
  analyzeWcag,
  filterIssuesBySeverity,
  getAnalysisSummary,
  getIssueCounts,
  groupIssuesByCriterion,
  groupIssuesByFile,
  groupIssuesBySeverity,
} from "../src/validation/wcag-analyzer.js";

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
// analyzeWcag Tests
// ============================================================================

describe("analyzeWcag", () => {
  it("should return empty issues for empty input", () => {
    const result = analyzeWcag([], []);

    expect(result.issues).toEqual([]);
    expect(result.checkedCount).toBe(0);
    expect(result.passedCount).toBe(0);
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it("should not check non-checkable node kinds", () => {
    const functionNode = createTestNode({
      kind: "function",
      name: "myFunction",
    });

    const result = analyzeWcag([functionNode], []);

    expect(result.checkedCount).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it("should check html_element nodes", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
      },
    });

    const result = analyzeWcag([node], []);

    expect(result.checkedCount).toBe(1);
  });

  it("should check jsx_component nodes", () => {
    const node = createTestNode({
      kind: "jsx_component",
      name: "MyComponent",
    });

    const result = analyzeWcag([node], []);

    expect(result.checkedCount).toBe(1);
  });

  it("should detect keyboard accessibility issues", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
      },
    });

    const result = analyzeWcag([node], []);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.ruleId).toBe("wcag-keyboard-accessible");
    expect(result.issues[0]?.severity).toBe("error");
    expect(result.issues[0]?.filePath).toBe("/test/file.tsx");
    expect(result.issues[0]?.line).toBe(10);
  });

  it("should detect positive tabIndex issues", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
        tabIndex: 5,
      },
    });

    const result = analyzeWcag([node], []);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.ruleId).toBe("wcag-no-positive-tabindex");
    expect(result.issues[0]?.severity).toBe("warning");
  });

  it("should detect multiple issues on same node", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
        tabIndex: 5,
      },
    });

    const result = analyzeWcag([node], []);

    expect(result.issues.length).toBe(2);
    const ruleIds = result.issues.map((i) => i.ruleId);
    expect(ruleIds).toContain("wcag-keyboard-accessible");
    expect(ruleIds).toContain("wcag-no-positive-tabindex");
  });

  it("should detect issues across multiple nodes", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      file_path: "/test/file1.tsx",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
      },
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      file_path: "/test/file2.tsx",
      properties: {
        htmlElement: "span",
        tabIndex: 10,
      },
    });

    const result = analyzeWcag([node1, node2], []);

    expect(result.issues.length).toBe(2);
    expect(result.checkedCount).toBe(2);
    expect(result.passedCount).toBe(0);
  });

  it("should count passed nodes correctly", () => {
    const goodNode = createTestNode({
      entity_id: "good-node",
      properties: {
        htmlElement: "button",
      },
    });
    const badNode = createTestNode({
      entity_id: "bad-node",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
      },
    });

    const result = analyzeWcag([goodNode, badNode], []);

    expect(result.checkedCount).toBe(2);
    expect(result.passedCount).toBe(1);
  });

  it("should filter rules by specific IDs", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
        tabIndex: 5,
      },
    });

    const result = analyzeWcag([node], [], {
      rules: ["wcag-no-positive-tabindex"],
    });

    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.ruleId).toBe("wcag-no-positive-tabindex");
  });

  it("should filter rules by WCAG level", () => {
    const node = createTestNode({
      kind: "html_element",
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
      },
    });

    // All our rules are Level A, so this should work
    const result = analyzeWcag([node], [], { level: "A" });

    expect(result.issues.length).toBe(1);
  });
});

// ============================================================================
// ARIA Reference Validation Tests
// ============================================================================

describe("ARIA Reference Validation", () => {
  it("should detect broken aria-labelledby reference", () => {
    const sourceNode = createTestNode({
      entity_id: "source-node",
      kind: "html_element",
      properties: {
        htmlElement: "div",
        ariaProps: {
          "aria-labelledby": "non-existent-label",
        },
      },
    });

    const edge = createTestEdge({
      source_entity_id: "source-node",
      target_entity_id: "non-existent-target",
      edge_type: "REFERENCES",
      properties: {
        ariaRelationType: "aria-labelledby",
        targetElementId: "non-existent-label",
      },
    });

    const result = analyzeWcag([sourceNode], [edge]);

    expect(result.issues.length).toBe(1);
    expect(result.issues[0]?.ruleId).toBe("wcag-valid-aria-reference");
    expect(result.issues[0]?.message).toContain("aria-labelledby");
    expect(result.issues[0]?.message).toContain("non-existent-label");
  });

  it("should not flag valid aria-labelledby reference", () => {
    const labelNode = createTestNode({
      entity_id: "label-node",
      kind: "html_element",
      properties: {
        htmlElement: "span",
        elementId: "my-label",
      },
    });

    const sourceNode = createTestNode({
      entity_id: "source-node",
      kind: "html_element",
      properties: {
        htmlElement: "div",
        ariaProps: {
          "aria-labelledby": "my-label",
        },
      },
    });

    const edge = createTestEdge({
      source_entity_id: "source-node",
      target_entity_id: "label-node",
      edge_type: "REFERENCES",
      properties: {
        ariaRelationType: "aria-labelledby",
        targetElementId: "my-label",
      },
    });

    const result = analyzeWcag([labelNode, sourceNode], [edge]);

    // No broken reference issues
    const ariaRefIssues = result.issues.filter((i) => i.ruleId === "wcag-valid-aria-reference");
    expect(ariaRefIssues.length).toBe(0);
  });

  it("should detect broken aria-controls reference", () => {
    const sourceNode = createTestNode({
      entity_id: "source-node",
      kind: "html_element",
      properties: {
        htmlElement: "button",
        ariaProps: {
          "aria-controls": "missing-panel",
        },
      },
    });

    const edge = createTestEdge({
      source_entity_id: "source-node",
      target_entity_id: "target",
      edge_type: "REFERENCES",
      properties: {
        ariaRelationType: "aria-controls",
        targetElementId: "missing-panel",
      },
    });

    const result = analyzeWcag([sourceNode], [edge]);

    const ariaRefIssues = result.issues.filter((i) => i.ruleId === "wcag-valid-aria-reference");
    expect(ariaRefIssues.length).toBe(1);
    expect(ariaRefIssues[0]?.message).toContain("aria-controls");
  });

  it("should ignore non-REFERENCES edges", () => {
    const node = createTestNode({
      entity_id: "source-node",
      kind: "html_element",
    });

    const edge = createTestEdge({
      source_entity_id: "source-node",
      target_entity_id: "target",
      edge_type: "CALLS", // Not REFERENCES
      properties: {
        ariaRelationType: "aria-labelledby",
        targetElementId: "some-id",
      },
    });

    const result = analyzeWcag([node], [edge]);

    const ariaRefIssues = result.issues.filter((i) => i.ruleId === "wcag-valid-aria-reference");
    expect(ariaRefIssues.length).toBe(0);
  });

  it("should ignore edges without ariaRelationType", () => {
    const node = createTestNode({
      entity_id: "source-node",
      kind: "html_element",
    });

    const edge = createTestEdge({
      source_entity_id: "source-node",
      target_entity_id: "target",
      edge_type: "REFERENCES",
      properties: {
        // No ariaRelationType
        targetElementId: "some-id",
      },
    });

    const result = analyzeWcag([node], [edge]);

    const ariaRefIssues = result.issues.filter((i) => i.ruleId === "wcag-valid-aria-reference");
    expect(ariaRefIssues.length).toBe(0);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("groupIssuesByFile", () => {
  it("should group issues by file path", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      file_path: "/test/file1.tsx",
      properties: { potentialA11yIssue: true },
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      file_path: "/test/file2.tsx",
      properties: { potentialA11yIssue: true },
    });
    const node3 = createTestNode({
      entity_id: "node-3",
      file_path: "/test/file1.tsx",
      properties: { tabIndex: 5 },
    });

    const result = analyzeWcag([node1, node2, node3], []);
    const grouped = groupIssuesByFile(result.issues);

    expect(grouped.size).toBe(2);
    expect(grouped.get("/test/file1.tsx")?.length).toBe(2);
    expect(grouped.get("/test/file2.tsx")?.length).toBe(1);
  });
});

describe("groupIssuesBySeverity", () => {
  it("should group issues by severity", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      properties: { potentialA11yIssue: true }, // error
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      properties: { tabIndex: 5 }, // warning
    });

    const result = analyzeWcag([node1, node2], []);
    const grouped = groupIssuesBySeverity(result.issues);

    expect(grouped.get("error")?.length).toBe(1);
    expect(grouped.get("warning")?.length).toBe(1);
  });
});

describe("groupIssuesByCriterion", () => {
  it("should group issues by WCAG criterion", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      properties: { potentialA11yIssue: true }, // 2.1.1
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      properties: { tabIndex: 5 }, // 2.4.3
    });

    const result = analyzeWcag([node1, node2], []);
    const grouped = groupIssuesByCriterion(result.issues);

    expect(grouped.get("2.1.1")?.length).toBe(1);
    expect(grouped.get("2.4.3")?.length).toBe(1);
  });
});

describe("getIssueCounts", () => {
  it("should count issues by rule ID", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      properties: { potentialA11yIssue: true },
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      properties: { potentialA11yIssue: true },
    });
    const node3 = createTestNode({
      entity_id: "node-3",
      properties: { tabIndex: 5 },
    });

    const result = analyzeWcag([node1, node2, node3], []);
    const counts = getIssueCounts(result.issues);

    expect(counts.get("wcag-keyboard-accessible")).toBe(2);
    expect(counts.get("wcag-no-positive-tabindex")).toBe(1);
  });
});

describe("filterIssuesBySeverity", () => {
  it("should filter to only specified severity", () => {
    const node1 = createTestNode({
      entity_id: "node-1",
      properties: { potentialA11yIssue: true }, // error
    });
    const node2 = createTestNode({
      entity_id: "node-2",
      properties: { tabIndex: 5 }, // warning
    });

    const result = analyzeWcag([node1, node2], []);

    const errors = filterIssuesBySeverity(result.issues, "error");
    expect(errors.length).toBe(1);
    expect(errors[0]?.severity).toBe("error");

    const warnings = filterIssuesBySeverity(result.issues, "warning");
    expect(warnings.length).toBe(1);
    expect(warnings[0]?.severity).toBe("warning");
  });
});

describe("getAnalysisSummary", () => {
  it("should calculate summary statistics", () => {
    const goodNode = createTestNode({
      entity_id: "good-node",
      properties: { htmlElement: "button" },
    });
    const badNode1 = createTestNode({
      entity_id: "bad-node-1",
      properties: { potentialA11yIssue: true },
    });
    const badNode2 = createTestNode({
      entity_id: "bad-node-2",
      properties: { tabIndex: 5 },
    });

    const result = analyzeWcag([goodNode, badNode1, badNode2], []);
    const summary = getAnalysisSummary(result);

    expect(summary.totalIssues).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.passRate).toBeCloseTo(33.33, 1);
    expect(summary.timeMs).toBeGreaterThanOrEqual(0);
  });

  it("should return 100% pass rate for no checked nodes", () => {
    const result = analyzeWcag([], []);
    const summary = getAnalysisSummary(result);

    expect(summary.passRate).toBe(100);
  });

  it("should return 100% pass rate when all nodes pass", () => {
    const goodNode1 = createTestNode({
      entity_id: "good-1",
      properties: { htmlElement: "button" },
    });
    const goodNode2 = createTestNode({
      entity_id: "good-2",
      properties: { htmlElement: "a" },
    });

    const result = analyzeWcag([goodNode1, goodNode2], []);
    const summary = getAnalysisSummary(result);

    expect(summary.passRate).toBe(100);
    expect(summary.totalIssues).toBe(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration Tests", () => {
  it("should handle a realistic component with multiple issues", () => {
    // Simulating a component like:
    // <div onClick={handleClick} tabIndex={2}>
    //   <button icon="close" iconOnly />
    //   <span aria-labelledby="missing-label">Text</span>
    // </div>

    const divNode = createTestNode({
      entity_id: "div-node",
      file_path: "/src/MyComponent.tsx",
      start_line: 5,
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true, // onClick without keyboard
        tabIndex: 2, // positive tabIndex
      },
    });

    const buttonNode = createTestNode({
      entity_id: "button-node",
      file_path: "/src/MyComponent.tsx",
      start_line: 6,
      properties: {
        htmlElement: "button",
        props: {
          icon: "close",
          iconOnly: true,
        },
        // Missing aria-label for icon-only button
      },
    });

    const spanNode = createTestNode({
      entity_id: "span-node",
      file_path: "/src/MyComponent.tsx",
      start_line: 7,
      properties: {
        htmlElement: "span",
        ariaProps: {
          "aria-labelledby": "missing-label",
        },
      },
    });

    const brokenRefEdge = createTestEdge({
      source_entity_id: "span-node",
      target_entity_id: "missing-target",
      edge_type: "REFERENCES",
      properties: {
        ariaRelationType: "aria-labelledby",
        targetElementId: "missing-label",
      },
    });

    const result = analyzeWcag([divNode, buttonNode, spanNode], [brokenRefEdge]);

    // Expected issues:
    // 1. div: potentialA11yIssue (keyboard accessible)
    // 2. div: positive tabIndex
    // 3. button: icon-only without aria-label
    // 4. span: broken aria-labelledby reference (detected via edge)

    expect(result.issues.length).toBe(4);
    expect(result.checkedCount).toBe(3);
    // passedCount is 1 because the spanNode itself doesn't have node-level issues
    // (the broken ARIA reference is detected via the edge, not the node)
    expect(result.passedCount).toBe(1);

    // Verify all issues are from the same file
    const grouped = groupIssuesByFile(result.issues);
    expect(grouped.size).toBe(1);
    expect(grouped.get("/src/MyComponent.tsx")?.length).toBe(4);
  });

  it("should handle a well-formed accessible component", () => {
    const buttonNode = createTestNode({
      entity_id: "button-node",
      properties: {
        htmlElement: "button",
        props: {
          children: "Submit",
        },
      },
    });

    const inputNode = createTestNode({
      entity_id: "input-node",
      properties: {
        htmlElement: "input",
        elementId: "email-input",
        ariaProps: {
          "aria-labelledby": "email-label",
        },
      },
    });

    const labelNode = createTestNode({
      entity_id: "label-node",
      properties: {
        htmlElement: "label",
        elementId: "email-label",
      },
    });

    const validRefEdge = createTestEdge({
      source_entity_id: "input-node",
      target_entity_id: "label-node",
      edge_type: "REFERENCES",
      properties: {
        ariaRelationType: "aria-labelledby",
        targetElementId: "email-label",
      },
    });

    const result = analyzeWcag([buttonNode, inputNode, labelNode], [validRefEdge]);

    expect(result.issues.length).toBe(0);
    expect(result.checkedCount).toBe(3);
    expect(result.passedCount).toBe(3);

    const summary = getAnalysisSummary(result);
    expect(summary.passRate).toBe(100);
  });
});
