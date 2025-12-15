/**
 * Symbol Affected Analyzer Implementation
 *
 * Provides symbol-level change impact analysis for DevAC v2.0.
 * Based on spec Section 10.1: Affected Detection via CodeGraph.
 */

import * as path from "node:path";
import { type DuckDBPool, executeWithRecovery } from "../storage/duckdb-pool.js";
import type { SeedReader } from "../storage/seed-reader.js";
import { getSeedPaths } from "../types/config.js";
import type { ParsedNode } from "../types/index.js";

/**
 * Changed symbol information from file diff
 */
export interface ChangedSymbol {
  entityId: string;
  name: string;
  kind: string;
  changeType: "added" | "modified" | "removed";
  filePath: string;
}

/**
 * Affected file with symbol-level detail
 */
export interface AffectedFile {
  filePath: string;
  packagePath: string;
  affectedSymbols: string[];
  impactLevel: "direct" | "transitive";
  depth: number;
}

/**
 * Symbol-level affected analysis result
 */
export interface SymbolAffectedResult {
  changedSymbols: ChangedSymbol[];
  affectedFiles: AffectedFile[];
  totalAffected: number;
  analysisTimeMs: number;
  truncated: boolean;
  maxDepthReached: number;
}

/**
 * Options for symbol affected analysis
 */
export interface SymbolAffectedOptions {
  /** Maximum traversal depth (default: 1 for quick, 10 for full) */
  maxDepth?: number;
  /** Include transitive dependencies (default: false for quick mode) */
  includeTransitive?: boolean;
  /** Limit to specific packages */
  packageFilter?: string[];
  /** Filter by symbol kind (e.g., ["function", "class"]) */
  symbolKindFilter?: string[];
}

/**
 * Internal tracking for BFS traversal
 */
interface ImporterInfo {
  filePath: string;
  entityId: string;
  depth: number;
}

/**
 * Symbol Affected Analyzer
 *
 * Analyzes symbol-level impact of file changes.
 */
export class SymbolAffectedAnalyzer {
  constructor(
    private pool: DuckDBPool,
    private packagePath: string,
    private seedReader: SeedReader
  ) {}

  /**
   * Compare current seeds with new parsed nodes to identify changed exports
   */
  async diffFileSymbols(
    filePath: string,
    newNodes: ParsedNode[],
    branch = "base"
  ): Promise<ChangedSymbol[]> {
    const changes: ChangedSymbol[] = [];

    // Get current exported nodes from seeds
    const currentNodes = await this.seedReader.getNodesByFile(filePath, branch);
    const currentExports = currentNodes.filter((n) => n.is_exported && !n.is_deleted);

    // Filter new nodes to only exports
    const newExports = newNodes.filter((n) => n.is_exported);

    // Build maps for comparison
    const currentByEntityId = new Map<string, ParsedNode>();
    for (const node of currentExports) {
      currentByEntityId.set(node.entity_id, node);
    }

    const newByEntityId = new Map<string, ParsedNode>();
    for (const node of newExports) {
      newByEntityId.set(node.entity_id, node);
    }

    // Find added exports (in new but not current)
    for (const [entityId, node] of newByEntityId) {
      if (!currentByEntityId.has(entityId)) {
        changes.push({
          entityId,
          name: node.name,
          kind: node.kind,
          changeType: "added",
          filePath,
        });
      }
    }

    // Find removed exports (in current but not new)
    for (const [entityId, node] of currentByEntityId) {
      if (!newByEntityId.has(entityId)) {
        changes.push({
          entityId,
          name: node.name,
          kind: node.kind,
          changeType: "removed",
          filePath,
        });
      }
    }

    // Find modified exports (same entity ID but different properties)
    for (const [entityId, newNode] of newByEntityId) {
      const currentNode = currentByEntityId.get(entityId);
      if (currentNode && this.hasSignatureChanged(currentNode, newNode)) {
        changes.push({
          entityId,
          name: newNode.name,
          kind: newNode.kind,
          changeType: "modified",
          filePath,
        });
      }
    }

    return changes;
  }

  /**
   * Find all files that import the specified symbols
   */
  async findSymbolImporters(
    symbolEntityIds: string[],
    options: SymbolAffectedOptions = {}
  ): Promise<AffectedFile[]> {
    const { maxDepth = 1, includeTransitive = false } = options;

    if (symbolEntityIds.length === 0) {
      return [];
    }

    const affectedFiles: AffectedFile[] = [];
    const visitedFiles = new Set<string>();
    const visitedEntities = new Set<string>();

    // Mark initial symbols as visited
    for (const entityId of symbolEntityIds) {
      visitedEntities.add(entityId);
    }

    // Get files containing the original symbols to exclude them from results
    const sourceFiles = await this.getFilesForEntities(symbolEntityIds);
    for (const file of sourceFiles) {
      visitedFiles.add(file);
    }

    // BFS traversal
    let currentLevel = symbolEntityIds;
    let currentDepth = 1;

    while (currentLevel.length > 0 && currentDepth <= maxDepth) {
      // Find all files importing current level symbols
      const importers = await this.findDirectImporters(currentLevel);

      const nextLevel: string[] = [];

      for (const importer of importers) {
        // Skip if already visited
        if (visitedFiles.has(importer.filePath)) {
          continue;
        }
        visitedFiles.add(importer.filePath);

        // Add to affected files
        affectedFiles.push({
          filePath: importer.filePath,
          packagePath: this.packagePath,
          affectedSymbols: [importer.entityId],
          impactLevel: currentDepth === 1 ? "direct" : "transitive",
          depth: currentDepth,
        });

        // Track entity for next level traversal
        if (includeTransitive && !visitedEntities.has(importer.entityId)) {
          visitedEntities.add(importer.entityId);
          nextLevel.push(importer.entityId);
        }
      }

      currentLevel = nextLevel;
      currentDepth++;
    }

    return affectedFiles;
  }

  /**
   * Full analysis: diff files and find all affected importers
   */
  async analyzeFileChanges(
    changedFilePaths: string[],
    newNodesMap: Record<string, ParsedNode[]>,
    options: SymbolAffectedOptions = {}
  ): Promise<SymbolAffectedResult> {
    const startTime = Date.now();
    const allChangedSymbols: ChangedSymbol[] = [];

    // Step 1: Diff each changed file to identify changed exports
    for (const filePath of changedFilePaths) {
      const newNodes = newNodesMap[filePath] || [];
      const fileChanges = await this.diffFileSymbols(filePath, newNodes);
      allChangedSymbols.push(...fileChanges);
    }

    // Step 2: Collect all changed symbol entity IDs
    const changedEntityIds = allChangedSymbols.map((s) => s.entityId);

    // Step 3: Find all files importing the changed symbols
    const affectedFiles = await this.findSymbolImporters(changedEntityIds, options);

    // Deduplicate affected files (a file may import multiple changed symbols)
    const deduplicatedFiles = this.deduplicateAffectedFiles(affectedFiles);

    return {
      changedSymbols: allChangedSymbols,
      affectedFiles: deduplicatedFiles,
      totalAffected: deduplicatedFiles.length,
      analysisTimeMs: Date.now() - startTime,
      truncated: false,
      maxDepthReached: Math.max(0, ...deduplicatedFiles.map((f) => f.depth)),
    };
  }

  /**
   * Get file paths for given entity IDs
   */
  private async getFilesForEntities(entityIds: string[]): Promise<string[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const nodes = await this.seedReader.getNodesByIds(entityIds);
    return [...new Set(nodes.map((n) => n.file_path))];
  }

  /**
   * Find direct importers of given entity IDs (1-hop)
   */
  private async findDirectImporters(entityIds: string[]): Promise<ImporterInfo[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const paths = getSeedPaths(this.packagePath, "base");
    const refsPath = path.join(paths.basePath, "external_refs.parquet");

    return await executeWithRecovery(this.pool, async (conn) => {
      // Check if refs file exists
      try {
        const idList = entityIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");

        const query = `
          SELECT DISTINCT
            source_entity_id,
            source_file_path
          FROM read_parquet('${refsPath}')
          WHERE target_entity_id IN (${idList})
            AND is_resolved = true
            AND is_deleted = false
        `;

        const rows = await conn.all(query);

        return rows.map((row) => ({
          filePath: row.source_file_path as string,
          entityId: row.source_entity_id as string,
          depth: 1,
        }));
      } catch (_error) {
        // File may not exist yet
        return [];
      }
    });
  }

  /**
   * Check if a node's signature has changed
   */
  private hasSignatureChanged(oldNode: ParsedNode, newNode: ParsedNode): boolean {
    // Compare properties if they exist
    // Properties can be either a string (from Parquet) or an object (from parser)
    const oldProps = this.parseProperties(oldNode.properties);
    const newProps = this.parseProperties(newNode.properties);

    // Check return type
    if (oldProps.returnType !== newProps.returnType) {
      return true;
    }

    // Check parameters (for functions)
    if (JSON.stringify(oldProps.parameters) !== JSON.stringify(newProps.parameters)) {
      return true;
    }

    // Check extends (for classes)
    if (JSON.stringify(oldProps.extends) !== JSON.stringify(newProps.extends)) {
      return true;
    }

    // Check implements (for classes)
    if (JSON.stringify(oldProps.implements) !== JSON.stringify(newProps.implements)) {
      return true;
    }

    // Check if the source file hash changed (content changed)
    if (oldNode.source_file_hash !== newNode.source_file_hash) {
      // If hash changed but no structural changes detected, still consider modified
      // This catches body changes in functions/methods
      return true;
    }

    return false;
  }

  /**
   * Parse properties - handles both string (from Parquet) and object (from parser)
   */
  private parseProperties(
    props: Record<string, unknown> | string | null | undefined
  ): Record<string, unknown> {
    if (!props) {
      return {};
    }
    if (typeof props === "string") {
      try {
        return JSON.parse(props);
      } catch {
        return {};
      }
    }
    return props;
  }

  /**
   * Deduplicate affected files, keeping the one with lowest depth
   */
  private deduplicateAffectedFiles(files: AffectedFile[]): AffectedFile[] {
    const byPath = new Map<string, AffectedFile>();

    for (const file of files) {
      const existing = byPath.get(file.filePath);
      if (!existing || file.depth < existing.depth) {
        byPath.set(file.filePath, file);
      } else if (existing && file.depth === existing.depth) {
        // Merge affected symbols
        existing.affectedSymbols = [
          ...new Set([...existing.affectedSymbols, ...file.affectedSymbols]),
        ];
      }
    }

    return Array.from(byPath.values());
  }
}

/**
 * Create a SymbolAffectedAnalyzer instance
 */
export function createSymbolAffectedAnalyzer(
  pool: DuckDBPool,
  packagePath: string,
  seedReader: SeedReader
): SymbolAffectedAnalyzer {
  return new SymbolAffectedAnalyzer(pool, packagePath, seedReader);
}
