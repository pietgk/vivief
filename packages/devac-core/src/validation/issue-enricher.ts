/**
 * Issue Enricher Implementation
 *
 * Enriches validation issues with CodeGraph context for better debugging.
 * Based on DevAC v2.0 spec Section 10.3.
 */

import type { SeedReader } from "../storage/seed-reader.js";

/**
 * Validation issue from external tools (tsc, eslint, test runner)
 */
export interface ValidationIssue {
  /** File path (relative to package root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (0-based) */
  column: number;
  /** Error/warning message */
  message: string;
  /** Severity level */
  severity: "error" | "warning";
  /** Source of the issue */
  source: "tsc" | "eslint" | "test";
  /** Error code (e.g., TS2345, no-unused-vars) */
  code?: string;
}

/**
 * Symbol info for enrichment
 */
export interface SymbolInfo {
  entityId: string;
  name: string;
  kind: string;
}

/**
 * Caller info for enrichment
 */
export interface CallerInfo {
  entityId: string;
  name: string;
  filePath: string;
}

/**
 * Enriched validation issue with CodeGraph context
 */
export interface EnrichedIssue extends ValidationIssue {
  /** Symbol at the error location */
  affectedSymbol?: SymbolInfo;
  /** Functions/methods that call the affected symbol */
  callers?: CallerInfo[];
  /** Files that import/depend on the affected symbol */
  dependentFiles?: string[];
  /** Count of dependent files */
  dependentCount?: number;
  /** LLM-ready markdown prompt with context */
  promptMarkdown: string;
}

/**
 * Options for issue enrichment
 */
export interface EnrichmentOptions {
  /** Include caller information (default: true) */
  includeCallers?: boolean;
  /** Include dependent files (default: true) */
  includeDependents?: boolean;
  /** Maximum number of callers to include (default: 10) */
  maxCallers?: number;
  /** Maximum number of dependent files to include (default: 10) */
  maxDependents?: number;
}

/**
 * Options for getting callers
 */
export interface GetCallersOptions {
  /** Maximum number of callers to return */
  limit?: number;
}

const DEFAULT_ENRICHMENT_OPTIONS: Required<EnrichmentOptions> = {
  includeCallers: true,
  includeDependents: true,
  maxCallers: 10,
  maxDependents: 10,
};

/**
 * Issue Enricher
 *
 * Enriches validation issues with CodeGraph context including
 * affected symbols, callers, and dependent files.
 */
export class IssueEnricher {
  constructor(private seedReader: SeedReader) {}

  /**
   * Find the symbol at a specific file location
   */
  async findSymbolAtLocation(
    filePath: string,
    line: number,
    _column: number
  ): Promise<SymbolInfo | null> {
    try {
      const nodes = await this.seedReader.getNodesByFile(filePath);

      if (nodes.length === 0) {
        return null;
      }

      // Find all nodes that contain this location
      const containingNodes = nodes.filter(
        (node) => line >= node.start_line && line <= node.end_line
      );

      if (containingNodes.length === 0) {
        return null;
      }

      // Find the innermost (smallest span) node
      const innermost = containingNodes.reduce((best, current) => {
        const bestSpan = best.end_line - best.start_line;
        const currentSpan = current.end_line - current.start_line;
        return currentSpan < bestSpan ? current : best;
      });

      return {
        entityId: innermost.entity_id,
        name: innermost.name,
        kind: innermost.kind,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get functions/methods that call the target symbol
   */
  async getCallers(entityId: string, options: GetCallersOptions = {}): Promise<CallerInfo[]> {
    const { limit = 100 } = options;

    try {
      // Get edges where this entity is the target of a CALLS edge
      const edges = await this.seedReader.getEdgesByTarget(entityId);
      const callEdges = edges.filter((e) => e.edge_type === "CALLS");

      if (callEdges.length === 0) {
        return [];
      }

      // Get the source entity IDs
      const sourceIds = callEdges.map((e) => e.source_entity_id);

      // Fetch the source nodes
      const sourceNodes = await this.seedReader.getNodesByIds(sourceIds);

      // Build caller info
      const callers: CallerInfo[] = sourceNodes.map((node) => ({
        entityId: node.entity_id,
        name: node.name,
        filePath: node.file_path,
      }));

      // Apply limit
      return callers.slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Get files that depend on (import) the target symbol
   */
  async getDependentFiles(entityId: string): Promise<string[]> {
    try {
      // Read all external refs and filter for those targeting this entity
      const refsResult = await this.seedReader.readExternalRefs();
      const refs = refsResult.rows.filter(
        (ref) => ref.target_entity_id === entityId && ref.is_resolved
      );

      // Get unique file paths
      const uniqueFiles = [...new Set(refs.map((ref) => ref.source_file_path))];

      return uniqueFiles;
    } catch {
      return [];
    }
  }

  /**
   * Enrich a single validation issue with CodeGraph context
   */
  async enrichIssue(
    issue: ValidationIssue,
    _packagePath: string,
    options: EnrichmentOptions = {}
  ): Promise<EnrichedIssue> {
    const opts = { ...DEFAULT_ENRICHMENT_OPTIONS, ...options };

    const enriched: EnrichedIssue = {
      ...issue,
      promptMarkdown: "",
    };

    // Find symbol at the error location
    const symbol = await this.findSymbolAtLocation(issue.file, issue.line, issue.column);

    if (symbol) {
      enriched.affectedSymbol = symbol;

      // Get callers if enabled
      if (opts.includeCallers) {
        const callers = await this.getCallers(symbol.entityId, {
          limit: opts.maxCallers,
        });
        if (callers.length > 0) {
          enriched.callers = callers;
        }
      }

      // Get dependent files if enabled
      if (opts.includeDependents) {
        const dependentFiles = await this.getDependentFiles(symbol.entityId);
        if (dependentFiles.length > 0) {
          enriched.dependentFiles = dependentFiles.slice(0, opts.maxDependents);
          enriched.dependentCount = dependentFiles.length;
        }
      }
    }

    // Generate the prompt markdown
    enriched.promptMarkdown = this.generatePrompt(enriched);

    return enriched;
  }

  /**
   * Enrich multiple validation issues
   */
  async enrichIssues(
    issues: ValidationIssue[],
    packagePath: string,
    options: EnrichmentOptions = {}
  ): Promise<EnrichedIssue[]> {
    const enriched: EnrichedIssue[] = [];

    for (const issue of issues) {
      const enrichedIssue = await this.enrichIssue(issue, packagePath, options);
      enriched.push(enrichedIssue);
    }

    return enriched;
  }

  /**
   * Generate LLM-ready markdown prompt from enriched issue
   */
  generatePrompt(issue: EnrichedIssue): string {
    const lines: string[] = [];

    lines.push("## Validation Issue");
    lines.push("");
    lines.push(`**File:** \`${issue.file}\` **Line:** ${issue.line}`);
    lines.push("");
    lines.push(`### Error: ${issue.message}`);

    if (issue.code) {
      lines.push("");
      lines.push(`**Code:** ${issue.code}`);
    }

    if (issue.affectedSymbol) {
      lines.push("");
      lines.push("### Affected Symbol");
      lines.push("");
      lines.push(`\`${issue.affectedSymbol.name}\` (${issue.affectedSymbol.kind})`);
    }

    if (issue.callers && issue.callers.length > 0) {
      lines.push("");
      lines.push(`### Called By (${issue.callers.length})`);
      lines.push("");
      for (const caller of issue.callers) {
        lines.push(`- \`${caller.name}\` in \`${caller.filePath}\``);
      }
    }

    if (issue.dependentFiles && issue.dependentFiles.length > 0) {
      const countText = issue.dependentCount
        ? `${issue.dependentCount}`
        : `${issue.dependentFiles.length}`;
      lines.push("");
      lines.push(`### Files That May Be Affected (${countText})`);
      lines.push("");
      for (const file of issue.dependentFiles) {
        lines.push(`- \`${file}\``);
      }
    }

    return lines.join("\n");
  }
}

/**
 * Create an IssueEnricher instance
 */
export function createIssueEnricher(seedReader: SeedReader): IssueEnricher {
  return new IssueEnricher(seedReader);
}
