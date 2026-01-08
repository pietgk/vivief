/**
 * Hub Register Command Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub register command", () => {
  let tempDir: string;
  let hubDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-register-test-"));
    hubDir = path.join(tempDir, ".devac");
    repoDir = path.join(tempDir, "test-repo");

    // Initialize hub first
    await hubInit({ hubDir, skipValidation: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a mock repository with seed data
   */
  async function createMockRepo(
    repoPath: string,
    options: {
      packages?: Array<{ path: string; name: string }>;
      gitRemote?: string;
    } = {}
  ): Promise<void> {
    const { packages = [{ path: ".", name: "test-pkg" }], gitRemote } = options;

    // Create git config if remote specified
    if (gitRemote) {
      await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, ".git", "config"),
        `[remote "origin"]\n  url = ${gitRemote}\n`
      );
    }

    // Create packages with seed data
    for (const pkg of packages) {
      const pkgPath = pkg.path === "." ? repoPath : path.join(repoPath, pkg.path);
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      await fs.writeFile(
        path.join(pkgPath, "package.json"),
        JSON.stringify({ name: pkg.name, version: "1.0.0" })
      );

      await fs.writeFile(
        path.join(seedPath, "stats.json"),
        JSON.stringify({ nodeCount: 10, edgeCount: 5, refCount: 2, fileCount: 3 })
      );

      await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
      await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
      await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");

      await fs.writeFile(
        path.join(pkgPath, ".devac", "seed", "meta.json"),
        JSON.stringify({ schemaVersion: "2.1" })
      );
    }
  }

  it("validates repo path exists", async () => {
    const result = await hubRegister({
      hubDir,
      repoPath: "/nonexistent/path",
      skipValidation: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("validates repo has .devac/seed/ directory", async () => {
    // Create repo without seed data
    await fs.mkdir(repoDir, { recursive: true });

    const result = await hubRegister({
      hubDir,
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("seed");
  });

  it("generates manifest if not present", async () => {
    await createMockRepo(repoDir);

    const result = await hubRegister({
      hubDir,
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(true);

    // Check manifest was created
    const manifestPath = path.join(repoDir, ".devac", "manifest.json");
    const manifestExists = await fs
      .access(manifestPath)
      .then(() => true)
      .catch(() => false);
    expect(manifestExists).toBe(true);
  });

  it("adds repo to registry", async () => {
    await createMockRepo(repoDir);

    const result = await hubRegister({
      hubDir,
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(true);
    expect(result.repoId).toBeDefined();
    expect(result.packages).toBeGreaterThanOrEqual(1);
  });

  it("outputs package count and edge count", async () => {
    await createMockRepo(repoDir, {
      packages: [
        { path: "packages/api", name: "@test/api" },
        { path: "packages/shared", name: "@test/shared" },
      ],
    });

    const result = await hubRegister({
      hubDir,
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(true);
    expect(result.packages).toBe(2);
    expect(result.crossRepoEdges).toBeDefined();
    expect(typeof result.crossRepoEdges).toBe("number");
  });

  it("detects repo_id from git remote", async () => {
    await createMockRepo(repoDir, {
      gitRemote: "git@github.com:myorg/myrepo.git",
    });

    const result = await hubRegister({
      hubDir,
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(true);
    expect(result.repoId).toBe("github.com/myorg/myrepo");
  });

  it("updates existing repo registration", async () => {
    await createMockRepo(repoDir);

    // Register first time
    const result1 = await hubRegister({ hubDir, repoPath: repoDir, skipValidation: true });
    expect(result1.success).toBe(true);

    // Register second time (should update)
    const result2 = await hubRegister({ hubDir, repoPath: repoDir, skipValidation: true });
    expect(result2.success).toBe(true);
    expect(result2.repoId).toBe(result1.repoId);
  });

  it("fails if hub not initialized", async () => {
    await createMockRepo(repoDir);

    // Use a non-existent hub dir
    const result = await hubRegister({
      hubDir: path.join(tempDir, "nonexistent-hub"),
      repoPath: repoDir,
      skipValidation: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
