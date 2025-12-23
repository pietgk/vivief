/**
 * Output Formatter Utility
 *
 * Provides shared formatting utilities for CLI commands.
 * Supports JSON and pretty (human-readable) output modes.
 * Default is pretty (human-readable), use --json for machine-readable output.
 */

import type { UnifiedFeedback, ValidationIssue } from "@pietgk/devac-core";

/**
 * Format options
 */
export interface FormatOptions {
  /** Output as JSON (default: false = pretty/human-readable) */
  json?: boolean;
}

/**
 * Format data as JSON or string representation
 */
export function formatOutput<T>(data: T, options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(data);
  }
  // For pretty mode, caller should use specific formatters
  // This fallback handles generic data with indentation
  return JSON.stringify(data, null, 2);
}

/**
 * Format rows as a table (for pretty output)
 */
export function formatTable(
  rows: Record<string, unknown>[],
  options: { columns?: string[] } = {}
): string {
  if (rows.length === 0) {
    return "(no data)";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "(no data)";
  }

  // Determine columns
  const columns = options.columns || Object.keys(firstRow);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of rows) {
      const value = String(row[col] ?? "");
      widths[col] = Math.max(widths[col] ?? 0, value.length);
    }
  }

  // Build table
  const lines: string[] = [];

  // Header
  const header = columns.map((col) => col.padEnd(widths[col] ?? 0)).join("  ");
  lines.push(header);
  lines.push(columns.map((col) => "-".repeat(widths[col] ?? 0)).join("  "));

  // Rows
  for (const row of rows) {
    const line = columns.map((col) => String(row[col] ?? "").padEnd(widths[col] ?? 0)).join("  ");
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Format validation issues for display
 */
export function formatValidationIssues(
  issues: ValidationIssue[],
  options: FormatOptions = {}
): string {
  if (options.json) {
    return JSON.stringify(issues);
  }

  // Pretty output (default)
  if (issues.length === 0) {
    return "No issues found";
  }

  const lines: string[] = [];

  // Group by severity
  const bySeverity = groupBy(issues, (i) => i.severity);
  const severityOrder: Array<"error" | "warning"> = ["error", "warning"];

  for (const severity of severityOrder) {
    const severityIssues = bySeverity.get(severity);
    if (!severityIssues || severityIssues.length === 0) continue;

    const icon = severity === "error" ? "❌" : "⚠️";
    lines.push(`\n${icon} ${severity.toUpperCase()} (${severityIssues.length})`);
    lines.push("-".repeat(40));

    for (const issue of severityIssues) {
      const location = issue.line
        ? `:${issue.line}${issue.column !== undefined ? `:${issue.column}` : ""}`
        : "";
      lines.push(`  ${issue.file}${location}`);
      lines.push(`    ${issue.message}`);
      if (issue.source) {
        lines.push(`    [${issue.source}${issue.code ? `: ${issue.code}` : ""}]`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format unified feedback for display
 */
export function formatFeedback(items: UnifiedFeedback[], options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(items);
  }

  // Pretty output (default)
  if (items.length === 0) {
    return "No feedback items";
  }

  const lines: string[] = [];

  // Group by source
  const bySource = groupBy(items, (i) => i.source);

  for (const [source, sourceItems] of bySource) {
    lines.push(`\n📋 ${source.toUpperCase()} (${sourceItems.length})`);
    lines.push("-".repeat(40));

    for (const item of sourceItems) {
      const icon = getSeverityIcon(item.severity);
      const location = item.line_number ? `:${item.line_number}` : "";
      const file = item.file_path ? `${item.file_path}${location}` : "(no file)";

      lines.push(`  ${icon} ${file}`);
      lines.push(`    ${item.title || item.description}`);
      if (item.category) {
        lines.push(`    [${item.category}]`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format a summary of counts
 */
export function formatSummary(
  counts: { label: string; count: number; icon?: string }[],
  options: FormatOptions = {}
): string {
  if (options.json) {
    const obj: Record<string, number> = {};
    for (const { label, count } of counts) {
      obj[label] = count;
    }
    return JSON.stringify(obj);
  }

  // Pretty output (default)
  const lines: string[] = [];
  for (const { label, count, icon } of counts) {
    const prefix = icon ? `${icon} ` : "";
    lines.push(`${prefix}${label}: ${count}`);
  }
  return lines.join("\n");
}

/**
 * Format symbols for display (find-symbol, file-symbols, etc.)
 * Accepts both camelCase and snake_case property names for flexibility
 */
export function formatSymbols(symbols: unknown[], options: FormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(symbols);
  }

  // Pretty output (default)
  if (symbols.length === 0) {
    return "No symbols found";
  }

  const lines: string[] = [];
  for (const sym of symbols) {
    const s = sym as Record<string, unknown>;
    const name = (s.name || "") as string;
    const kind = (s.kind || "") as string;
    const file = (s.file || s.source_file || s.file_path || "") as string;
    const line = (s.line || s.start_line || undefined) as number | undefined;

    const location = file ? ` (${file}${line ? `:${line}` : ""})` : "";
    const kindIcon = getKindIcon(kind);
    lines.push(`${kindIcon} ${kind} ${name}${location}`);
  }
  return lines.join("\n");
}

/**
 * Format dependencies/dependents for display
 * Accepts both camelCase and snake_case property names for flexibility
 */
export function formatDependencies(
  edges: unknown[],
  options: FormatOptions & { direction?: "outgoing" | "incoming" } = {}
): string {
  if (options.json) {
    return JSON.stringify(edges);
  }

  // Pretty output (default)
  if (edges.length === 0) {
    return options.direction === "incoming" ? "No dependents found" : "No dependencies found";
  }

  const lines: string[] = [];
  for (const edge of edges) {
    const e = edge as Record<string, unknown>;
    const sourceId = (e.sourceId || e.source_entity_id || "") as string;
    const targetId = (e.targetId || e.target_entity_id || "") as string;
    const edgeType = (e.edgeType || e.edge_type || "UNKNOWN") as string;
    const sourceName = (e.sourceName || e.name || "") as string;
    const targetName = (e.targetName || "") as string;

    const from = sourceName || sourceId;
    const to = targetName || targetId;
    lines.push(`  ${from} --[${edgeType}]--> ${to}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    case "suggestion":
      return "💡";
    case "note":
      return "📝";
    default:
      return "•";
  }
}

function getKindIcon(kind: string): string {
  switch (kind.toLowerCase()) {
    case "function":
      return "ƒ";
    case "class":
      return "C";
    case "interface":
      return "I";
    case "type":
      return "T";
    case "variable":
      return "v";
    case "const":
      return "c";
    case "enum":
      return "E";
    case "module":
      return "M";
    default:
      return "•";
  }
}
