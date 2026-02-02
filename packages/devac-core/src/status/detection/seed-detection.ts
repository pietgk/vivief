/**
 * Seed Detection Module
 *
 * Smart seed staleness detection:
 * - Store lastAnalyzedCommit in seed metadata
 * - Compare with current HEAD to detect changes
 * - Filter to only source files that affect analysis
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execGit } from "../../utils/git.js";
import type { PackageSeedStateEnhanced, SeedStalenessReason } from "../types.js";
import { commitExists, getCurrentCommit } from "./git-detection.js";

// Use shared git utility
const git = execGit;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed metadata stored in .devac/seed/meta.json
 */
export interface SeedMetadata {
  /** Schema version written by seed-writer (e.g., "2.1") */
  schemaVersion?: string;
  /** Version of the seed format (deprecated, use schemaVersion) */
  version?: string;
  /** Commit hash when seeds were last analyzed */
  lastAnalyzedCommit?: string;
  /** ISO timestamp when seeds were last analyzed */
  lastAnalyzedAt?: string;
  /** Package name */
  packageName?: string;
  /** Analysis configuration hash */
  configHash?: string;
}

/**
 * Options for staleness detection.
 */
export interface StalenessOptions {
  /** Whether to check config changes (default: true) */
  checkConfig?: boolean;
  /** Custom source file patterns to check */
  sourcePatterns?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default source file patterns that affect analysis.
 */
const DEFAULT_SOURCE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.py",
  "**/*.cs",
  "**/*.json", // package.json, tsconfig.json can affect analysis
];

/**
 * Patterns to exclude from source file detection.
 */
const EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.devac/**",
  "**/coverage/**",
  "**/__snapshots__/**",
];

/**
 * Get files changed between two commits.
 */
function getChangedFiles(cwd: string, fromCommit: string, toCommit: string): string[] {
  const output = git(`diff --name-only ${fromCommit}..${toCommit}`, cwd);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

/**
 * Filter files to only source files (excluding node_modules, etc.).
 */
function filterSourceFiles(files: string[]): string[] {
  return files.filter((file) => {
    // Check if file matches any exclude pattern
    for (const pattern of EXCLUDE_PATTERNS) {
      const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
      if (new RegExp(regexPattern).test(file)) {
        return false;
      }
    }

    // Check if file matches any source pattern
    for (const pattern of DEFAULT_SOURCE_PATTERNS) {
      const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
      if (new RegExp(regexPattern).test(file)) {
        return true;
      }
    }

    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed Metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read seed metadata from .devac/seed/meta.json
 */
export async function readSeedMetadata(packagePath: string): Promise<SeedMetadata | null> {
  const metaPath = path.join(packagePath, ".devac", "seed", "meta.json");
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(content) as SeedMetadata;
  } catch {
    return null;
  }
}

/**
 * Write seed metadata to .devac/seed/meta.json
 */
export async function writeSeedMetadata(
  packagePath: string,
  metadata: SeedMetadata
): Promise<void> {
  const seedDir = path.join(packagePath, ".devac", "seed");
  const metaPath = path.join(seedDir, "meta.json");

  // Ensure directory exists
  await fs.mkdir(seedDir, { recursive: true });

  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
}

/**
 * Update seed metadata with current commit.
 */
export async function updateSeedMetadataCommit(packagePath: string): Promise<void> {
  const currentCommit = getCurrentCommit(packagePath);
  if (!currentCommit) return;

  const existing = await readSeedMetadata(packagePath);
  const metadata: SeedMetadata = {
    // Preserve schemaVersion written by seed-writer
    schemaVersion: existing?.schemaVersion,
    version: existing?.version ?? "1.0",
    packageName: existing?.packageName,
    configHash: existing?.configHash,
    lastAnalyzedCommit: currentCommit,
    lastAnalyzedAt: new Date().toISOString(),
  };

  await writeSeedMetadata(packagePath, metadata);
}

// ─────────────────────────────────────────────────────────────────────────────
// Staleness Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect if seeds are stale and need reanalysis.
 */
export async function detectSeedStaleness(
  packagePath: string,
  options: StalenessOptions = {}
): Promise<PackageSeedStateEnhanced["needsUpdate"]> {
  const metadata = await readSeedMetadata(packagePath);
  const currentCommit = getCurrentCommit(packagePath);

  // If no metadata or no lastAnalyzedCommit, seeds need update
  if (!metadata?.lastAnalyzedCommit) {
    return {
      stale: true,
      reason: "source-changed",
      changedFiles: [],
      currentCommit: currentCommit ?? undefined,
    };
  }

  // If no current commit (not in git), can't determine staleness
  if (!currentCommit) {
    return {
      stale: false,
      changedFiles: [],
      lastAnalyzedCommit: metadata.lastAnalyzedCommit,
    };
  }

  // If lastAnalyzedCommit doesn't exist in history (rebased away, etc.)
  if (!commitExists(packagePath, metadata.lastAnalyzedCommit)) {
    return {
      stale: true,
      reason: "missing-commit",
      changedFiles: [],
      lastAnalyzedCommit: metadata.lastAnalyzedCommit,
      currentCommit,
    };
  }

  // If commits are the same, no changes
  if (metadata.lastAnalyzedCommit === currentCommit) {
    return {
      stale: false,
      changedFiles: [],
      lastAnalyzedCommit: metadata.lastAnalyzedCommit,
      currentCommit,
    };
  }

  // Get changed files between commits
  const allChangedFiles = getChangedFiles(packagePath, metadata.lastAnalyzedCommit, currentCommit);

  // Filter to only source files
  const changedSourceFiles = filterSourceFiles(allChangedFiles);

  // Check for config changes
  const configFiles = allChangedFiles.filter(
    (f) =>
      f === "package.json" ||
      f === "tsconfig.json" ||
      f === ".devac/config.json" ||
      f.endsWith("devac.config.ts") ||
      f.endsWith("devac.config.js")
  );

  // Determine staleness reason
  let reason: SeedStalenessReason | undefined;
  if (configFiles.length > 0 && options.checkConfig !== false) {
    reason = "config-changed";
  } else if (changedSourceFiles.length > 0) {
    reason = "source-changed";
  }

  return {
    stale: changedSourceFiles.length > 0 || configFiles.length > 0,
    reason,
    changedFiles: changedSourceFiles,
    lastAnalyzedCommit: metadata.lastAnalyzedCommit,
    currentCommit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Package State Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a directory exists.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get last modified time of a directory.
 */
async function getLastModified(dirPath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Detect enhanced package seed state with staleness information.
 */
export async function detectPackageSeedStateEnhanced(
  packagePath: string,
  packageName?: string
): Promise<PackageSeedStateEnhanced> {
  const basePath = path.join(packagePath, ".devac", "seed", "base");
  const branchPath = path.join(packagePath, ".devac", "seed", "branch");

  // Check seed existence
  const [hasBase, hasDelta] = await Promise.all([
    directoryExists(basePath),
    directoryExists(branchPath),
  ]);

  // Get timestamps
  const [baseLastModified, deltaLastModified] = await Promise.all([
    hasBase ? getLastModified(basePath) : Promise.resolve(undefined),
    hasDelta ? getLastModified(branchPath) : Promise.resolve(undefined),
  ]);

  // Get metadata for last analyzed info
  const metadata = await readSeedMetadata(packagePath);

  // Detect staleness
  const staleness = await detectSeedStaleness(packagePath);

  // Compute state
  let state: "none" | "base" | "delta" | "both";
  if (hasBase && hasDelta) {
    state = "both";
  } else if (hasBase) {
    state = "base";
  } else if (hasDelta) {
    state = "delta";
  } else {
    state = "none";
  }

  return {
    packagePath,
    packageName: packageName ?? path.basename(packagePath),
    seeds: {
      hasBase,
      hasDelta,
      state,
    },
    needsUpdate: staleness,
    timestamps: {
      baseLastModified,
      deltaLastModified,
      lastAnalyzedAt: metadata?.lastAnalyzedAt,
    },
  };
}
