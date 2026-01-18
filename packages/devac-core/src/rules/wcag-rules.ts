/**
 * WCAG Accessibility Rules
 *
 * Defines rules for validating WCAG compliance based on parsed JSX nodes and edges.
 * Part of DevAC Phase 2: WCAG Validation.
 */

import type { NodeKind, ParsedEdge, ParsedNode } from "../types/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * WCAG conformance level
 */
export type WcagLevel = "A" | "AA" | "AAA";

/**
 * Severity of WCAG violation
 */
export type WcagSeverity = "error" | "warning";

/**
 * Node kinds that can be checked by WCAG rules
 */
export type CheckableNodeKind = "html_element" | "jsx_component";

/**
 * Context available to WCAG rule checks
 */
export interface WcagContext {
  /** All nodes in the analysis */
  nodes: ParsedNode[];
  /** All edges in the analysis */
  edges: ParsedEdge[];
  /** Map of element IDs to their nodes (for ARIA reference validation) */
  elementIdMap: Map<string, ParsedNode>;
}

/**
 * A WCAG violation detected by a rule
 */
export interface WcagViolation {
  /** Rule ID that detected this violation */
  ruleId: string;
  /** Human-readable rule name */
  ruleName: string;
  /** WCAG success criterion (e.g., "2.1.1") */
  wcagCriterion: string;
  /** WCAG conformance level */
  wcagLevel: WcagLevel;
  /** Severity of the violation */
  severity: WcagSeverity;
  /** Detailed message describing the issue */
  message: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * A WCAG rule definition
 */
export interface WcagRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** WCAG success criterion this rule checks */
  wcagCriterion: string;
  /** WCAG conformance level */
  wcagLevel: WcagLevel;
  /** Description of what this rule checks */
  description: string;
  /** Default severity when rule is violated */
  severity: WcagSeverity;
  /** Node kinds this rule applies to */
  appliesTo: CheckableNodeKind[];
  /** Whether this rule is enabled by default */
  enabled: boolean;
  /**
   * Check function that returns a violation if the rule is violated
   * @param node - The node being checked
   * @param context - Context with all nodes and edges
   * @returns Violation if rule is violated, null otherwise
   */
  check: (node: ParsedNode, context: WcagContext) => WcagViolation | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a node has an accessible name via aria-label or aria-labelledby
 */
function hasAccessibleName(node: ParsedNode, context: WcagContext): boolean {
  const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;
  if (!ariaProps) return false;

  // Check for aria-label
  if (ariaProps["aria-label"] && ariaProps["aria-label"].trim().length > 0) {
    return true;
  }

  // Check for aria-labelledby with valid reference
  if (ariaProps["aria-labelledby"]) {
    const labelIds = ariaProps["aria-labelledby"].split(/\s+/).filter((id) => id.length > 0);
    // At least one referenced element should exist
    return labelIds.some((id) => context.elementIdMap.has(id));
  }

  return false;
}

/**
 * Check if an HTML element is a button or has button role
 */
function isButtonElement(node: ParsedNode): boolean {
  const htmlElement = node.properties.htmlElement as string | undefined;
  const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;

  if (htmlElement === "button") return true;
  if (ariaProps?.role === "button") return true;

  return false;
}

/**
 * Check if a node has text content indicator
 * Note: We can't know actual text content from static analysis,
 * but we can check for indicators like children prop or specific patterns
 */
function hasTextContentIndicator(node: ParsedNode): boolean {
  // Check if there's a children prop or similar indicator
  const props = node.properties.props as Record<string, unknown> | undefined;
  if (props?.children) return true;

  // For HTML elements, we assume text content if no explicit indicators of being empty
  // This is a conservative check - real DOM analysis would be more accurate
  return false;
}

// ============================================================================
// Rule Definitions
// ============================================================================

/**
 * WCAG 2.1.1 - Keyboard Accessible
 *
 * All functionality must be operable through a keyboard interface.
 * Elements with click handlers should also have keyboard handlers or be
 * natively interactive.
 */
const keyboardAccessibleRule: WcagRule = {
  id: "wcag-keyboard-accessible",
  name: "Keyboard Accessible",
  wcagCriterion: "2.1.1",
  wcagLevel: "A",
  description: "Interactive elements must be keyboard accessible",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, _context) => {
    // Check the potentialA11yIssue flag set during JSX parsing
    if (node.properties.potentialA11yIssue === true) {
      return {
        ruleId: "wcag-keyboard-accessible",
        ruleName: "Keyboard Accessible",
        wcagCriterion: "2.1.1",
        wcagLevel: "A",
        severity: "error",
        message:
          "Element has click handler but no keyboard support. Non-interactive elements with onClick need keyboard handlers.",
        suggestion:
          "Add onKeyDown/onKeyUp handler, use a native interactive element (button, a), or add role and tabIndex",
      };
    }
    return null;
  },
};

/**
 * WCAG 4.1.2 - Name, Role, Value (Accessible Name)
 *
 * Interactive elements must have an accessible name that describes their purpose.
 */
const accessibleNameRule: WcagRule = {
  id: "wcag-accessible-name",
  name: "Accessible Name Required",
  wcagCriterion: "4.1.2",
  wcagLevel: "A",
  description: "Interactive elements must have an accessible name",
  severity: "error",
  appliesTo: ["html_element", "jsx_component"],
  enabled: true,
  check: (node, context) => {
    // Only check elements marked as interactive
    if (node.properties.isInteractive !== true) return null;

    // Skip if it already has an accessible name
    if (hasAccessibleName(node, context)) return null;

    // Skip native elements that typically get their name from content
    const htmlElement = node.properties.htmlElement as string | undefined;
    const nativeNamedElements = new Set(["button", "a", "label", "input", "select", "textarea"]);
    if (htmlElement && nativeNamedElements.has(htmlElement)) {
      // These get names from content or associated labels
      // More sophisticated check would require DOM analysis
      return null;
    }

    // For interactive custom elements without accessible name
    const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;
    if (ariaProps?.role && !hasAccessibleName(node, context)) {
      return {
        ruleId: "wcag-accessible-name",
        ruleName: "Accessible Name Required",
        wcagCriterion: "4.1.2",
        wcagLevel: "A",
        severity: "error",
        message: `Interactive element with role="${ariaProps.role}" lacks an accessible name`,
        suggestion: "Add aria-label or aria-labelledby attribute",
      };
    }

    return null;
  },
};

/**
 * WCAG 1.3.1 - Info and Relationships (Valid ARIA References)
 *
 * ARIA ID references (aria-labelledby, aria-controls, etc.) must point to
 * existing elements.
 *
 * Note: This rule is checked at the edge level, not node level.
 * It's included here for documentation but the actual check happens in
 * the analyzer's checkAriaReferences function.
 */
const validAriaReferenceRule: WcagRule = {
  id: "wcag-valid-aria-reference",
  name: "Valid ARIA Reference",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "ARIA ID references must point to existing elements",
  severity: "warning",
  appliesTo: ["html_element", "jsx_component"],
  enabled: true,
  check: (_node, _context) => {
    // This check is performed at the edge level in the analyzer
    // because REFERENCES edges contain the ARIA relationship info
    return null;
  },
};

/**
 * WCAG 2.4.3 - Focus Order (No Positive TabIndex)
 *
 * Using tabIndex > 0 disrupts the natural focus order and should be avoided.
 */
const noPositiveTabIndexRule: WcagRule = {
  id: "wcag-no-positive-tabindex",
  name: "Avoid Positive TabIndex",
  wcagCriterion: "2.4.3",
  wcagLevel: "A",
  description: "Avoid using tabIndex values greater than 0",
  severity: "warning",
  appliesTo: ["html_element", "jsx_component"],
  enabled: true,
  check: (node, _context) => {
    const tabIndex = node.properties.tabIndex as number | undefined;

    if (tabIndex !== undefined && tabIndex > 0) {
      return {
        ruleId: "wcag-no-positive-tabindex",
        ruleName: "Avoid Positive TabIndex",
        wcagCriterion: "2.4.3",
        wcagLevel: "A",
        severity: "warning",
        message: `tabIndex="${tabIndex}" disrupts natural focus order`,
        suggestion:
          'Use tabIndex="0" for focusable elements or tabIndex="-1" for programmatic focus only',
      };
    }

    return null;
  },
};

/**
 * WCAG 4.1.2 - Name, Role, Value (Button Has Text)
 *
 * Button elements must have discernible text content or an accessible name.
 */
const buttonHasTextRule: WcagRule = {
  id: "wcag-button-has-text",
  name: "Button Must Have Text",
  wcagCriterion: "4.1.2",
  wcagLevel: "A",
  description: "Buttons must have text content or accessible name",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    if (!isButtonElement(node)) return null;

    // Check for accessible name
    if (hasAccessibleName(node, context)) return null;

    // Check for text content indicator
    if (hasTextContentIndicator(node)) return null;

    // Check for aria-label in regular props (might be passed differently)
    const props = node.properties.props as Record<string, unknown> | undefined;
    if (props?.["aria-label"]) return null;

    // If the button has children prop, assume it has content
    if (props?.children) return null;

    // For icon buttons or similar, flag if no accessible name
    // This is a heuristic - we can't know for certain without runtime analysis
    const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;
    if (!ariaProps?.["aria-label"] && !ariaProps?.["aria-labelledby"]) {
      // Only flag if we have some indication this might be an icon-only button
      // For now, we'll be conservative and only flag explicit icon buttons
      if (props?.icon || props?.iconOnly) {
        return {
          ruleId: "wcag-button-has-text",
          ruleName: "Button Must Have Text",
          wcagCriterion: "4.1.2",
          wcagLevel: "A",
          severity: "error",
          message: "Button appears to be icon-only but lacks accessible name",
          suggestion: "Add aria-label to describe the button's purpose",
        };
      }
    }

    return null;
  },
};

// ============================================================================
// Rule Registry
// ============================================================================

/**
 * All WCAG rules
 */
export const WCAG_RULES: WcagRule[] = [
  keyboardAccessibleRule,
  accessibleNameRule,
  validAriaReferenceRule,
  noPositiveTabIndexRule,
  buttonHasTextRule,
];

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all WCAG rules, optionally filtered by level
 *
 * @param level - Optional WCAG level filter (returns rules at or below this level)
 * @returns Array of matching rules
 */
export function getWcagRules(level?: WcagLevel): WcagRule[] {
  if (!level) {
    return WCAG_RULES.filter((rule) => rule.enabled);
  }

  const levelPriority: Record<WcagLevel, number> = {
    A: 1,
    AA: 2,
    AAA: 3,
  };

  const maxPriority = levelPriority[level];

  return WCAG_RULES.filter((rule) => rule.enabled && levelPriority[rule.wcagLevel] <= maxPriority);
}

/**
 * Get a specific WCAG rule by ID
 *
 * @param id - Rule ID
 * @returns The rule if found, undefined otherwise
 */
export function getWcagRuleById(id: string): WcagRule | undefined {
  return WCAG_RULES.find((rule) => rule.id === id);
}

/**
 * Get WCAG rules by criterion
 *
 * @param criterion - WCAG success criterion (e.g., "2.1.1")
 * @returns Array of rules checking this criterion
 */
export function getWcagRulesByCriterion(criterion: string): WcagRule[] {
  return WCAG_RULES.filter((rule) => rule.wcagCriterion === criterion);
}

/**
 * Check if a node kind is checkable by WCAG rules
 */
export function isCheckableNodeKind(kind: NodeKind): kind is CheckableNodeKind {
  return kind === "html_element" || kind === "jsx_component";
}
