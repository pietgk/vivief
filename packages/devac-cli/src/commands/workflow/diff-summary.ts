/**
 * Workflow Diff Summary Command
 *
 * Provides structured diff information for LLM to draft:
 * - Commit messages
 * - PR descriptions
 * - Changeset content
 */

import * as path from "node:path";
import {
  type CommitInfo,
  type DiffStats,
  type FileChange,
  getCommitsSinceBranch,
  getCurrentBranch,
  getDefaultBranch,
  getDiffSinceBranch,
  getDiffStatsSinceBranch,
  getFileChangesSinceBranch,
  getGitRoot,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
} from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffSummaryOptions {
  /** Path to repository root */
  path?: string;
  /** Base branch to compare against */
  base?: string;
  /** Include full diff content (for LLM context) */
  includeContent?: boolean;
  /** Use staged changes instead of branch diff */
  staged?: boolean;
  /** Maximum diff size to include (chars) */
  maxDiffSize?: number;
  /** Output as JSON */
  json?: boolean;
}

export interface PackageChanges {
  files: string[];
  additions: number;
  deletions: number;
}

export interface CategoryChanges {
  source: string[];
  tests: string[];
  docs: string[];
  config: string[];
  other: string[];
}

export interface DiffSummaryResult {
  success: boolean;
  error?: string;

  /** Current branch */
  branch: string;
  /** Base branch */
  base: string;
  /** Whether using staged changes */
  staged: boolean;

  /** Commits on this branch (empty if staged mode) */
  commits: CommitInfo[];

  /** Files changed */
  files: string[];

  /** Changes grouped by package */
  byPackage: Record<string, PackageChanges>;

  /** Changes grouped by category */
  byCategory: CategoryChanges;

  /** Overall statistics */
  stats: DiffStats;

  /** Diff content (if includeContent) */
  diff?: string;

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categorize a file path
 */
function categorizeFile(file: string): keyof CategoryChanges {
  const lower = file.toLowerCase();

  // Source files
  if (file.includes("/src/") || file.match(/\.(ts|tsx|js|jsx|py|cs)$/)) {
    if (!file.includes("test") && !file.includes("spec")) {
      return "source";
    }
  }

  // Test files
  if (
    file.includes("__tests__/") ||
    file.includes("/test/") ||
    file.includes("/tests/") ||
    file.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)
  ) {
    return "tests";
  }

  // Documentation
  if (
    file.includes("/docs/") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".rst")
  ) {
    return "docs";
  }

  // Config files
  if (
    file.includes("config") ||
    file.match(/\.(json|yaml|yml|toml)$/) ||
    file.includes(".husky/") ||
    file.includes(".github/") ||
    lower === "package.json" ||
    lower === "tsconfig.json" ||
    lower === "biome.json"
  ) {
    return "config";
  }

  return "other";
}

/**
 * Extract package name from file path
 */
function extractPackage(file: string): string | undefined {
  // Match packages/*/... pattern
  const match = file.match(/^packages\/([^/]+)\//);
  return match ? match[1] : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get diff summary
 */
export async function diffSummaryCommand(options: DiffSummaryOptions): Promise<DiffSummaryResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();
  const maxDiffSize = options.maxDiffSize ?? 50000;

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      branch: "",
      base: "",
      staged: false,
      commits: [],
      files: [],
      byPackage: {},
      byCategory: { source: [], tests: [], docs: [], config: [], other: [] },
      stats: { filesChanged: 0, additions: 0, deletions: 0 },
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;
  const branch = getCurrentBranch(repoRoot);
  const base = options.base || getDefaultBranch(repoRoot);
  const useStaged = options.staged ?? false;

  let files: string[];
  let fileChanges: FileChange[];
  let commits: CommitInfo[] = [];
  let diff: string | undefined;

  if (useStaged) {
    // Use staged changes
    files = getStagedFiles(repoRoot);
    fileChanges = files.map((f) => ({ file: f, additions: 0, deletions: 0 }));

    if (options.includeContent) {
      const stagedDiff = getStagedDiff(repoRoot);
      diff =
        stagedDiff.length <= maxDiffSize
          ? stagedDiff
          : `${stagedDiff.slice(0, maxDiffSize)}\n... (truncated)`;
    }
  } else {
    // Use branch diff
    fileChanges = getFileChangesSinceBranch(base, repoRoot);
    files = fileChanges.map((fc) => fc.file);
    commits = getCommitsSinceBranch(base, repoRoot);

    if (options.includeContent) {
      const branchDiff = getDiffSinceBranch(base, repoRoot);
      diff =
        branchDiff.length <= maxDiffSize
          ? branchDiff
          : `${branchDiff.slice(0, maxDiffSize)}\n... (truncated)`;
    }
  }

  // Group by package
  const byPackage: Record<string, PackageChanges> = {};
  for (const fc of fileChanges) {
    const pkg = extractPackage(fc.file);
    if (pkg) {
      if (!byPackage[pkg]) {
        byPackage[pkg] = { files: [], additions: 0, deletions: 0 };
      }
      byPackage[pkg].files.push(fc.file);
      byPackage[pkg].additions += fc.additions;
      byPackage[pkg].deletions += fc.deletions;
    }
  }

  // Group by category
  const byCategory: CategoryChanges = {
    source: [],
    tests: [],
    docs: [],
    config: [],
    other: [],
  };
  for (const file of files) {
    const category = categorizeFile(file);
    byCategory[category].push(file);
  }

  // Get stats
  const stats = useStaged
    ? { filesChanged: files.length, additions: 0, deletions: 0 }
    : getDiffStatsSinceBranch(base, repoRoot);

  const result: DiffSummaryResult = {
    success: true,
    branch,
    base,
    staged: useStaged,
    commits,
    files,
    byPackage,
    byCategory,
    stats,
    diff,
  };

  // Format output
  if (!options.json) {
    result.formatted = formatDiffSummaryResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatDiffSummaryResult(result: DiffSummaryResult): string {
  const lines: string[] = [];

  lines.push("Diff Summary");
  lines.push("─".repeat(40));

  lines.push(`  Branch: ${result.branch}`);
  lines.push(`  Base:   ${result.base}`);
  lines.push(`  Mode:   ${result.staged ? "staged" : "branch diff"}`);

  // Stats
  lines.push("");
  lines.push(`  Files changed: ${result.stats.filesChanged}`);
  if (!result.staged) {
    lines.push(`  Additions:     +${result.stats.additions}`);
    lines.push(`  Deletions:     -${result.stats.deletions}`);
  }

  // Commits
  if (result.commits.length > 0) {
    lines.push("");
    lines.push(`  Commits (${result.commits.length}):`);
    for (const commit of result.commits.slice(0, 5)) {
      lines.push(`    ${commit.sha} ${commit.message}`);
    }
    if (result.commits.length > 5) {
      lines.push(`    ... and ${result.commits.length - 5} more`);
    }
  }

  // By package
  const packages = Object.keys(result.byPackage);
  if (packages.length > 0) {
    lines.push("");
    lines.push("  By package:");
    for (const pkg of packages) {
      const changes = result.byPackage[pkg];
      if (changes) {
        lines.push(
          `    ${pkg}: ${changes.files.length} files (+${changes.additions}/-${changes.deletions})`
        );
      }
    }
  }

  // By category
  lines.push("");
  lines.push("  By category:");
  if (result.byCategory.source.length > 0) {
    lines.push(`    Source: ${result.byCategory.source.length} files`);
  }
  if (result.byCategory.tests.length > 0) {
    lines.push(`    Tests:  ${result.byCategory.tests.length} files`);
  }
  if (result.byCategory.docs.length > 0) {
    lines.push(`    Docs:   ${result.byCategory.docs.length} files`);
  }
  if (result.byCategory.config.length > 0) {
    lines.push(`    Config: ${result.byCategory.config.length} files`);
  }
  if (result.byCategory.other.length > 0) {
    lines.push(`    Other:  ${result.byCategory.other.length} files`);
  }

  return lines.join("\n");
}
