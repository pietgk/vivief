/**
 * Affected Analyzer Implementation
 *
 * Provides multi-repo affected detection for DevAC v2.0.
 * Based on spec Phase 4: Federation.
 */

import type { HubStorage } from "./hub-storage.js";

/**
 * Analysis options
 */
export interface AnalyzeOptions {
  /** Maximum depth for transitive dependency analysis (default: 10) */
  maxDepth?: number;
  /** Only include these repositories in analysis */
  includeRepos?: string[];
  /** Exclude these repositories from analysis */
  excludeRepos?: string[];
}

/**
 * Affected repository information
 */
export interface AffectedRepo {
  repoId: string;
  localPath: string;
  affectedEntities: string[];
  impactLevel: "direct" | "transitive";
}

/**
 * Analysis result
 */
export interface AffectedResult {
  changedEntities: string[];
  affectedRepos: AffectedRepo[];
  totalAffected: number;
  analysisTimeMs: number;
}

/**
 * Internal tracking for affected entities with depth info
 */
interface AffectedEntity {
  entityId: string;
  repoId: string;
  depth: number;
}

/**
 * Affected Analyzer
 *
 * Analyzes cross-repository dependencies to find affected entities.
 */
export class AffectedAnalyzer {
  constructor(private storage: HubStorage) {}

  /**
   * Analyze which entities are affected by changes to the given entities
   */
  async analyze(changedEntityIds: string[], options: AnalyzeOptions = {}): Promise<AffectedResult> {
    const startTime = Date.now();
    const { maxDepth = 10, includeRepos, excludeRepos } = options;

    if (changedEntityIds.length === 0) {
      return {
        changedEntities: [],
        affectedRepos: [],
        totalAffected: 0,
        analysisTimeMs: Date.now() - startTime,
      };
    }

    // Track visited entities to handle circular dependencies
    const visited = new Set<string>();
    const affectedByRepo = new Map<string, Map<string, AffectedEntity>>();

    // BFS to find all affected entities
    let currentLevel = changedEntityIds;
    let currentDepth = 1;

    while (currentLevel.length > 0 && currentDepth <= maxDepth) {
      // Find all entities that depend on the current level
      const dependents = await this.storage.getCrossRepoDependents(currentLevel);

      const nextLevel: string[] = [];

      for (const edge of dependents) {
        const sourceEntityId = edge.source_entity_id;
        const sourceRepo = edge.source_repo;

        // Skip if already visited
        if (visited.has(sourceEntityId)) {
          continue;
        }

        // Apply repo filters
        if (includeRepos && !includeRepos.includes(sourceRepo)) {
          continue;
        }
        if (excludeRepos?.includes(sourceRepo)) {
          continue;
        }

        visited.add(sourceEntityId);

        // Track affected entity with its depth
        if (!affectedByRepo.has(sourceRepo)) {
          affectedByRepo.set(sourceRepo, new Map());
        }
        const repoEntities = affectedByRepo.get(sourceRepo);
        if (!repoEntities) continue;

        // Only record if not already recorded (keeps earliest depth)
        if (!repoEntities.has(sourceEntityId)) {
          repoEntities.set(sourceEntityId, {
            entityId: sourceEntityId,
            repoId: sourceRepo,
            depth: currentDepth,
          });
        }

        // Add to next level for transitive analysis
        nextLevel.push(sourceEntityId);
      }

      currentLevel = nextLevel;
      currentDepth++;
    }

    // Build result grouped by repo
    const affectedRepos: AffectedRepo[] = [];
    const repoRegistrations = await this.storage.listRepos();
    const repoPathMap = new Map(repoRegistrations.map((r) => [r.repo_id, r.local_path]));

    for (const [repoId, entities] of affectedByRepo) {
      const entityList = Array.from(entities.values());
      const minDepth = Math.min(...entityList.map((e) => e.depth));

      affectedRepos.push({
        repoId,
        localPath: repoPathMap.get(repoId) || "",
        affectedEntities: entityList.map((e) => e.entityId),
        impactLevel: minDepth === 1 ? "direct" : "transitive",
      });
    }

    const totalAffected = affectedRepos.reduce((sum, r) => sum + r.affectedEntities.length, 0);

    return {
      changedEntities: changedEntityIds,
      affectedRepos,
      totalAffected,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Analyze which entities are affected by changes to a specific file
   */
  async analyzeFile(filePath: string, repoPath: string): Promise<AffectedResult> {
    const startTime = Date.now();

    // Get repo registration to find repo_id
    const repos = await this.storage.listRepos();
    const repo = repos.find((r) => r.local_path === repoPath);

    if (!repo) {
      return {
        changedEntities: [],
        affectedRepos: [],
        totalAffected: 0,
        analysisTimeMs: Date.now() - startTime,
      };
    }

    // Find all edges that target entities in this file
    const edges = await this.storage.getEdgesTargetingRepo(repo.repo_id, filePath);

    if (edges.length === 0) {
      return {
        changedEntities: [],
        affectedRepos: [],
        totalAffected: 0,
        analysisTimeMs: Date.now() - startTime,
      };
    }

    // Extract unique target entities (changed entities in the file)
    const changedEntities = [...new Set(edges.map((e) => e.target_entity_id))];

    // Now find all affected entities using the main analyze method
    return this.analyze(changedEntities);
  }
}

/**
 * Create an AffectedAnalyzer instance
 */
export function createAffectedAnalyzer(storage: HubStorage): AffectedAnalyzer {
  return new AffectedAnalyzer(storage);
}
