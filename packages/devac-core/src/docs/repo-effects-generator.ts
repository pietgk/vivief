/**
 * Repo Effects Generator - Aggregate effects documentation from packages
 *
 * Generates repo-level documentation by aggregating effects from all
 * packages in a repository. This provides a high-level view of the
 * system's external dependencies and data access patterns.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import * as path from "node:path";

import { combineHashes } from "../utils/hash.js";
import { generateDocMetadataForMarkdown } from "./doc-metadata.js";
import type { EffectsDocData } from "./effects-generator.js";
import { computeSeedHash } from "./seed-hasher.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of effects for a single package
 */
export interface PackageEffectsSummary {
  /** Package name */
  name: string;
  /** Package path */
  packagePath: string;
  /** Effect counts by category */
  effectCounts: {
    store: number;
    retrieve: number;
    external: number;
    other: number;
  };
  /** Whether the package has effects data */
  hasEffects: boolean;
  /** Seed hash for this package */
  seedHash: string | null;
}

/**
 * Pattern with package attribution
 */
export interface AggregatedPattern {
  /** Pattern name */
  pattern: string;
  /** Total count across all packages */
  totalCount: number;
  /** Which packages contain this pattern */
  packages: Array<{ name: string; count: number }>;
  /** Whether this pattern appears in multiple packages */
  isCrossPackage: boolean;
}

/**
 * Input data for generating repo-level effects documentation
 */
export interface RepoEffectsData {
  /** Repository name (from directory name) */
  repoName: string;
  /** Repository path */
  repoPath: string;
  /** Summary for each package */
  packages: PackageEffectsSummary[];
  /** Aggregated patterns across packages */
  aggregatedPatterns: {
    storePatterns: AggregatedPattern[];
    retrievePatterns: AggregatedPattern[];
    externalPatterns: AggregatedPattern[];
    crossPackagePatterns: AggregatedPattern[];
  };
  /** Total effect counts */
  totalCounts: {
    store: number;
    retrieve: number;
    external: number;
    other: number;
    packages: number;
  };
}

/**
 * Options for generating repo effects documentation
 */
export interface GenerateRepoEffectsDocOptions {
  /** Combined seed hash from all packages */
  seedHash: string;
  /** Repository path */
  repoPath?: string;
  /** Maximum number of patterns to include per category */
  maxPatterns?: number;
}

/**
 * Package effects data input for aggregation
 */
export interface PackageEffectsInput {
  packageName: string;
  packagePath: string;
  data: EffectsDocData;
  seedHash: string | null;
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Aggregate patterns from multiple packages
 */
function aggregatePatterns<T extends { pattern: string; count: number }>(
  packages: Array<{ name: string; patterns: T[] }>
): AggregatedPattern[] {
  const patternMap = new Map<
    string,
    { totalCount: number; packages: Array<{ name: string; count: number }> }
  >();

  for (const pkg of packages) {
    for (const p of pkg.patterns) {
      const existing = patternMap.get(p.pattern);
      if (existing) {
        existing.totalCount += p.count;
        existing.packages.push({ name: pkg.name, count: p.count });
      } else {
        patternMap.set(p.pattern, {
          totalCount: p.count,
          packages: [{ name: pkg.name, count: p.count }],
        });
      }
    }
  }

  const aggregated: AggregatedPattern[] = [];
  for (const [pattern, data] of patternMap) {
    aggregated.push({
      pattern,
      totalCount: data.totalCount,
      packages: data.packages,
      isCrossPackage: data.packages.length > 1,
    });
  }

  // Sort by total count descending
  return aggregated.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Aggregate effects data from multiple packages
 */
export function aggregatePackageEffects(packageInputs: PackageEffectsInput[]): RepoEffectsData {
  const repoPath = packageInputs[0]?.packagePath
    ? path.dirname(packageInputs[0].packagePath)
    : process.cwd();
  const repoName = path.basename(repoPath);

  // Create package summaries
  const packages: PackageEffectsSummary[] = packageInputs.map((input) => ({
    name: input.packageName,
    packagePath: input.packagePath,
    effectCounts: {
      store: input.data.storePatterns.reduce((sum, p) => sum + p.count, 0),
      retrieve: input.data.retrievePatterns.reduce((sum, p) => sum + p.count, 0),
      external: input.data.externalPatterns.reduce((sum, p) => sum + p.count, 0),
      other: input.data.otherPatterns.reduce((sum, p) => sum + p.count, 0),
    },
    hasEffects:
      input.data.storePatterns.length > 0 ||
      input.data.retrievePatterns.length > 0 ||
      input.data.externalPatterns.length > 0 ||
      input.data.otherPatterns.length > 0,
    seedHash: input.seedHash,
  }));

  // Aggregate store patterns
  const storePatterns = aggregatePatterns(
    packageInputs.map((p) => ({
      name: p.packageName,
      patterns: p.data.storePatterns,
    }))
  );

  // Aggregate retrieve patterns
  const retrievePatterns = aggregatePatterns(
    packageInputs.map((p) => ({
      name: p.packageName,
      patterns: p.data.retrievePatterns,
    }))
  );

  // Aggregate external patterns
  const externalPatterns = aggregatePatterns(
    packageInputs.map((p) => ({
      name: p.packageName,
      patterns: p.data.externalPatterns,
    }))
  );

  // Find cross-package patterns (patterns that appear in 2+ packages)
  const allPatterns = [...storePatterns, ...retrievePatterns, ...externalPatterns];
  const crossPackagePatterns = allPatterns
    .filter((p) => p.isCrossPackage)
    .sort((a, b) => b.packages.length - a.packages.length || b.totalCount - a.totalCount);

  // Calculate totals
  const totalCounts = {
    store: packages.reduce((sum, p) => sum + p.effectCounts.store, 0),
    retrieve: packages.reduce((sum, p) => sum + p.effectCounts.retrieve, 0),
    external: packages.reduce((sum, p) => sum + p.effectCounts.external, 0),
    other: packages.reduce((sum, p) => sum + p.effectCounts.other, 0),
    packages: packages.length,
  };

  return {
    repoName,
    repoPath,
    packages,
    aggregatedPatterns: {
      storePatterns,
      retrievePatterns,
      externalPatterns,
      crossPackagePatterns,
    },
    totalCounts,
  };
}

// ============================================================================
// Seed Hash Functions
// ============================================================================

/**
 * Compute combined seed hash for all packages in a repo
 */
export async function computeRepoSeedHash(
  packagePaths: string[]
): Promise<{ hash: string | null; packageHashes: Map<string, string | null> }> {
  const packageHashes = new Map<string, string | null>();
  const hashes: string[] = [];

  for (const pkgPath of packagePaths) {
    const result = await computeSeedHash(pkgPath);
    packageHashes.set(pkgPath, result.hash);
    if (result.hash) {
      hashes.push(result.hash);
    }
  }

  const combinedHash = hashes.length > 0 ? combineHashes(hashes) : null;

  return {
    hash: combinedHash,
    packageHashes,
  };
}

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate repo-level effects markdown documentation
 *
 * @param data - Aggregated repo effects data
 * @param options - Generation options
 * @returns Markdown content with embedded metadata
 */
export function generateRepoEffectsDoc(
  data: RepoEffectsData,
  options: GenerateRepoEffectsDocOptions
): string {
  const { seedHash, repoPath, maxPatterns = 20 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const date = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    `# Repository Effects: ${data.repoName}`,
    "",
    "<!--",
    "  This file provides an aggregated view of effects across all packages.",
    "  Generated by: devac doc-sync --repo",
    "  ",
    "  See individual package docs for detailed mappings.",
    "-->",
    "",
    "## Summary",
    "",
    `- **Repository:** ${data.repoName}`,
    `- **Packages:** ${data.totalCounts.packages}`,
    `- **Last Updated:** ${date}`,
    "",
    "### Effect Counts",
    "",
    "| Category | Total | Packages With Effects |",
    "|----------|-------|----------------------|",
    `| Store | ${data.totalCounts.store} | ${data.packages.filter((p) => p.effectCounts.store > 0).length} |`,
    `| Retrieve | ${data.totalCounts.retrieve} | ${data.packages.filter((p) => p.effectCounts.retrieve > 0).length} |`,
    `| External | ${data.totalCounts.external} | ${data.packages.filter((p) => p.effectCounts.external > 0).length} |`,
    `| Other | ${data.totalCounts.other} | ${data.packages.filter((p) => p.effectCounts.other > 0).length} |`,
    "",
  ];

  // Packages Overview
  lines.push("## Packages");
  lines.push("");
  lines.push("| Package | Store | Retrieve | External | Other | Has Seed |");
  lines.push("|---------|-------|----------|----------|-------|----------|");
  for (const pkg of data.packages) {
    const hasSeed = pkg.seedHash ? "✓" : "✗";
    lines.push(
      `| ${pkg.name} | ${pkg.effectCounts.store} | ${pkg.effectCounts.retrieve} | ${pkg.effectCounts.external} | ${pkg.effectCounts.other} | ${hasSeed} |`
    );
  }
  lines.push("");

  // Cross-Package Patterns
  lines.push("## Cross-Package Patterns");
  lines.push("");
  lines.push("Patterns that appear in multiple packages:");
  lines.push("");
  if (data.aggregatedPatterns.crossPackagePatterns.length > 0) {
    lines.push("| Pattern | Total Count | Packages |");
    lines.push("|---------|-------------|----------|");
    for (const p of data.aggregatedPatterns.crossPackagePatterns.slice(0, maxPatterns)) {
      const pkgList = p.packages.map((pkg) => `${pkg.name}(${pkg.count})`).join(", ");
      lines.push(`| \`${p.pattern}\` | ${p.totalCount} | ${pkgList} |`);
    }
    if (data.aggregatedPatterns.crossPackagePatterns.length > maxPatterns) {
      lines.push(
        `| _...and ${data.aggregatedPatterns.crossPackagePatterns.length - maxPatterns} more_ | | |`
      );
    }
  } else {
    lines.push("_No patterns appear in multiple packages._");
  }
  lines.push("");

  // Top Store Patterns
  lines.push("## Top Store Patterns");
  lines.push("");
  if (data.aggregatedPatterns.storePatterns.length > 0) {
    lines.push("| Pattern | Total Count | Packages |");
    lines.push("|---------|-------------|----------|");
    for (const p of data.aggregatedPatterns.storePatterns.slice(0, maxPatterns)) {
      const pkgCount = p.packages.length;
      lines.push(`| \`${p.pattern}\` | ${p.totalCount} | ${pkgCount} |`);
    }
  } else {
    lines.push("_No store patterns detected._");
  }
  lines.push("");

  // Top Retrieve Patterns
  lines.push("## Top Retrieve Patterns");
  lines.push("");
  if (data.aggregatedPatterns.retrievePatterns.length > 0) {
    lines.push("| Pattern | Total Count | Packages |");
    lines.push("|---------|-------------|----------|");
    for (const p of data.aggregatedPatterns.retrievePatterns.slice(0, maxPatterns)) {
      const pkgCount = p.packages.length;
      lines.push(`| \`${p.pattern}\` | ${p.totalCount} | ${pkgCount} |`);
    }
  } else {
    lines.push("_No retrieve patterns detected._");
  }
  lines.push("");

  // Top External Patterns
  lines.push("## Top External Patterns");
  lines.push("");
  if (data.aggregatedPatterns.externalPatterns.length > 0) {
    lines.push("| Pattern | Total Count | Packages |");
    lines.push("|---------|-------------|----------|");
    for (const p of data.aggregatedPatterns.externalPatterns.slice(0, maxPatterns)) {
      const pkgCount = p.packages.length;
      lines.push(`| \`${p.pattern}\` | ${p.totalCount} | ${pkgCount} |`);
    }
  } else {
    lines.push("_No external patterns detected._");
  }
  lines.push("");

  // Package Details Links
  lines.push("## Package Details");
  lines.push("");
  lines.push("For detailed effect mappings, see individual package documentation:");
  lines.push("");
  for (const pkg of data.packages) {
    const relativePath = path.relative(data.repoPath, pkg.packagePath);
    lines.push(`- [${pkg.name}](${relativePath}/docs/package-effects.md)`);
  }
  lines.push("");

  return metadata + lines.join("\n");
}

/**
 * Generate empty repo effects doc when no packages have effects
 */
export function generateEmptyRepoEffectsDoc(
  repoName: string,
  options: GenerateRepoEffectsDocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const date = new Date().toISOString().split("T")[0];

  const lines = [
    `# Repository Effects: ${repoName}`,
    "",
    "<!--",
    "  This file provides an aggregated view of effects across all packages.",
    "  No effects were detected during analysis.",
    "-->",
    "",
    "## Summary",
    "",
    `- **Repository:** ${repoName}`,
    `- **Last Updated:** ${date}`,
    "",
    "_No effects detected. Run `devac analyze` on packages first._",
    "",
  ];

  return metadata + lines.join("\n");
}
