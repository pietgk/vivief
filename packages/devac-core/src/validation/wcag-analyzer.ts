/**
 * WCAG Analyzer
 *
 * Analyzes parsed JSX nodes and edges to detect WCAG accessibility violations.
 * Uses the WCAG rules defined in wcag-rules.ts.
 *
 * Part of DevAC Phase 2: WCAG Validation.
 */

import {
  type CheckableNodeKind,
  type WcagContext,
  type WcagLevel,
  type WcagRule,
  type WcagSeverity,
  type WcagViolation,
  getWcagRules,
  isCheckableNodeKind,
} from "../rules/wcag-rules.js";
import type { ParsedEdge, ParsedNode } from "../types/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for WCAG analysis
 */
export interface WcagAnalyzerOptions {
  /** Specific rule IDs to run (default: all enabled rules) */
  rules?: string[];
  /** WCAG level filter - runs rules at or below this level (default: AA) */
  level?: WcagLevel;
}

/**
 * A WCAG issue with location information
 */
export interface WcagIssue extends WcagViolation {
  /** File path where the issue was found */
  filePath: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
  /** Entity ID of the node */
  entityId: string;
}

/**
 * Result of WCAG analysis
 */
export interface WcagAnalysisResult {
  /** All detected issues */
  issues: WcagIssue[];
  /** Number of nodes that passed all checks */
  passedCount: number;
  /** Total number of nodes checked */
  checkedCount: number;
  /** Time taken for analysis in milliseconds */
  timeMs: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * ARIA relationship type from edge properties
 */
type AriaRelationType =
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-controls"
  | "aria-owns"
  | "aria-flowto"
  | "aria-activedescendant"
  | "aria-errormessage";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a map of element IDs to their nodes for ARIA reference validation
 */
function buildElementIdMap(nodes: ParsedNode[]): Map<string, ParsedNode> {
  const map = new Map<string, ParsedNode>();

  for (const node of nodes) {
    const elementId = node.properties.elementId as string | undefined;
    if (elementId) {
      map.set(elementId, node);
    }
  }

  return map;
}

/**
 * Filter rules based on options
 */
function filterRules(options?: WcagAnalyzerOptions): WcagRule[] {
  // Start with rules at the specified level
  let rules = getWcagRules(options?.level ?? "AA");

  // Filter to specific rules if specified
  if (options?.rules && options.rules.length > 0) {
    const ruleIds = new Set(options.rules);
    rules = rules.filter((rule) => ruleIds.has(rule.id));
  }

  return rules;
}

/**
 * Check if a node should be checked by WCAG rules
 */
function isCheckableNode(node: ParsedNode): boolean {
  return isCheckableNodeKind(node.kind);
}

/**
 * Check ARIA references in edges for broken references
 *
 * WCAG 1.3.1 requires that ARIA ID references point to existing elements
 */
function checkAriaReferences(
  edges: ParsedEdge[],
  nodes: ParsedNode[],
  elementIdMap: Map<string, ParsedNode>,
  rules: WcagRule[]
): WcagIssue[] {
  const issues: WcagIssue[] = [];

  // Check if the valid-aria-reference rule is enabled
  const ariaRefRule = rules.find((r) => r.id === "wcag-valid-aria-reference");
  if (!ariaRefRule) {
    return issues;
  }

  // Build a node lookup map
  const nodeMap = new Map<string, ParsedNode>();
  for (const node of nodes) {
    nodeMap.set(node.entity_id, node);
  }

  // Check each REFERENCES edge
  for (const edge of edges) {
    if (edge.edge_type !== "REFERENCES") continue;

    const ariaRelationType = edge.properties?.ariaRelationType as AriaRelationType | undefined;
    if (!ariaRelationType) continue;

    // Get the target ID from the edge
    const targetId = edge.properties?.targetElementId as string | undefined;
    if (!targetId) continue;

    // Check if the target ID exists in the element ID map
    if (!elementIdMap.has(targetId)) {
      // Get the source node for location info
      const sourceNode = nodeMap.get(edge.source_entity_id);
      if (!sourceNode) continue;

      issues.push({
        ruleId: ariaRefRule.id,
        ruleName: ariaRefRule.name,
        wcagCriterion: ariaRefRule.wcagCriterion,
        wcagLevel: ariaRefRule.wcagLevel,
        severity: ariaRefRule.severity,
        message: `${ariaRelationType} references non-existent element ID "${targetId}"`,
        suggestion: `Ensure an element with id="${targetId}" exists in the document`,
        filePath: sourceNode.file_path,
        line: sourceNode.start_line,
        column: sourceNode.start_column ?? 0,
        entityId: sourceNode.entity_id,
      });
    }
  }

  return issues;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze nodes and edges for WCAG violations
 *
 * @param nodes - Parsed nodes from the code graph
 * @param edges - Parsed edges from the code graph
 * @param options - Analysis options
 * @returns Analysis result with issues and statistics
 *
 * @example
 * ```typescript
 * const result = analyzeWcag(nodes, edges, { level: "AA" });
 * console.log(`Found ${result.issues.length} issues`);
 * ```
 */
export function analyzeWcag(
  nodes: ParsedNode[],
  edges: ParsedEdge[],
  options?: WcagAnalyzerOptions
): WcagAnalysisResult {
  const startTime = performance.now();

  // Build element ID map for ARIA reference validation
  const elementIdMap = buildElementIdMap(nodes);

  // Create context for rule checks
  const context: WcagContext = {
    nodes,
    edges,
    elementIdMap,
  };

  // Get rules to run
  const rules = filterRules(options);

  // Track issues and statistics
  const issues: WcagIssue[] = [];
  let checkedCount = 0;
  const nodeIssueCount = new Map<string, number>();

  // Check each node
  for (const node of nodes) {
    if (!isCheckableNode(node)) continue;
    checkedCount++;

    // Run each applicable rule
    for (const rule of rules) {
      // Check if rule applies to this node kind
      if (!rule.appliesTo.includes(node.kind as CheckableNodeKind)) continue;

      // Run the rule check
      const violation = rule.check(node, context);
      if (violation) {
        issues.push({
          ...violation,
          filePath: node.file_path,
          line: node.start_line,
          column: node.start_column ?? 0,
          entityId: node.entity_id,
        });

        // Track issues per node
        const count = nodeIssueCount.get(node.entity_id) ?? 0;
        nodeIssueCount.set(node.entity_id, count + 1);
      }
    }
  }

  // Check ARIA references (edge-level check)
  const ariaRefIssues = checkAriaReferences(edges, nodes, elementIdMap, rules);
  issues.push(...ariaRefIssues);

  // Calculate passed count (nodes with no issues)
  const passedCount = checkedCount - nodeIssueCount.size;

  return {
    issues,
    passedCount,
    checkedCount,
    timeMs: performance.now() - startTime,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Group issues by file path
 */
export function groupIssuesByFile(issues: WcagIssue[]): Map<string, WcagIssue[]> {
  const grouped = new Map<string, WcagIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.filePath) ?? [];
    existing.push(issue);
    grouped.set(issue.filePath, existing);
  }

  return grouped;
}

/**
 * Group issues by severity
 */
export function groupIssuesBySeverity(issues: WcagIssue[]): Map<WcagSeverity, WcagIssue[]> {
  const grouped = new Map<WcagSeverity, WcagIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.severity) ?? [];
    existing.push(issue);
    grouped.set(issue.severity, existing);
  }

  return grouped;
}

/**
 * Group issues by WCAG criterion
 */
export function groupIssuesByCriterion(issues: WcagIssue[]): Map<string, WcagIssue[]> {
  const grouped = new Map<string, WcagIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.wcagCriterion) ?? [];
    existing.push(issue);
    grouped.set(issue.wcagCriterion, existing);
  }

  return grouped;
}

/**
 * Get issue counts by rule ID
 */
export function getIssueCounts(issues: WcagIssue[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const issue of issues) {
    const count = counts.get(issue.ruleId) ?? 0;
    counts.set(issue.ruleId, count + 1);
  }

  return counts;
}

/**
 * Filter issues by severity
 */
export function filterIssuesBySeverity(issues: WcagIssue[], severity: WcagSeverity): WcagIssue[] {
  return issues.filter((issue) => issue.severity === severity);
}

/**
 * Get a summary of analysis results
 */
export function getAnalysisSummary(result: WcagAnalysisResult): {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  passRate: number;
  timeMs: number;
} {
  const errorCount = result.issues.filter((i) => i.severity === "error").length;
  const warningCount = result.issues.filter((i) => i.severity === "warning").length;
  const passRate = result.checkedCount > 0 ? (result.passedCount / result.checkedCount) * 100 : 100;

  return {
    totalIssues: result.issues.length,
    errorCount,
    warningCount,
    passRate,
    timeMs: result.timeMs,
  };
}
