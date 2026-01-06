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
import {
  generateDocMetadataForLikeC4,
  generateDocMetadataForMarkdown,
  generateDocMetadataForPlantUML,
} from "./doc-metadata.js";

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

/**
 * Generate workspace-level C4 context diagram in LikeC4 format
 */
export function generateWorkspaceLikeC4ContextDoc(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "}",
    "",
    "model {",
  ];

  // Add repos as systems
  for (const repo of data.repos) {
    const id = sanitizeId(repo.repoId);
    const totalEffects =
      repo.effectCounts.store +
      repo.effectCounts.retrieve +
      repo.effectCounts.external +
      repo.effectCounts.other;

    lines.push(`  ${id} = system '${repo.repoId}' {`);
    lines.push(`    description '${repo.packageCount} packages, ${totalEffects} effects'`);
    lines.push(`    link '${repo.repoPath}'`);
    lines.push("  }");
  }

  lines.push("}");
  lines.push("");
  lines.push("views {");
  lines.push("  view context {");
  lines.push("    title 'Workspace Context'");
  lines.push("    include *");
  lines.push("    autoLayout tb");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate workspace-level C4 container diagram in LikeC4 format
 */
export function generateWorkspaceLikeC4ContainersDoc(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element container",
    "}",
    "",
    "model {",
    "  workspace = system 'Workspace' {",
  ];

  // Add repos as containers of the workspace system
  for (const repo of data.repos) {
    const id = sanitizeId(repo.repoId);
    lines.push(`    ${id} = container '${repo.repoId}' {`);
    lines.push(`      description '${repo.packageCount} packages'`);
    lines.push(`      technology 'TypeScript'`);
    lines.push(`      link '${repo.repoPath}'`);
    lines.push("    }");
  }

  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("views {");
  lines.push("  view containers {");
  lines.push("    title 'Workspace Containers'");
  lines.push("    include *");
  lines.push("    autoLayout tb");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

// ============================================================================
// Unified Workspace Model (Single File)
// ============================================================================

/**
 * Generate a unified workspace LikeC4 model in a single file
 *
 * This creates a comprehensive model with:
 * - Custom specification with element kinds
 * - All repositories as systems
 * - Packages as containers within each repo
 * - Cross-repo relationships
 * - Drill-down navigation between views
 *
 * @param data - Workspace effects data
 * @param options - Generation options
 * @returns Complete LikeC4 DSL string
 */
export function generateUnifiedWorkspaceLikeC4(
  data: WorkspaceEffectsData,
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  const lines: string[] = [
    metadata.trim(),
    "",
    "// =============================================================================",
    "// Unified Workspace Architecture Model",
    "// Generated by: devac doc-sync --workspace",
    "// =============================================================================",
    "",
  ];

  // Specification block with custom elements
  lines.push("specification {");
  lines.push("  // Workspace element kinds");
  lines.push("  element workspace {");
  lines.push("    style { shape rectangle; color slate }");
  lines.push("  }");
  lines.push("  element repository {");
  lines.push("    style { shape rectangle; color blue }");
  lines.push("  }");
  lines.push("  element package {");
  lines.push("    style { shape rectangle; color sky }");
  lines.push("  }");
  lines.push("  element external_system {");
  lines.push("    style { shape rectangle; color muted }");
  lines.push("  }");
  lines.push("");
  lines.push("  // Tags for effect categories");
  lines.push("  tag Store");
  lines.push("  tag Retrieve");
  lines.push("  tag External");
  lines.push("  tag CrossRepo");
  lines.push("");
  lines.push("  // Relationship kinds");
  lines.push("  relationship stores { line solid; color blue }");
  lines.push("  relationship retrieves { line dashed; color blue }");
  lines.push("  relationship external { line solid; color amber }");
  lines.push("  relationship depends { line dashed; color gray }");
  lines.push("}");
  lines.push("");

  // Model block
  lines.push("model {");
  lines.push("  // Workspace as the root system");
  lines.push(`  workspace = workspace 'Development Workspace' {`);
  lines.push(
    `    description '${data.totalCounts.repos} repositories, ${data.totalCounts.packages} packages'`
  );
  lines.push("");

  // Add each repository as a nested element
  for (const repo of data.repos) {
    const repoId = sanitizeId(repo.repoId);
    const totalEffects =
      repo.effectCounts.store +
      repo.effectCounts.retrieve +
      repo.effectCounts.external +
      repo.effectCounts.other;

    lines.push(`    // Repository: ${repo.repoId}`);
    lines.push(`    ${repoId} = repository '${escapeString(repo.repoId)}' {`);
    lines.push(`      description '${repo.packageCount} packages, ${totalEffects} effects'`);
    lines.push(`      technology 'TypeScript'`);
    lines.push(`      link '${escapeString(repo.repoPath)}' 'Repository'`);

    // Add tags based on effect types
    if (repo.effectCounts.store > 0) lines.push("      #Store");
    if (repo.effectCounts.retrieve > 0) lines.push("      #Retrieve");
    if (repo.effectCounts.external > 0) lines.push("      #External");

    // Add metadata
    lines.push("      metadata {");
    lines.push(`        packages '${repo.packageCount}'`);
    lines.push(`        store '${repo.effectCounts.store}'`);
    lines.push(`        retrieve '${repo.effectCounts.retrieve}'`);
    lines.push(`        external '${repo.effectCounts.external}'`);
    lines.push("      }");

    lines.push("    }");
    lines.push("");
  }

  lines.push("  }"); // End workspace
  lines.push("");

  // Add cross-repo relationships
  if (data.crossRepoPatterns.length > 0) {
    lines.push("  // Cross-repository patterns (shared external dependencies)");
    const processedPairs = new Set<string>();

    for (const pattern of data.crossRepoPatterns.slice(0, 10)) {
      // Create relationships between repos that share this pattern
      for (let i = 0; i < pattern.repos.length - 1; i++) {
        for (let j = i + 1; j < pattern.repos.length; j++) {
          const repo1 = pattern.repos[i];
          const repo2 = pattern.repos[j];
          if (!repo1 || !repo2) continue;

          const pairKey = [repo1.repoId, repo2.repoId].sort().join(":");
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const id1 = sanitizeId(repo1.repoId);
          const id2 = sanitizeId(repo2.repoId);

          lines.push(
            `  workspace.${id1} -[depends]-> workspace.${id2} 'shared: ${escapeString(pattern.pattern)}' #CrossRepo`
          );
        }
      }
    }
    lines.push("");
  }

  lines.push("}");
  lines.push("");

  // Views block with multiple levels
  lines.push("views {");
  lines.push("  // Workspace overview (all repositories)");
  lines.push("  view workspace_overview {");
  lines.push("    title 'Workspace Overview'");
  lines.push("    description 'All repositories in the development workspace'");
  lines.push("    include *");
  lines.push("    autoLayout TopBottom");
  lines.push("  }");
  lines.push("");

  // Individual views for each repository
  for (const repo of data.repos) {
    const repoId = sanitizeId(repo.repoId);
    lines.push(`  // View for ${repo.repoId}`);
    lines.push(`  view ${repoId}_view of workspace.${repoId} {`);
    lines.push(`    title '${escapeString(repo.repoId)}'`);
    lines.push(`    description 'Repository details and packages'`);
    lines.push("    include *");
    lines.push("    autoLayout TopBottom");
    lines.push("  }");
    lines.push("");
  }

  // Effect category views
  if (data.totalCounts.store > 0) {
    lines.push("  // Repositories with Store effects");
    lines.push("  view stores_view {");
    lines.push("    title 'Data Storage'");
    lines.push("    description 'Repositories with store operations'");
    lines.push("    include element.tag = Store");
    lines.push("    autoLayout TopBottom");
    lines.push("  }");
    lines.push("");
  }

  if (data.totalCounts.external > 0) {
    lines.push("  // Repositories with External effects");
    lines.push("  view external_view {");
    lines.push("    title 'External Integrations'");
    lines.push("    description 'Repositories with external service calls'");
    lines.push("    include element.tag = External");
    lines.push("    autoLayout TopBottom");
    lines.push("  }");
    lines.push("");
  }

  if (data.crossRepoPatterns.length > 0) {
    lines.push("  // Cross-repository dependencies");
    lines.push("  view cross_repo_view {");
    lines.push("    title 'Cross-Repository Dependencies'");
    lines.push("    description 'Shared patterns between repositories'");
    lines.push("    include *, -> workspace.*");
    lines.push("    autoLayout TopBottom");
    lines.push("  }");
    lines.push("");
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate an empty unified workspace model when no repos are registered
 */
export function generateEmptyUnifiedWorkspaceLikeC4(
  options: GenerateWorkspaceEffectsDocOptions
): string {
  const { seedHash, workspacePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: workspacePath,
  });

  return `${metadata.trim()}

specification {
  element workspace { style { shape rectangle; color slate } }
}

model {
  workspace = workspace 'Development Workspace' {
    description 'No repositories registered'
  }
}

views {
  view workspace_overview {
    title 'Workspace Overview'
    description 'Run devac hub register to add repositories'
    include *
    autoLayout TopBottom
  }
}
`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize a name for use in PlantUML/LikeC4 identifiers
 */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

/**
 * Escape single quotes in strings for LikeC4
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}
