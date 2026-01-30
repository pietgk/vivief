/**
 * CLI Command Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Section 11: CLI Interface
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Import CLI commands (to be implemented)
import {
  type AnalyzeOptions,
  type CleanOptions,
  type QueryOptions,
  type VerifyOptions,
  analyzeCommand,
  cleanCommand,
  queryCommand,
  verifyCommand,
} from "../src/commands/index.js";

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("CLI: analyze command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-cli-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("analyzes current directory by default", async () => {
    // Copy fixture to temp dir
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });

    const options: AnalyzeOptions = {
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    };

    const result = await analyzeCommand(options);

    expect(result.success).toBe(true);
    expect(result.filesAnalyzed).toBeGreaterThan(0);
    expect(result.nodesCreated).toBeGreaterThan(0);

    // Should have created seed files
    const seedPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const exists = await fs
      .access(seedPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("analyzes specific package with --package option", async () => {
    // Create a package structure
    const pkgPath = path.join(tempDir, "packages", "auth");
    await fs.mkdir(pkgPath, { recursive: true });
    await fs.cp(FIXTURES_DIR, path.join(pkgPath, "src"), { recursive: true });

    const options: AnalyzeOptions = {
      packagePath: pkgPath,
      repoName: "test-repo",
      branch: "main",
    };

    const result = await analyzeCommand(options);

    expect(result.success).toBe(true);
    expect(result.filesAnalyzed).toBeGreaterThan(0);

    // Seed should be in the package's .devac folder
    const seedPath = path.join(pkgPath, ".devac", "seed", "base", "nodes.parquet");
    const exists = await fs
      .access(seedPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("skips analysis when --if-changed and files unchanged", async () => {
    // Copy only valid TypeScript files (exclude error.ts and invalid.ts which have intentional syntax errors)
    const srcDir = path.join(tempDir, "src");
    await fs.mkdir(srcDir, { recursive: true });
    const fixtureFiles = await fs.readdir(FIXTURES_DIR, {
      withFileTypes: true,
    });
    for (const entry of fixtureFiles) {
      // Skip files with intentional syntax errors and directories
      if (entry.name === "error.ts" || entry.name === "invalid.ts") continue;
      const srcPath = path.join(FIXTURES_DIR, entry.name);
      const destPath = path.join(srcDir, entry.name);
      await fs.cp(srcPath, destPath, { recursive: entry.isDirectory() });
    }

    const options: AnalyzeOptions = {
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    };

    // First analysis
    const result1 = await analyzeCommand(options);
    expect(result1.success).toBe(true);
    expect(result1.filesAnalyzed).toBeGreaterThan(0);

    // Second analysis with if-changed flag
    const optionsIfChanged: AnalyzeOptions = {
      ...options,
      ifChanged: true,
    };

    const result2 = await analyzeCommand(optionsIfChanged);
    expect(result2.success).toBe(true);
    expect(result2.skipped).toBe(true); // No changes detected
  });

  it("forces full reanalysis with --force flag", async () => {
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });

    const options: AnalyzeOptions = {
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    };

    // First analysis
    await analyzeCommand(options);

    // Force reanalysis
    const optionsForce: AnalyzeOptions = {
      ...options,
      force: true,
    };

    const result = await analyzeCommand(optionsForce);
    expect(result.success).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(result.filesAnalyzed).toBeGreaterThan(0);
  });

  it("reports errors gracefully for invalid paths", async () => {
    const options: AnalyzeOptions = {
      packagePath: "/nonexistent/path",
      repoName: "test-repo",
      branch: "main",
    };

    const result = await analyzeCommand(options);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("CLI: query command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-query-test-"));

    // Setup: analyze fixtures first
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
    await analyzeCommand({
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("executes SQL query against seeds", async () => {
    const parquetPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const options: QueryOptions = {
      sql: `SELECT * FROM read_parquet('${parquetPath}') LIMIT 5`,
      packagePath: tempDir,
      format: "json",
    };

    const result = await queryCommand(options);

    expect(result.success).toBe(true);
    expect(result.rows).toBeDefined();
    expect(result.rows?.length).toBeLessThanOrEqual(5);
  });

  it("returns results in JSON format", async () => {
    const parquetPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const options: QueryOptions = {
      sql: `SELECT name, kind FROM read_parquet('${parquetPath}') WHERE kind = 'class'`,
      packagePath: tempDir,
      format: "json",
    };

    const result = await queryCommand(options);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);

    // Each row should have name and kind
    expect(result.rows).toBeDefined();
    for (const row of result.rows ?? []) {
      expect(row).toHaveProperty("name");
      expect(row).toHaveProperty("kind");
      expect(row.kind).toBe("class");
    }
  });

  it("returns results in CSV format", async () => {
    const parquetPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const options: QueryOptions = {
      sql: `SELECT name, kind FROM read_parquet('${parquetPath}') LIMIT 3`,
      packagePath: tempDir,
      format: "csv",
    };

    const result = await queryCommand(options);

    expect(result.success).toBe(true);
    expect(result.csv).toBeDefined();
    expect(result.csv).toContain("name"); // Header
    expect(result.csv).toContain("kind"); // Header
  });

  it("returns results in table format", async () => {
    const parquetPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const options: QueryOptions = {
      sql: `SELECT name, kind FROM read_parquet('${parquetPath}') LIMIT 3`,
      packagePath: tempDir,
      format: "table",
    };

    const result = await queryCommand(options);

    expect(result.success).toBe(true);
    expect(result.table).toBeDefined();
    // Table format should have some structure
    expect(result.table?.length).toBeGreaterThan(0);
  });

  it("reports errors for invalid SQL", async () => {
    const options: QueryOptions = {
      sql: "SELECT * FROM nonexistent_table",
      packagePath: tempDir,
      format: "json",
    };

    const result = await queryCommand(options);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("CLI: verify command", () => {
  // Each test creates its own tempDir to avoid race conditions with maxConcurrency > 1
  // Previously, shared tempDir variable caused flaky tests when tests ran concurrently

  it("verifies valid seeds as OK", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-verify-test-"));
    try {
      // Setup valid seeds
      await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
      const analyzeResult = await analyzeCommand({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      // Ensure analysis succeeded before verifying
      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.filesAnalyzed).toBeGreaterThan(0);

      const options: VerifyOptions = {
        packagePath: tempDir,
      };

      const result = await verifyCommand(options);

      // Provide detailed error info if verification fails
      if (!result.valid) {
        throw new Error(
          `Verification failed with errors:\n  Errors: ${JSON.stringify(result.errors)}\n  Warnings: ${JSON.stringify(result.warnings)}\n  TempDir: ${tempDir}\n  Analysis: ${analyzeResult.filesAnalyzed} files, ${analyzeResult.nodesCreated} nodes`
        );
      }

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("detects missing parquet files as warnings", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-verify-test-"));
    try {
      // Create .devac structure without parquet files
      await fs.mkdir(path.join(tempDir, ".devac", "seed", "base"), {
        recursive: true,
      });

      const options: VerifyOptions = {
        packagePath: tempDir,
      };

      const result = await verifyCommand(options);

      // Missing files are warnings, not errors (per spec - seeds can be regenerated)
      expect(result.warnings.length).toBeGreaterThan(0);
      // Stats should show zero counts
      expect(result.stats?.nodeCount).toBe(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("detects corrupted parquet files", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-verify-test-"));
    try {
      // Create .devac structure with invalid parquet
      const seedDir = path.join(tempDir, ".devac", "seed", "base");
      await fs.mkdir(seedDir, { recursive: true });
      await fs.writeFile(path.join(seedDir, "nodes.parquet"), "invalid data");

      const options: VerifyOptions = {
        packagePath: tempDir,
      };

      const result = await verifyCommand(options);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns statistics about seeds", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-verify-test-"));
    try {
      await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
      await analyzeCommand({
        packagePath: tempDir,
        repoName: "test-repo",
        branch: "main",
      });

      const options: VerifyOptions = {
        packagePath: tempDir,
      };

      const result = await verifyCommand(options);

      expect(result.stats).toBeDefined();
      expect(result.stats?.nodeCount).toBeGreaterThan(0);
      expect(result.stats?.edgeCount).toBeGreaterThanOrEqual(0);
      expect(result.stats?.fileCount).toBeGreaterThan(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("CLI: clean command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-clean-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("removes seed files", async () => {
    // Create seeds first
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
    await analyzeCommand({
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    });

    // Verify seeds exist
    const seedDir = path.join(tempDir, ".devac", "seed");
    const existsBefore = await fs
      .access(seedDir)
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Clean
    const options: CleanOptions = {
      packagePath: tempDir,
    };

    const result = await cleanCommand(options);

    expect(result.success).toBe(true);
    expect(result.filesRemoved).toBeGreaterThan(0);

    // Verify seeds are removed
    const existsAfter = await fs
      .access(seedDir)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);
  });

  it("removes lock files and temp files", async () => {
    // Create temp and lock files
    const seedDir = path.join(tempDir, ".devac", "seed", "base");
    await fs.mkdir(seedDir, { recursive: true });
    await fs.writeFile(path.join(seedDir, "nodes.parquet.tmp"), "temp");
    await fs.writeFile(path.join(seedDir, "nodes.parquet.lock"), "lock");

    const options: CleanOptions = {
      packagePath: tempDir,
    };

    const result = await cleanCommand(options);

    expect(result.success).toBe(true);

    // Verify temp/lock files removed
    const tmpExists = await fs
      .access(path.join(seedDir, "nodes.parquet.tmp"))
      .then(() => true)
      .catch(() => false);
    const lockExists = await fs
      .access(path.join(seedDir, "nodes.parquet.lock"))
      .then(() => true)
      .catch(() => false);
    expect(tmpExists).toBe(false);
    expect(lockExists).toBe(false);
  });

  it("does NOT remove source code", async () => {
    await fs.cp(FIXTURES_DIR, path.join(tempDir, "src"), { recursive: true });
    await analyzeCommand({
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    });

    const options: CleanOptions = {
      packagePath: tempDir,
    };

    await cleanCommand(options);

    // Source files should still exist
    const srcExists = await fs
      .access(path.join(tempDir, "src"))
      .then(() => true)
      .catch(() => false);
    expect(srcExists).toBe(true);
  });

  it("handles non-existent .devac directory gracefully", async () => {
    const options: CleanOptions = {
      packagePath: tempDir,
    };

    const result = await cleanCommand(options);

    expect(result.success).toBe(true);
    expect(result.filesRemoved).toBe(0);
  });
});
