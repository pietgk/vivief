/**
 * Tests for WCAG Rules
 *
 * Part of DevAC Phase 2: WCAG Validation
 */

import { describe, expect, it } from "vitest";
import {
  WCAG_RULES,
  type WcagContext,
  getWcagRuleById,
  getWcagRules,
  getWcagRulesByCriterion,
  isCheckableNodeKind,
} from "../src/rules/wcag-rules.js";
import type { ParsedNode } from "../src/types/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(overrides: Partial<ParsedNode> = {}): ParsedNode {
  return {
    entity_id: "test-node-1",
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

function createTestContext(nodes: ParsedNode[] = []): WcagContext {
  const elementIdMap = new Map<string, ParsedNode>();
  for (const node of nodes) {
    const elementId = node.properties.elementId as string | undefined;
    if (elementId) {
      elementIdMap.set(elementId, node);
    }
  }
  return {
    nodes,
    edges: [],
    elementIdMap,
  };
}

// ============================================================================
// Rule Registry Tests
// ============================================================================

describe("WCAG_RULES", () => {
  it("should have all expected rules defined", () => {
    const ruleIds = WCAG_RULES.map((r) => r.id);
    expect(ruleIds).toContain("wcag-keyboard-accessible");
    expect(ruleIds).toContain("wcag-accessible-name");
    expect(ruleIds).toContain("wcag-valid-aria-reference");
    expect(ruleIds).toContain("wcag-no-positive-tabindex");
    expect(ruleIds).toContain("wcag-button-has-text");
  });

  it("should have all rules enabled by default", () => {
    for (const rule of WCAG_RULES) {
      expect(rule.enabled).toBe(true);
    }
  });

  it("should have all rules at Level A", () => {
    // All our initial rules are Level A
    for (const rule of WCAG_RULES) {
      expect(rule.wcagLevel).toBe("A");
    }
  });
});

// ============================================================================
// Query Function Tests
// ============================================================================

describe("getWcagRules", () => {
  it("should return all enabled rules when no level specified", () => {
    const rules = getWcagRules();
    expect(rules.length).toBe(WCAG_RULES.length);
  });

  it("should filter rules by level A", () => {
    const rules = getWcagRules("A");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.wcagLevel).toBe("A");
    }
  });

  it("should include A and AA rules when level is AA", () => {
    const rules = getWcagRules("AA");
    // Should include all A rules (we don't have AA rules yet)
    expect(rules.length).toBe(WCAG_RULES.length);
  });

  it("should include all rules when level is AAA", () => {
    const rules = getWcagRules("AAA");
    expect(rules.length).toBe(WCAG_RULES.length);
  });
});

describe("getWcagRuleById", () => {
  it("should find existing rule by ID", () => {
    const rule = getWcagRuleById("wcag-keyboard-accessible");
    expect(rule).toBeDefined();
    expect(rule?.name).toBe("Keyboard Accessible");
  });

  it("should return undefined for non-existent rule", () => {
    const rule = getWcagRuleById("non-existent-rule");
    expect(rule).toBeUndefined();
  });
});

describe("getWcagRulesByCriterion", () => {
  it("should find rules by WCAG criterion", () => {
    const rules = getWcagRulesByCriterion("2.1.1");
    expect(rules.length).toBe(1);
    expect(rules[0]?.id).toBe("wcag-keyboard-accessible");
  });

  it("should find multiple rules for same criterion", () => {
    // 4.1.2 is used by both accessible-name and button-has-text
    const rules = getWcagRulesByCriterion("4.1.2");
    expect(rules.length).toBe(2);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("wcag-accessible-name");
    expect(ids).toContain("wcag-button-has-text");
  });

  it("should return empty array for non-existent criterion", () => {
    const rules = getWcagRulesByCriterion("9.9.9");
    expect(rules).toEqual([]);
  });
});

describe("isCheckableNodeKind", () => {
  it("should return true for html_element", () => {
    expect(isCheckableNodeKind("html_element")).toBe(true);
  });

  it("should return true for jsx_component", () => {
    expect(isCheckableNodeKind("jsx_component")).toBe(true);
  });

  it("should return false for other node kinds", () => {
    expect(isCheckableNodeKind("function")).toBe(false);
    expect(isCheckableNodeKind("class")).toBe(false);
    expect(isCheckableNodeKind("variable")).toBe(false);
  });
});

// ============================================================================
// Keyboard Accessible Rule Tests
// ============================================================================

describe("wcag-keyboard-accessible rule", () => {
  const rule = getWcagRuleById("wcag-keyboard-accessible")!;

  it("should detect elements with potentialA11yIssue flag", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        potentialA11yIssue: true,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-keyboard-accessible");
    expect(violation?.severity).toBe("error");
  });

  it("should not flag elements without potentialA11yIssue", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        potentialA11yIssue: false,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag elements with no potentialA11yIssue property", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// Accessible Name Rule Tests
// ============================================================================

describe("wcag-accessible-name rule", () => {
  const rule = getWcagRuleById("wcag-accessible-name")!;

  it("should not flag non-interactive elements", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        isInteractive: false,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag interactive elements with aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        isInteractive: true,
        ariaProps: {
          role: "button",
          "aria-label": "Submit form",
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag interactive elements with valid aria-labelledby", () => {
    const labelNode = createTestNode({
      entity_id: "label-node",
      properties: {
        elementId: "submit-label",
      },
    });
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        isInteractive: true,
        ariaProps: {
          role: "button",
          "aria-labelledby": "submit-label",
        },
      },
    });
    const context = createTestContext([labelNode, node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should flag interactive element with role but no accessible name", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        isInteractive: true,
        ariaProps: {
          role: "button",
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-accessible-name");
  });

  it("should not flag native button elements", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
        isInteractive: true,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// No Positive TabIndex Rule Tests
// ============================================================================

describe("wcag-no-positive-tabindex rule", () => {
  const rule = getWcagRuleById("wcag-no-positive-tabindex")!;

  it("should flag elements with positive tabIndex", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        tabIndex: 1,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-no-positive-tabindex");
    expect(violation?.severity).toBe("warning");
    expect(violation?.message).toContain('tabIndex="1"');
  });

  it("should flag high positive tabIndex values", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "input",
        tabIndex: 100,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.message).toContain('tabIndex="100"');
  });

  it("should not flag tabIndex=0", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        tabIndex: 0,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag tabIndex=-1", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        tabIndex: -1,
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag elements without tabIndex", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// Button Has Text Rule Tests
// ============================================================================

describe("wcag-button-has-text rule", () => {
  const rule = getWcagRuleById("wcag-button-has-text")!;

  it("should not flag non-button elements", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag button with aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
        ariaProps: {
          "aria-label": "Close dialog",
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag button with children prop", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
        props: {
          children: "Click me",
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should flag icon-only button without aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
        props: {
          icon: "close",
          iconOnly: true,
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-button-has-text");
    expect(violation?.message).toContain("icon-only");
  });

  it("should not flag element with button role and aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: {
          role: "button",
          "aria-label": "Toggle menu",
        },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// Valid ARIA Reference Rule Tests
// ============================================================================

describe("wcag-valid-aria-reference rule", () => {
  const rule = getWcagRuleById("wcag-valid-aria-reference")!;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("wcag-valid-aria-reference");
    expect(rule.wcagCriterion).toBe("1.3.1");
    expect(rule.severity).toBe("warning");
  });

  it("should return null from check (edge-level check happens in analyzer)", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: {
          "aria-labelledby": "non-existent-id",
        },
      },
    });
    const context = createTestContext([node]);

    // The node-level check always returns null
    // The actual check happens at edge level in the analyzer
    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// Rule Metadata Tests
// ============================================================================

describe("Rule Metadata", () => {
  it("all rules should have required properties", () => {
    for (const rule of WCAG_RULES) {
      expect(rule.id).toBeDefined();
      expect(rule.name).toBeDefined();
      expect(rule.wcagCriterion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(["A", "AA", "AAA"]).toContain(rule.wcagLevel);
      expect(rule.description).toBeDefined();
      expect(["error", "warning"]).toContain(rule.severity);
      expect(rule.appliesTo.length).toBeGreaterThan(0);
      expect(typeof rule.enabled).toBe("boolean");
      expect(typeof rule.check).toBe("function");
    }
  });

  it("all rules should have unique IDs", () => {
    const ids = WCAG_RULES.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
