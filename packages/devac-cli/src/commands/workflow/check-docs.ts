/**
 * Workflow Check Docs Command
 *
 * Validates documentation health:
 * - ADR index in sync with files on disk
 * - ADR format (required sections)
 * - Package READMEs exist for changed packages
 *
 * Returns structured data for LLM reasoning about doc updates.
 */

import * as path from "node:path";
import {
  type AdrFormatIssue,
  categorizeChangedFiles,
  getPackagesWithoutReadme,
  validateAllAdrs,
} from "../../utils/doc-utils.js";
import {
  getChangedFilesSinceBranch,
  getDefaultBranch,
  getGitRoot,
  isGitRepo,
} from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckDocsOptions {
  /** Path to repository root */
  path?: string;
  /** Base branch to compare against (default: auto-detect main/master) */
  base?: string;
  /** Output as JSON */
  json?: boolean;
}

export interface DocIssue {
  /** Issue type */
  type: "adr-index-sync" | "adr-format" | "missing-readme";
  /** Severity: error for must-fix, warning for should-fix */
  severity: "error" | "warning";
  /** Related file */
  file: string;
  /** Human-readable message */
  message: string;
}

export interface CheckDocsResult {
  success: boolean;
  error?: string;

  /** Whether documentation is in good state (no issues) */
  ready: boolean;
  /** All documentation issues found */
  issues: DocIssue[];
  /** Non-blocking suggestions */
  suggestions: string[];

  /** ADR validation results */
  adr: {
    /** Whether ADR index matches files on disk */
    indexInSync: boolean;
    /** ADR files listed in README.md */
    filesInIndex: string[];
    /** Actual ADR files on disk */
    filesOnDisk: string[];
    /** Files on disk not in index */
    missingFromIndex: string[];
    /** Index entries with no file */
    missingFromDisk: string[];
    /** ADRs with format issues */
    formatIssues: AdrFormatIssue[];
  };

  /** Package README validation */
  packageReadmes: {
    /** Packages that have source changes */
    packagesWithChanges: string[];
    /** Packages missing README.md */
    packagesMissingReadme: string[];
  };

  /** Context for LLM reasoning */
  changedFiles: string[];
  /** Documentation files changed */
  docsChanged: string[];
  /** Source files changed */
  sourceChanged: string[];

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Package Detection (reuse from check-changeset logic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract package path from a file path
 * e.g., "packages/devac-core/src/index.ts" -> "packages/devac-core"
 */
function getPackagePath(filePath: string): string | undefined {
  const match = filePath.match(/^(packages\/[^/]+)\//);
  return match?.[1];
}

/**
 * Get unique package paths from changed files
 */
function getChangedPackages(files: string[]): string[] {
  const packages = new Set<string>();
  for (const file of files) {
    // Only consider source files for package detection
    if (file.includes("/src/")) {
      const pkg = getPackagePath(file);
      if (pkg) {
        packages.add(pkg);
      }
    }
  }
  return Array.from(packages);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check documentation health
 */
export async function checkDocsCommand(options: CheckDocsOptions): Promise<CheckDocsResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      ready: false,
      issues: [],
      suggestions: [],
      adr: {
        indexInSync: true,
        filesInIndex: [],
        filesOnDisk: [],
        missingFromIndex: [],
        missingFromDisk: [],
        formatIssues: [],
      },
      packageReadmes: {
        packagesWithChanges: [],
        packagesMissingReadme: [],
      },
      changedFiles: [],
      docsChanged: [],
      sourceChanged: [],
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;
  const base = options.base || getDefaultBranch(cwd);

  // Get changed files
  const changedFiles = getChangedFilesSinceBranch(base, cwd);

  // Categorize files
  const { docsChanged, sourceChanged } = categorizeChangedFiles(changedFiles);

  // Get packages with source changes
  const packagesWithChanges = getChangedPackages(changedFiles);

  // Validate ADRs
  const adrValidation = validateAllAdrs(repoRoot);

  // Check package READMEs
  const packagesMissingReadme = getPackagesWithoutReadme(packagesWithChanges, repoRoot);

  // Build issues list
  const issues: DocIssue[] = [];
  const suggestions: string[] = [];

  // ADR index sync issues
  for (const file of adrValidation.missingFromIndex) {
    issues.push({
      type: "adr-index-sync",
      severity: "warning",
      file,
      message: `ADR file exists but not in docs/adr/README.md index: ${file}`,
    });
  }

  for (const file of adrValidation.missingFromDisk) {
    issues.push({
      type: "adr-index-sync",
      severity: "error",
      file,
      message: `ADR listed in index but file not found: ${file}`,
    });
  }

  // ADR format issues
  for (const formatIssue of adrValidation.formatIssues) {
    const details: string[] = [];
    if (formatIssue.missingSections.length > 0) {
      details.push(`missing sections: ${formatIssue.missingSections.join(", ")}`);
    }
    if (formatIssue.invalidStatus) {
      details.push(`invalid status: "${formatIssue.invalidStatus}"`);
    }
    issues.push({
      type: "adr-format",
      severity: "warning",
      file: formatIssue.file,
      message: `ADR format issue in ${formatIssue.file}: ${details.join("; ")}`,
    });
  }

  // Missing README issues
  for (const pkg of packagesMissingReadme) {
    issues.push({
      type: "missing-readme",
      severity: "warning",
      file: `${pkg}/README.md`,
      message: `Package ${pkg} has source changes but no README.md`,
    });
  }

  // Add suggestions based on changes
  if (sourceChanged.length > 0 && docsChanged.length === 0) {
    suggestions.push(
      "Source files changed but no documentation updated - consider if docs need updating"
    );
  }

  // Suggest ADR for architectural changes (heuristic: new files in certain patterns)
  const newExports = changedFiles.filter((f) => f.includes("/src/index.ts"));
  if (newExports.length > 0) {
    suggestions.push(
      "Changes to package exports detected - consider if an ADR is needed for architectural decisions"
    );
  }

  const ready = issues.length === 0;

  const result: CheckDocsResult = {
    success: true,
    ready,
    issues,
    suggestions,
    adr: {
      indexInSync: adrValidation.indexInSync,
      filesInIndex: adrValidation.filesInIndex,
      filesOnDisk: adrValidation.filesOnDisk,
      missingFromIndex: adrValidation.missingFromIndex,
      missingFromDisk: adrValidation.missingFromDisk,
      formatIssues: adrValidation.formatIssues,
    },
    packageReadmes: {
      packagesWithChanges,
      packagesMissingReadme,
    },
    changedFiles,
    docsChanged,
    sourceChanged,
  };

  // Format output
  if (!options.json) {
    result.formatted = formatCheckDocsResult(result);
  }

  return result;
}

/**
 * Format result for CLI output
 */
function formatCheckDocsResult(result: CheckDocsResult): string {
  const lines: string[] = [];

  lines.push("Documentation Check");
  lines.push("─".repeat(40));

  // ADR status
  lines.push("");
  lines.push("  ADRs:");
  lines.push(`    Files in index: ${result.adr.filesInIndex.length}`);
  lines.push(`    Files on disk:  ${result.adr.filesOnDisk.length}`);
  if (result.adr.indexInSync) {
    lines.push("    Index status:   In sync");
  } else {
    lines.push("    Index status:   OUT OF SYNC");
    if (result.adr.missingFromIndex.length > 0) {
      lines.push(`    Missing from index: ${result.adr.missingFromIndex.join(", ")}`);
    }
    if (result.adr.missingFromDisk.length > 0) {
      lines.push(`    Missing files: ${result.adr.missingFromDisk.join(", ")}`);
    }
  }

  // Package READMEs
  if (result.packageReadmes.packagesWithChanges.length > 0) {
    lines.push("");
    lines.push("  Package READMEs:");
    lines.push(`    Packages with changes: ${result.packageReadmes.packagesWithChanges.length}`);
    if (result.packageReadmes.packagesMissingReadme.length > 0) {
      lines.push(`    Missing README: ${result.packageReadmes.packagesMissingReadme.join(", ")}`);
    } else {
      lines.push("    All packages have README.md");
    }
  }

  // Issues
  if (result.issues.length > 0) {
    lines.push("");
    lines.push("  Issues:");
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "ERROR" : "WARN";
      lines.push(`    [${icon}] ${issue.message}`);
    }
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push("");
    lines.push("  Suggestions:");
    for (const suggestion of result.suggestions) {
      lines.push(`    - ${suggestion}`);
    }
  }

  // Summary
  lines.push("");
  if (result.ready) {
    lines.push("  Documentation: OK");
  } else {
    lines.push(`  Documentation: ${result.issues.length} issue(s) found`);
  }

  return lines.join("\n");
}
