/**
 * Documentation Utilities for Workflow Commands
 *
 * Shared utilities for validating ADRs, READMEs, and other documentation.
 * All functions are synchronous for simplicity.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdrIndexEntry {
  /** ADR number (e.g., "0001") */
  number: string;
  /** Filename (e.g., "0001-replace-neo4j.md") */
  filename: string;
}

export interface AdrFormatIssue {
  /** ADR filename */
  file: string;
  /** Missing required sections */
  missingSections: string[];
  /** Invalid status value */
  invalidStatus?: string;
}

export interface AdrValidationResult {
  /** Whether the ADR index is in sync with files on disk */
  indexInSync: boolean;
  /** ADR files listed in README.md index */
  filesInIndex: string[];
  /** Actual ADR files on disk (excluding template.md, README.md) */
  filesOnDisk: string[];
  /** Files on disk that are not in the index */
  missingFromIndex: string[];
  /** Entries in index that have no corresponding file */
  missingFromDisk: string[];
  /** ADRs with format issues */
  formatIssues: AdrFormatIssue[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ADR Index Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the ADR index from docs/adr/README.md
 * Extracts ADR entries from the markdown table
 */
export function parseAdrIndex(repoRoot: string): AdrIndexEntry[] {
  const readmePath = path.join(repoRoot, "docs/adr/README.md");

  if (!fs.existsSync(readmePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(readmePath, "utf-8");
    const entries: AdrIndexEntry[] = [];

    // Match links in table: [0001](0001-replace-neo4j.md)
    const linkPattern = /\[(\d{4})\]\(([^)]+\.md)\)/g;

    for (const match of content.matchAll(linkPattern)) {
      const number = match[1];
      const filename = match[2];
      if (number && filename) {
        entries.push({ number, filename });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Get list of ADR files on disk (excluding template.md and README.md)
 */
export function getAdrFiles(repoRoot: string): string[] {
  const adrDir = path.join(repoRoot, "docs/adr");

  if (!fs.existsSync(adrDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(adrDir);
    return files.filter((f) => {
      // Only .md files
      if (!f.endsWith(".md")) return false;
      // Exclude template and README
      if (f === "template.md" || f === "README.md") return false;
      // Should match ADR naming pattern (NNNN-*.md)
      return /^\d{4}-/.test(f);
    });
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADR Format Validation
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ADR_SECTIONS = ["Status", "Context", "Decision", "Consequences"];
const VALID_ADR_STATUSES = ["Proposed", "Accepted", "Deprecated", "Superseded"];

/**
 * Validate ADR format - check for required sections
 */
export function validateAdrFormat(filePath: string): AdrFormatIssue | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const missingSections: string[] = [];
    let invalidStatus: string | undefined;

    // Check for required sections (## Section)
    for (const section of REQUIRED_ADR_SECTIONS) {
      const sectionPattern = new RegExp(`^##\\s+${section}`, "im");
      if (!sectionPattern.test(content)) {
        missingSections.push(section);
      }
    }

    // Check Status value if Status section exists
    const statusMatch = content.match(/^##\s+Status\s*\n+([^\n#]+)/im);
    if (statusMatch) {
      const statusValue = statusMatch[1]?.trim() ?? "";
      // Status should be one of the valid values (may have additional text like "Superseded by ADR-XXX")
      const isValidStatus = VALID_ADR_STATUSES.some((valid) =>
        statusValue.toLowerCase().startsWith(valid.toLowerCase())
      );
      if (!isValidStatus && statusValue) {
        invalidStatus = statusValue;
      }
    }

    if (missingSections.length === 0 && !invalidStatus) {
      return null;
    }

    return {
      file: path.basename(filePath),
      missingSections,
      invalidStatus,
    };
  } catch {
    return null;
  }
}

/**
 * Validate all ADRs in the repository
 */
export function validateAllAdrs(repoRoot: string): AdrValidationResult {
  const indexEntries = parseAdrIndex(repoRoot);
  const filesOnDisk = getAdrFiles(repoRoot);

  const filesInIndex = indexEntries.map((e) => e.filename);

  // Find files missing from index
  const missingFromIndex = filesOnDisk.filter((f) => !filesInIndex.includes(f));

  // Find entries in index with no file
  const missingFromDisk = filesInIndex.filter((f) => !filesOnDisk.includes(f));

  // Validate format of all ADR files
  const formatIssues: AdrFormatIssue[] = [];
  const adrDir = path.join(repoRoot, "docs/adr");

  for (const file of filesOnDisk) {
    const filePath = path.join(adrDir, file);
    const issue = validateAdrFormat(filePath);
    if (issue) {
      formatIssues.push(issue);
    }
  }

  const indexInSync = missingFromIndex.length === 0 && missingFromDisk.length === 0;

  return {
    indexInSync,
    filesInIndex,
    filesOnDisk,
    missingFromIndex,
    missingFromDisk,
    formatIssues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Package README Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a package has a README.md file
 */
export function packageHasReadme(packagePath: string, repoRoot: string): boolean {
  const readmePath = path.join(repoRoot, packagePath, "README.md");
  return fs.existsSync(readmePath);
}

/**
 * Get packages that are missing README files
 */
export function getPackagesWithoutReadme(packagePaths: string[], repoRoot: string): string[] {
  return packagePaths.filter((pkg) => !packageHasReadme(pkg, repoRoot));
}

// ─────────────────────────────────────────────────────────────────────────────
// File Categorization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a file is a documentation file
 */
export function isDocFile(filePath: string): boolean {
  // Files in docs/ directory
  if (filePath.startsWith("docs/")) return true;
  // Markdown files in root or common locations
  if (filePath.endsWith(".md")) return true;
  return false;
}

/**
 * Check if a file is a source file (in packages/.../src/)
 */
export function isSourceFile(filePath: string): boolean {
  return /^packages\/[^/]+\/src\//.test(filePath);
}

/**
 * Categorize changed files into docs and source
 */
export function categorizeChangedFiles(files: string[]): {
  docsChanged: string[];
  sourceChanged: string[];
} {
  const docsChanged = files.filter(isDocFile);
  const sourceChanged = files.filter(isSourceFile);
  return { docsChanged, sourceChanged };
}
