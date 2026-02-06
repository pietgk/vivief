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

/**
 * Helper to get a rule by ID with assertion that it exists
 */
function getRequiredRule(ruleId: string) {
  const rule = getWcagRuleById(ruleId);
  if (!rule) {
    throw new Error(`Rule ${ruleId} not found`);
  }
  return rule;
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
    // Original rules
    expect(ruleIds).toContain("wcag-keyboard-accessible");
    expect(ruleIds).toContain("wcag-accessible-name");
    expect(ruleIds).toContain("wcag-valid-aria-reference");
    expect(ruleIds).toContain("wcag-no-positive-tabindex");
    expect(ruleIds).toContain("wcag-button-has-text");
    // New rules
    expect(ruleIds).toContain("wcag-form-label");
    expect(ruleIds).toContain("wcag-heading-order");
    expect(ruleIds).toContain("wcag-semantic-elements");
    expect(ruleIds).toContain("wcag-aria-hidden-focus");
    expect(ruleIds).toContain("wcag-list-structure");
    expect(ruleIds).toContain("wcag-image-alt");
    expect(ruleIds).toContain("wcag-link-name");
    expect(ruleIds).toContain("wcag-table-headers");
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
    // 4.1.2 is used by accessible-name, button-has-text, and aria-hidden-focus
    const rules = getWcagRulesByCriterion("4.1.2");
    expect(rules.length).toBe(3);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("wcag-accessible-name");
    expect(ids).toContain("wcag-button-has-text");
    expect(ids).toContain("wcag-aria-hidden-focus");
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
  const rule = getRequiredRule("wcag-keyboard-accessible");

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
  const rule = getRequiredRule("wcag-accessible-name");

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
  const rule = getRequiredRule("wcag-no-positive-tabindex");

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
  const rule = getRequiredRule("wcag-button-has-text");

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
  const rule = getRequiredRule("wcag-valid-aria-reference");

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
// Form Label Rule Tests
// ============================================================================

describe("wcag-form-label rule", () => {
  const rule = getRequiredRule("wcag-form-label");

  it("should flag input without label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "input",
        props: { type: "text" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-form-label");
  });

  it("should not flag hidden inputs", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "input",
        props: { type: "hidden" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag input with aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "input",
        ariaProps: { "aria-label": "Email address" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag input with associated label via htmlFor", () => {
    const labelNode = createTestNode({
      entity_id: "label-node",
      properties: {
        htmlElement: "label",
        htmlFor: "email-input",
      },
    });
    const inputNode = createTestNode({
      entity_id: "input-node",
      properties: {
        htmlElement: "input",
        elementId: "email-input",
      },
    });
    const context = createTestContext([labelNode, inputNode]);

    const violation = rule.check(inputNode, context);
    expect(violation).toBeNull();
  });

  it("should not flag select with aria-labelledby", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "select",
        ariaProps: { "aria-labelledby": "select-label" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-labelable elements", () => {
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
// Heading Order Rule Tests
// ============================================================================

describe("wcag-heading-order rule", () => {
  const rule = getRequiredRule("wcag-heading-order");

  it("should flag skipped heading levels (h1 -> h3)", () => {
    const h1 = createTestNode({
      entity_id: "h1-node",
      properties: { htmlElement: "h1" },
      start_line: 10,
    });
    const h3 = createTestNode({
      entity_id: "h3-node",
      properties: { htmlElement: "h3" },
      start_line: 20,
    });
    const context = createTestContext([h1, h3]);

    const violation = rule.check(h3, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-heading-order");
    expect(violation?.message).toContain("h1 to h3");
  });

  it("should not flag proper heading sequence (h1 -> h2)", () => {
    const h1 = createTestNode({
      entity_id: "h1-node",
      properties: { htmlElement: "h1" },
      start_line: 10,
    });
    const h2 = createTestNode({
      entity_id: "h2-node",
      properties: { htmlElement: "h2" },
      start_line: 20,
    });
    const context = createTestContext([h1, h2]);

    const violation = rule.check(h2, context);
    expect(violation).toBeNull();
  });

  it("should not flag first heading in file", () => {
    const h2 = createTestNode({
      entity_id: "h2-node",
      properties: { htmlElement: "h2" },
      start_line: 10,
    });
    const context = createTestContext([h2]);

    const violation = rule.check(h2, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-heading elements", () => {
    const node = createTestNode({
      properties: { htmlElement: "div" },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// Semantic Elements Rule Tests
// ============================================================================

describe("wcag-semantic-elements rule", () => {
  const rule = getRequiredRule("wcag-semantic-elements");

  it("should flag div with role=navigation", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: { role: "navigation" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.message).toContain("<nav>");
  });

  it("should flag div with role=main", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: { role: "main" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.message).toContain("<main>");
  });

  it("should not flag semantic elements", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "nav",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag divs without roles", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag divs with roles that have no semantic alternative", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: { role: "presentation" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });
});

// ============================================================================
// ARIA Hidden Focus Rule Tests
// ============================================================================

describe("wcag-aria-hidden-focus rule", () => {
  const rule = getRequiredRule("wcag-aria-hidden-focus");

  it("should flag focusable element with aria-hidden=true", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "button",
        ariaProps: { "aria-hidden": "true" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-aria-hidden-focus");
  });

  it("should flag input with aria-hidden=true", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "input",
        ariaProps: { "aria-hidden": "true" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
  });

  it("should flag link with aria-hidden=true", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: { href: "/home" },
        ariaProps: { "aria-hidden": "true" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
  });

  it("should not flag non-focusable element with aria-hidden=true", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "div",
        ariaProps: { "aria-hidden": "true" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag focusable element without aria-hidden", () => {
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
// List Structure Rule Tests
// ============================================================================

describe("wcag-list-structure rule", () => {
  const rule = getRequiredRule("wcag-list-structure");

  it("should flag li without parent list in file", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "li",
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-list-structure");
  });

  it("should not flag li with ul parent in file", () => {
    const ulNode = createTestNode({
      entity_id: "ul-node",
      properties: { htmlElement: "ul" },
      start_line: 10,
    });
    const liNode = createTestNode({
      entity_id: "li-node",
      properties: { htmlElement: "li" },
      start_line: 11,
    });
    const context = createTestContext([ulNode, liNode]);

    const violation = rule.check(liNode, context);
    expect(violation).toBeNull();
  });

  it("should not flag li with ol parent in file", () => {
    const olNode = createTestNode({
      entity_id: "ol-node",
      properties: { htmlElement: "ol" },
      start_line: 10,
    });
    const liNode = createTestNode({
      entity_id: "li-node",
      properties: { htmlElement: "li" },
      start_line: 11,
    });
    const context = createTestContext([olNode, liNode]);

    const violation = rule.check(liNode, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-li elements", () => {
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
// Image Alt Rule Tests
// ============================================================================

describe("wcag-image-alt rule", () => {
  const rule = getRequiredRule("wcag-image-alt");

  it("should flag img without alt attribute", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-image-alt");
    expect(violation?.wcagCriterion).toBe("1.1.1");
  });

  it("should not flag img with alt attribute", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png", alt: "Test image" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag img with empty alt (decorative)", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png", alt: "" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag img with aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png" },
        ariaProps: { "aria-label": "Test image" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag img with role=presentation", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png" },
        ariaProps: { role: "presentation" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag img with role=none", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png" },
        ariaProps: { role: "none" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag img with aria-hidden=true", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "img",
        props: { src: "test.png" },
        ariaProps: { "aria-hidden": "true" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-img elements", () => {
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
// Link Name Rule Tests
// ============================================================================

describe("wcag-link-name rule", () => {
  const rule = getRequiredRule("wcag-link-name");

  it("should flag link without accessible name", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: { href: "/home" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-link-name");
    expect(violation?.wcagCriterion).toBe("2.4.4");
  });

  it("should not flag link with children (text content)", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: { href: "/home", children: "Go home" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag link with aria-label", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: { href: "/home" },
        ariaProps: { "aria-label": "Navigate home" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag link with title attribute", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: { href: "/home", title: "Home page" },
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag anchor without href", () => {
    const node = createTestNode({
      properties: {
        htmlElement: "a",
        props: {},
      },
    });
    const context = createTestContext([node]);

    const violation = rule.check(node, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-link elements", () => {
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
// Table Headers Rule Tests
// ============================================================================

describe("wcag-table-headers rule", () => {
  const rule = getRequiredRule("wcag-table-headers");

  it("should flag th without scope when multiple th exist", () => {
    const th1 = createTestNode({
      entity_id: "th1",
      properties: { htmlElement: "th" },
    });
    const th2 = createTestNode({
      entity_id: "th2",
      properties: { htmlElement: "th" },
    });
    const context = createTestContext([th1, th2]);

    const violation = rule.check(th1, context);
    expect(violation).not.toBeNull();
    expect(violation?.ruleId).toBe("wcag-table-headers");
  });

  it("should not flag th with scope attribute", () => {
    const th1 = createTestNode({
      entity_id: "th1",
      properties: { htmlElement: "th", props: { scope: "col" } },
    });
    const th2 = createTestNode({
      entity_id: "th2",
      properties: { htmlElement: "th", props: { scope: "col" } },
    });
    const context = createTestContext([th1, th2]);

    const violation = rule.check(th1, context);
    expect(violation).toBeNull();
  });

  it("should not flag single th in simple table", () => {
    const th = createTestNode({
      properties: { htmlElement: "th" },
    });
    const context = createTestContext([th]);

    const violation = rule.check(th, context);
    expect(violation).toBeNull();
  });

  it("should not flag non-th elements", () => {
    const node = createTestNode({
      properties: { htmlElement: "td" },
    });
    const context = createTestContext([node]);

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
