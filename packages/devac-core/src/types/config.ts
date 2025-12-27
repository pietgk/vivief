/**
 * Configuration Types
 *
 * Based on DevAC v2.0 spec Section 5.3 and throughout
 */

/**
 * Schema version for Parquet files
 */
export const SCHEMA_VERSION = "2.1";

/**
 * Meta.json format (ultra-minimal per spec)
 */
export interface SeedMeta {
  schemaVersion: string;
}

/**
 * Package configuration
 */
export interface PackageConfig {
  /** Package root directory (absolute path) */
  packagePath: string;

  /** Repository name for entity IDs */
  repoName: string;

  /** Package path relative to repo root */
  packageRelativePath: string;

  /** Branch name (default: "base") */
  branch: string;
}

/**
 * Analysis options
 */
export interface AnalysisOptions {
  /** Force re-analysis even if hashes match */
  force: boolean;

  /** Only analyze if files changed (hash check) */
  ifChanged: boolean;

  /** Include node_modules (default: false) */
  includeNodeModules: boolean;

  /** File patterns to include (glob) */
  includePatterns: string[];

  /** File patterns to exclude (glob) */
  excludePatterns: string[];

  /** Maximum concurrent file parses */
  concurrency: number;

  /** Timeout per file in ms */
  fileTimeoutMs: number;
}

/**
 * Default analysis options
 */
export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  force: false,
  ifChanged: true,
  includeNodeModules: false,
  includePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  excludePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.devac/**",
    "**/.git/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/*.min.js",
  ],
  concurrency: 4,
  fileTimeoutMs: 30000,
};

/**
 * Seed directory paths
 */
export interface SeedPaths {
  /** Root seed directory (.devac/seed) */
  seedRoot: string;

  /** Base partition directory */
  basePath: string;

  /** Branch partition directory */
  branchPath: string;

  /** Path to nodes.parquet */
  nodesParquet: string;

  /** Path to edges.parquet */
  edgesParquet: string;

  /** Path to external_refs.parquet */
  refsParquet: string;

  /** Path to effects.parquet (v3.0 foundation) */
  effectsParquet: string;

  /** Path to meta.json */
  metaJson: string;

  /** Path to lock file */
  lockFile: string;
}

/**
 * Get seed paths for a package
 */
export function getSeedPaths(packagePath: string, branch = "base"): SeedPaths {
  const seedRoot = `${packagePath}/.devac/seed`;
  const partitionPath = branch === "base" ? `${seedRoot}/base` : `${seedRoot}/branch`;

  return {
    seedRoot,
    basePath: `${seedRoot}/base`,
    branchPath: `${seedRoot}/branch`,
    nodesParquet: `${partitionPath}/nodes.parquet`,
    edgesParquet: `${partitionPath}/edges.parquet`,
    refsParquet: `${partitionPath}/external_refs.parquet`,
    effectsParquet: `${partitionPath}/effects.parquet`,
    metaJson: `${seedRoot}/meta.json`,
    lockFile: `${seedRoot}/.devac.lock`,
  };
}

/**
 * CLI output format options
 */
export type OutputFormat = "json" | "csv" | "table" | "pretty";

/**
 * Query options
 */
export interface QueryOptions {
  /** Output format */
  format: OutputFormat;

  /** Maximum rows to return */
  limit: number;

  /** Pretty print JSON output */
  pretty: boolean;
}

/**
 * Default query options
 */
export const DEFAULT_QUERY_OPTIONS: QueryOptions = {
  format: "table",
  limit: 1000,
  pretty: true,
};
