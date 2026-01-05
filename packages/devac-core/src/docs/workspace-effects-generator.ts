/**
 * Workspace Effects Generator - Aggregate effects documentation from hub
 *
 * Generates workspace-level documentation by aggregating effects from all
 * repositories registered in the central hub. This provides a high-level
 * view across the entire development workspace.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import type { HubClient } from "../hub/hub-client.js";
import { combineHashes } from "../utils/hash.js";
import { generateDocMetadataForMarkdown, generateDocMetadataForPlantUML } from "./doc-metadata.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of effects for a single repository
 */
export interface RepoEffectsSummary {
  /** Repository ID from hub */
  repoId: string;
  /** Repository path */
  repoPath: string;
  /** Number of packages in the repo */
  packageCount: number;
  /** Effect counts by category */
  effectCounts: {
    store: number;
    retrieve: number;
    external: number;
    other: number;
  };
  /** Whether the repo has any effects */
  hasEffects: boolean;
}

/**
 * Cross-repo pattern data
 */
export interface CrossRepoPattern {
  /** Pattern name */
  pattern: string;
  /** Total count across all repos */
  totalCount: number;
  /** Which repos contain this pattern */
  repos: Array<{ repoId: string; count: number }>;
}

/**
 * Input data for generating workspace-level effects documentation
 */
export interface WorkspaceEffectsData {
  /** Workspace path (usually ~/.devac or workspace root) */
  workspacePath: string;
  /** Summary for each registered repo */
  repos: RepoEffectsSummary[];
  /** Patterns appearing in multiple repos */
  crossRepoPatterns: CrossRepoPattern[];
  /** Total counts across workspace */
  totalCounts: {
    repos: number;
    packages: number;
    store: number;
    retrieve: number;
    external: number;
    other: number;
  };
}

/**
 * Options for generating workspace effects documentation
 */
export interface GenerateWorkspaceEffectsDocOptions {
  /** Combined seed hash from all repos */
  seedHash: string;
  /** Workspace path */
  workspacePath?: string;
  /** Maximum number of patterns to include */
  maxPatterns?: number;
}

// ============================================================================
// Hub Query Functions
// ============================================================================

/**
 * Query workspace effects data from the hub
 *
 * @param hubClient - Hub client instance
 * @returns Workspace effects data
 */
export async function queryWorkspaceEffects(hubClient: HubClient): Promise<WorkspaceEffectsData> {
  // Get list of registered repos
  const repos = await hubClient.listRepos();

  const repoSummaries: RepoEffectsSummary[] = [];
  const patternMap = new Map<
    string,
    { totalCount: number; repos: Array<{ repoId: string; count: number }> }
  >();

  let totalPackages = 0;

  for (const repo of repos) {
    // Escape single quotes in repo path for SQL LIKE pattern
    const repoPathEscaped = repo.localPath.replace(/'/g, "''");

    // Query effect counts for this repo by matching source file path
    const effectCountsQuery = `
      SELECT
        effect_type,
        COUNT(*) as count
      FROM effects
      WHERE source_file_path LIKE '${repoPathEscaped}%'
      GROUP BY effect_type
    `;

    const effectCounts = { store: 0, retrieve: 0, external: 0, other: 0 };

    try {
      const result = await hubClient.query(effectCountsQuery);
      for (const row of result.rows) {
        const type = (row.effect_type as string)?.toLowerCase() || "";
        const count = Number(row.count) || 0;

        if (type === "store") effectCounts.store = count;
        else if (type === "retrieve") effectCounts.retrieve = count;
        else if (type === "send" || type === "external") effectCounts.external = count;
        else effectCounts.other += count;
      }
    } catch {
      // Repo might not have effects table populated
    }

    // Use package count from repo info (already computed from manifest)
    const packageCount = repo.packages;
    totalPackages += packageCount;

    const hasEffects =
      effectCounts.store > 0 ||
      effectCounts.retrieve > 0 ||
      effectCounts.external > 0 ||
      effectCounts.other > 0;

    repoSummaries.push({
      repoId: repo.repoId,
      repoPath: repo.localPath,
      packageCount,
      effectCounts,
      hasEffects,
    });

    // Query top patterns for this repo
    try {
      const patternsQuery = `
        SELECT
          callee_name as pattern,
          COUNT(*) as count
        FROM effects
        WHERE source_file_path LIKE '${repoPathEscaped}%'
          AND callee_name IS NOT NULL
          AND callee_name != ''
        GROUP BY callee_name
        ORDER BY count DESC
        LIMIT 100
      `;

      const patternsResult = await hubClient.query(patternsQuery);
      for (const row of patternsResult.rows) {
        const pattern = row.pattern as string;
        const count = Number(row.count) || 0;

        if (!pattern) continue;

        const existing = patternMap.get(pattern);
        if (existing) {
          existing.totalCount += count;
          existing.repos.push({ repoId: repo.repoId, count });
        } else {
          patternMap.set(pattern, {
            totalCount: count,
            repos: [{ repoId: repo.repoId, count }],
          });
        }
      }
    } catch {
      // Pattern query failed, continue
    }
  }

  // Find cross-repo patterns (patterns in 2+ repos)
  const crossRepoPatterns: CrossRepoPattern[] = [];
  for (const [pattern, data] of patternMap) {
    if (data.repos.length > 1) {
      crossRepoPatterns.push({
        pattern,
        totalCount: data.totalCount,
        repos: data.repos.sort((a, b) => b.count - a.count),
      });
    }
  }

  // Sort by number of repos first, then by total count
  crossRepoPatterns.sort((a, b) => b.repos.length - a.repos.length || b.totalCount - a.totalCount);

  // Calculate totals
  const totalCounts = {
    repos: repoSummaries.length,
    packages: totalPackages,
    store: repoSummaries.reduce((sum, r) => sum + r.effectCounts.store, 0),
    retrieve: repoSummaries.reduce((sum, r) => sum + r.effectCounts.retrieve, 0),
    external: repoSummaries.reduce((sum, r) => sum + r.effectCounts.external, 0),
    other: repoSummaries.reduce((sum, r) => sum + r.effectCounts.other, 0),
  };

  return {
    workspacePath: process.cwd(),
    repos: repoSummaries,
    crossRepoPatterns,
    totalCounts,
  };
}

/**
 * Compute combined seed hash for all repos in workspace
 */
export async function computeWorkspaceSeedHash(
  hubClient: HubClient
): Promise<{ hash: string | null; repoHashes: Map<string, string | null> }> {
  const repos = await hubClient.listRepos();
  const repoHashes = new Map<string, string | null>();
  const hashes: string[] = [];

  // Query the last_sync timestamp for each repo as a proxy for seed hash
  // (The hub doesn't store actual seed hashes, but we can use sync time)
  for (const repo of repos) {
    // Use repo's last sync time as a hash proxy
    const hashProxy = repo.lastSynced ? `${repo.repoId}:${repo.lastSynced}` : null;

    repoHashes.set(repo.repoId, hashProxy);
    if (hashProxy) {
      hashes.push(hashProxy);
    }
  }

  const combinedHash = hashes.length > 0 ? combineHashes(hashes) : null;

  return {
    hash: combinedHash,
    repoHashes,
  };
}

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate workspace-level effects markdown documentation
 *
 * @param data - Workspace effects data
 * @param options - Generation options
 * @returns Markdown content with embedded metadata
 */
export function generateWorkspaceEffectsDoc(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath, maxPatterns = 20 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const date = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    "# Workspace Effects Overview",
    "",
    "<!--",
    "  This file provides an aggregated view of effects across all repositories.",
    "  Generated by: devac doc-sync --workspace",
    "  ",
    "  See individual repo docs for detailed mappings.",
    "-->",
    "",
    "## Summary",
    "",
    `- **Repositories:** ${data.totalCounts.repos}`,
    `- **Total Packages:** ${data.totalCounts.packages}`,
    `- **Last Updated:** ${date}`,
    "",
    "### Effect Counts",
    "",
    "| Category | Total | Repos With Effects |",
    "|----------|-------|-------------------|",
    `| Store | ${data.totalCounts.store} | ${data.repos.filter((r) => r.effectCounts.store > 0).length} |`,
    `| Retrieve | ${data.totalCounts.retrieve} | ${data.repos.filter((r) => r.effectCounts.retrieve > 0).length} |`,
    `| External | ${data.totalCounts.external} | ${data.repos.filter((r) => r.effectCounts.external > 0).length} |`,
    `| Other | ${data.totalCounts.other} | ${data.repos.filter((r) => r.effectCounts.other > 0).length} |`,
    "",
  ];

  // Repositories Overview
  lines.push("## Repositories");
  lines.push("");
  lines.push("| Repository | Packages | Store | Retrieve | External | Other |");
  lines.push("|------------|----------|-------|----------|----------|-------|");
  for (const repo of data.repos) {
    lines.push(
      `| ${repo.repoId} | ${repo.packageCount} | ${repo.effectCounts.store} | ${repo.effectCounts.retrieve} | ${repo.effectCounts.external} | ${repo.effectCounts.other} |`
    );
  }
  lines.push("");

  // Cross-Repo Patterns
  lines.push("## Cross-Repository Patterns");
  lines.push("");
  lines.push("Patterns that appear in multiple repositories:");
  lines.push("");
  if (data.crossRepoPatterns.length > 0) {
    lines.push("| Pattern | Total Count | Repositories |");
    lines.push("|---------|-------------|--------------|");
    for (const p of data.crossRepoPatterns.slice(0, maxPatterns)) {
      const repoList = p.repos.map((r) => `${r.repoId}(${r.count})`).join(", ");
      lines.push(`| \`${p.pattern}\` | ${p.totalCount} | ${repoList} |`);
    }
    if (data.crossRepoPatterns.length > maxPatterns) {
      lines.push(`| _...and ${data.crossRepoPatterns.length - maxPatterns} more_ | | |`);
    }
  } else {
    lines.push("_No patterns appear in multiple repositories._");
  }
  lines.push("");

  // Repository Details Links
  lines.push("## Repository Details");
  lines.push("");
  lines.push("For detailed effect mappings, see individual repository documentation:");
  lines.push("");
  for (const repo of data.repos) {
    lines.push(`- **${repo.repoId}**: \`${repo.repoPath}/docs/repo-effects.md\``);
  }
  lines.push("");

  return metadata + lines.join("\n");
}

/**
 * Generate workspace-level C4 context diagram
 */
export function generateWorkspaceC4ContextDoc(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const lines: string[] = [
    "@startuml C4_Context",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
    "",
    "title Workspace - System Context Diagram",
    "",
    "' Workspace Context: Shows all repositories as systems",
    "",
  ];

  // Add repos as systems
  for (const repo of data.repos) {
    const id = sanitizeId(repo.repoId);
    const totalEffects =
      repo.effectCounts.store +
      repo.effectCounts.retrieve +
      repo.effectCounts.external +
      repo.effectCounts.other;
    lines.push(
      `System(${id}, "${repo.repoId}", "${repo.packageCount} packages, ${totalEffects} effects")`
    );
  }

  lines.push("");
  lines.push("' Cross-repo relationships would go here");
  lines.push("' (based on shared external dependencies or direct imports)");
  lines.push("");
  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Generate workspace-level C4 container diagram
 */
export function generateWorkspaceC4ContainersDoc(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const lines: string[] = [
    "@startuml C4_Container",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
    "",
    "title Workspace - Container Diagram",
    "",
    "' Container Diagram: Shows repositories as system boundaries",
    "",
  ];

  // Add each repo as a system boundary
  for (const repo of data.repos) {
    const id = sanitizeId(repo.repoId);
    lines.push(`System_Boundary(${id}, "${repo.repoId}") {`);
    lines.push(
      `  Container(${id}_pkg, "${repo.packageCount} packages", "TypeScript", "S:${repo.effectCounts.store} R:${repo.effectCounts.retrieve} E:${repo.effectCounts.external}")`
    );
    lines.push("}");
    lines.push("");
  }

  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Generate empty workspace effects doc when no repos are registered
 */
export function generateEmptyWorkspaceEffectsDoc(
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const date = new Date().toISOString().split("T")[0];

  const lines = [
    "# Workspace Effects Overview",
    "",
    "<!--",
    "  This file provides an aggregated view of effects across all repositories.",
    "  No repositories are registered with the hub.",
    "-->",
    "",
    "## Summary",
    "",
    `- **Last Updated:** ${date}`,
    "",
    "_No repositories registered. Run `devac hub register` to add repositories._",
    "",
  ];

  return metadata + lines.join("\n");
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize a name for use in PlantUML identifiers
 */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}
