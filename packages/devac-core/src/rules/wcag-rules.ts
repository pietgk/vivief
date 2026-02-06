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

/**
 * Check if an HTML element is a form input that needs a label
 */
function isLabelableElement(htmlElement: string | undefined): boolean {
  const labelableElements = new Set(["input", "select", "textarea", "meter", "progress", "output"]);
  return htmlElement !== undefined && labelableElements.has(htmlElement);
}

/**
 * Check if an input has an associated label via htmlFor/id or wrapping
 */
function hasAssociatedLabel(node: ParsedNode, context: WcagContext): boolean {
  const elementId = node.properties.elementId as string | undefined;
  const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;

  // Check for aria-label or aria-labelledby
  if (ariaProps?.["aria-label"] || ariaProps?.["aria-labelledby"]) {
    return true;
  }

  // Check if there's a label element referencing this input's ID
  if (elementId) {
    for (const otherNode of context.nodes) {
      if (otherNode.properties.htmlElement === "label") {
        const labelFor = otherNode.properties.htmlFor as string | undefined;
        if (labelFor === elementId) {
          return true;
        }
      }
    }
  }

  // Check if input is wrapped by a label (implicit association)
  // This would require parent-child relationship tracking

  return false;
}

/**
 * Get heading level from element name (h1-h6)
 */
function getHeadingLevel(htmlElement: string | undefined): number | null {
  if (!htmlElement) return null;
  const match = htmlElement.match(/^h([1-6])$/);
  if (!match || match[1] === undefined) return null;
  return Number.parseInt(match[1], 10);
}

/**
 * Check if an element is focusable
 */
function isFocusable(node: ParsedNode): boolean {
  const htmlElement = node.properties.htmlElement as string | undefined;
  const tabIndex = node.properties.tabIndex as number | undefined;
  const props = node.properties.props as Record<string, unknown> | undefined;

  // Elements with explicit tabIndex >= 0 are focusable
  if (tabIndex !== undefined && tabIndex >= 0) {
    return true;
  }

  // Natively focusable elements
  const nativelyFocusable = new Set([
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "details",
    "summary",
  ]);

  // Links are only focusable if they have href
  if (htmlElement === "a") {
    return props?.href !== undefined;
  }

  return htmlElement !== undefined && nativelyFocusable.has(htmlElement);
}

/**
 * Get semantic role mapping for HTML elements
 * Reserved for future WCAG rule implementations
 */
function _getImplicitRole(htmlElement: string | undefined): string | null {
  const roleMap: Record<string, string> = {
    article: "article",
    aside: "complementary",
    button: "button",
    footer: "contentinfo",
    form: "form",
    header: "banner",
    main: "main",
    nav: "navigation",
    section: "region",
    table: "table",
    ul: "list",
    ol: "list",
    li: "listitem",
    dl: "list",
    dt: "term",
    dd: "definition",
    img: "img",
    a: "link",
  };

  return htmlElement ? (roleMap[htmlElement] ?? null) : null;
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

/**
 * WCAG 1.3.1 - Info and Relationships (Form Label)
 *
 * Form inputs must have associated labels for screen reader users.
 */
const formLabelRule: WcagRule = {
  id: "wcag-form-label",
  name: "Form Input Needs Label",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "Form inputs must have associated labels",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;

    // Only check labelable elements
    if (!isLabelableElement(htmlElement)) return null;

    // Skip hidden inputs
    const props = node.properties.props as Record<string, unknown> | undefined;
    if (props?.type === "hidden") return null;

    // Check if it has an associated label
    if (hasAssociatedLabel(node, context)) return null;

    return {
      ruleId: "wcag-form-label",
      ruleName: "Form Input Needs Label",
      wcagCriterion: "1.3.1",
      wcagLevel: "A",
      severity: "error",
      message: `${htmlElement} element does not have an associated label`,
      suggestion:
        "Add a <label> element with htmlFor matching the input's id, or add aria-label/aria-labelledby",
    };
  },
};

/**
 * WCAG 1.3.1 - Info and Relationships (Heading Order)
 *
 * Headings should follow a logical order without skipping levels.
 * This is checked at the file level during analysis.
 */
const headingOrderRule: WcagRule = {
  id: "wcag-heading-order",
  name: "Heading Order",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "Headings should follow a logical order without skipping levels",
  severity: "warning",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;
    const currentLevel = getHeadingLevel(htmlElement);

    if (currentLevel === null) return null;

    // Find all headings in the same file
    const fileHeadings = context.nodes
      .filter(
        (n) =>
          n.file_path === node.file_path &&
          getHeadingLevel(n.properties.htmlElement as string | undefined) !== null
      )
      .sort((a, b) => a.start_line - b.start_line);

    // Find the previous heading
    const currentIndex = fileHeadings.findIndex((h) => h.entity_id === node.entity_id);
    if (currentIndex <= 0) return null; // First heading or not found

    const prevHeading = fileHeadings[currentIndex - 1];
    if (!prevHeading) return null;

    const prevLevel = getHeadingLevel(prevHeading.properties.htmlElement as string | undefined);
    if (prevLevel === null) return null;

    // Check if we skipped levels (e.g., h1 -> h3)
    if (currentLevel > prevLevel + 1) {
      return {
        ruleId: "wcag-heading-order",
        ruleName: "Heading Order",
        wcagCriterion: "1.3.1",
        wcagLevel: "A",
        severity: "warning",
        message: `Heading level skipped from h${prevLevel} to h${currentLevel}`,
        suggestion: `Use h${prevLevel + 1} instead of h${currentLevel} to maintain logical heading order`,
      };
    }

    return null;
  },
};

/**
 * WCAG 1.3.1 - Info and Relationships (Semantic Elements)
 *
 * Prefer semantic HTML elements over divs/spans with ARIA roles.
 */
const semanticElementsRule: WcagRule = {
  id: "wcag-semantic-elements",
  name: "Prefer Semantic Elements",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "Prefer semantic HTML elements over divs with ARIA roles",
  severity: "warning",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, _context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;
    const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;

    // Only check div/span elements
    if (htmlElement !== "div" && htmlElement !== "span") return null;

    const role = ariaProps?.role;
    if (!role) return null;

    // Map ARIA roles to semantic elements
    const semanticAlternatives: Record<string, string> = {
      banner: "header",
      complementary: "aside",
      contentinfo: "footer",
      form: "form",
      main: "main",
      navigation: "nav",
      region: "section",
      article: "article",
      button: "button",
      link: "a",
      list: "ul or ol",
      listitem: "li",
      heading: "h1-h6",
      img: "img",
      table: "table",
      row: "tr",
      cell: "td",
      rowheader: "th",
      columnheader: "th",
    };

    const alternative = semanticAlternatives[role];
    if (alternative) {
      return {
        ruleId: "wcag-semantic-elements",
        ruleName: "Prefer Semantic Elements",
        wcagCriterion: "1.3.1",
        wcagLevel: "A",
        severity: "warning",
        message: `Use <${alternative}> instead of <${htmlElement} role="${role}">`,
        suggestion: `Replace with the semantic <${alternative}> element for better accessibility and SEO`,
      };
    }

    return null;
  },
};

/**
 * WCAG 4.1.2 - Name, Role, Value (ARIA Hidden Focus)
 *
 * Focusable elements should not be inside aria-hidden containers.
 */
const ariaHiddenFocusRule: WcagRule = {
  id: "wcag-aria-hidden-focus",
  name: "No Focusable Inside aria-hidden",
  wcagCriterion: "4.1.2",
  wcagLevel: "A",
  description: "Focusable elements must not be inside aria-hidden containers",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, _context) => {
    // Check if this element is focusable
    if (!isFocusable(node)) return null;

    // Check if it has aria-hidden="true"
    const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;
    if (ariaProps?.["aria-hidden"] === "true") {
      return {
        ruleId: "wcag-aria-hidden-focus",
        ruleName: "No Focusable Inside aria-hidden",
        wcagCriterion: "4.1.2",
        wcagLevel: "A",
        severity: "error",
        message:
          'Focusable element has aria-hidden="true", making it invisible to screen readers but still focusable',
        suggestion: 'Remove aria-hidden or add tabindex="-1" to prevent focus',
      };
    }

    // Note: Checking if an ancestor has aria-hidden would require parent-child relationships
    // which are not currently tracked in the node structure

    return null;
  },
};

/**
 * WCAG 1.3.1 - Info and Relationships (List Structure)
 *
 * List items (li) must be direct children of ul, ol, or menu elements.
 * Note: This is a simplified check - full validation requires parent-child tracking.
 */
const listStructureRule: WcagRule = {
  id: "wcag-list-structure",
  name: "Valid List Structure",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "List items must be properly nested within list containers",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;

    // Check for li elements
    if (htmlElement !== "li") return null;

    // Check if there's a parent list in the file
    // This is a heuristic - proper check would need parent-child relationships
    const parentCandidates = context.nodes.filter(
      (n) =>
        n.file_path === node.file_path &&
        n.start_line <= node.start_line &&
        (n.properties.htmlElement === "ul" ||
          n.properties.htmlElement === "ol" ||
          n.properties.htmlElement === "menu")
    );

    // If no list container found in file, flag it
    if (parentCandidates.length === 0) {
      return {
        ruleId: "wcag-list-structure",
        ruleName: "Valid List Structure",
        wcagCriterion: "1.3.1",
        wcagLevel: "A",
        severity: "error",
        message: "List item <li> appears without a parent list container",
        suggestion: "Wrap <li> elements in <ul>, <ol>, or <menu>",
      };
    }

    return null;
  },
};

/**
 * WCAG 1.1.1 - Non-text Content (Image Alt)
 *
 * Images must have alt text describing their content.
 */
const imageAltRule: WcagRule = {
  id: "wcag-image-alt",
  name: "Images Need Alt Text",
  wcagCriterion: "1.1.1",
  wcagLevel: "A",
  description: "Images must have alternative text",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, _context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;

    if (htmlElement !== "img") return null;

    const props = node.properties.props as Record<string, unknown> | undefined;
    const ariaProps = node.properties.ariaProps as Record<string, string> | undefined;

    // Check for alt attribute
    if (props?.alt !== undefined) return null;

    // Check for aria-label or aria-labelledby
    if (ariaProps?.["aria-label"] || ariaProps?.["aria-labelledby"]) return null;

    // Check for role="presentation" or role="none" (decorative images)
    if (ariaProps?.role === "presentation" || ariaProps?.role === "none") return null;

    // Check for aria-hidden="true" (hidden from AT)
    if (ariaProps?.["aria-hidden"] === "true") return null;

    return {
      ruleId: "wcag-image-alt",
      ruleName: "Images Need Alt Text",
      wcagCriterion: "1.1.1",
      wcagLevel: "A",
      severity: "error",
      message: "Image is missing alt attribute",
      suggestion:
        'Add alt="description" for informative images, or alt="" with role="presentation" for decorative images',
    };
  },
};

/**
 * WCAG 2.4.4 - Link Purpose (Link Name)
 *
 * Links must have an accessible name that describes their purpose.
 */
const linkNameRule: WcagRule = {
  id: "wcag-link-name",
  name: "Links Need Accessible Name",
  wcagCriterion: "2.4.4",
  wcagLevel: "A",
  description: "Links must have discernible text that describes their purpose",
  severity: "error",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;

    if (htmlElement !== "a") return null;

    const props = node.properties.props as Record<string, unknown> | undefined;

    // Links without href are not really links
    if (!props?.href) return null;

    // Check for aria-label or aria-labelledby
    if (hasAccessibleName(node, context)) return null;

    // Check for children prop (has text content)
    if (hasTextContentIndicator(node)) return null;

    // Check for title attribute (fallback accessible name)
    if (props?.title) return null;

    return {
      ruleId: "wcag-link-name",
      ruleName: "Links Need Accessible Name",
      wcagCriterion: "2.4.4",
      wcagLevel: "A",
      severity: "error",
      message: "Link has no discernible text or accessible name",
      suggestion:
        "Add text content inside the link, or use aria-label to describe the link purpose",
    };
  },
};

/**
 * WCAG 1.3.1 - Info and Relationships (Table Headers)
 *
 * Table header cells should have scope attribute to clarify row/column association.
 */
const tableHeadersRule: WcagRule = {
  id: "wcag-table-headers",
  name: "Table Headers Need Scope",
  wcagCriterion: "1.3.1",
  wcagLevel: "A",
  description: "Table header cells should have scope attribute",
  severity: "warning",
  appliesTo: ["html_element"],
  enabled: true,
  check: (node, context) => {
    const htmlElement = node.properties.htmlElement as string | undefined;

    if (htmlElement !== "th") return null;

    const props = node.properties.props as Record<string, unknown> | undefined;

    // Check if scope is defined
    if (props?.scope) return null;

    // Check if this is part of a simple table (only one row of headers)
    // For simple tables, scope is optional but recommended
    const tableHeaders = context.nodes.filter(
      (n) => n.file_path === node.file_path && n.properties.htmlElement === "th"
    );

    // If there are multiple th elements, scope becomes more important
    if (tableHeaders.length > 1) {
      return {
        ruleId: "wcag-table-headers",
        ruleName: "Table Headers Need Scope",
        wcagCriterion: "1.3.1",
        wcagLevel: "A",
        severity: "warning",
        message: "Table header cell is missing scope attribute",
        suggestion: 'Add scope="col" for column headers or scope="row" for row headers',
      };
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
  formLabelRule,
  headingOrderRule,
  semanticElementsRule,
  ariaHiddenFocusRule,
  listStructureRule,
  imageAltRule,
  linkNameRule,
  tableHeadersRule,
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
