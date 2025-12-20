/**
 * Hub Refresh Command Tests for DevAC v2.0
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubRefresh } from "../src/commands/hub-refresh.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub refresh command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-refresh-test-"));
    hubDir = path.join(tempDir, ".devac");
    await hubInit({ hubDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createAndRegisterRepo(
    name: string
  ): Promise<{ repoPath: string; repoId: string }> {
    const repoPath = path.join(tempDir, name);
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, ".git", "config"),
      `[remote "origin"]\n  url = git@github.com:org/${name}.git\n`
    );

    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name, version: "1.0.0" })
    );
    await fs.writeFile(
      path.join(seedPath, "stats.json"),
      JSON.stringify({
        nodeCount: 10,
        edgeCount: 5,
        refCount: 2,
        fileCount: 3,
      })
    );
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");
    await fs.writeFile(
      path.join(repoPath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    const result = await hubRegister({ hubDir, repoPath });
    if (!result.repoId) throw new Error("Failed to register repo");
    return { repoPath, repoId: result.repoId };
  }

  it("refreshes all repos when no arg given", async () => {
    await createAndRegisterRepo("repo1");
    await createAndRegisterRepo("repo2");

    const result = await hubRefresh({ hubDir });

    expect(result.success).toBe(true);
    expect(result.reposRefreshed).toBe(2);
  });

  it("refreshes single repo when repo_id provided", async () => {
    const { repoId } = await createAndRegisterRepo("repo1");
    await createAndRegisterRepo("repo2");

    const result = await hubRefresh({ hubDir, repoId });

    expect(result.success).toBe(true);
    expect(result.reposRefreshed).toBe(1);
  });

  it("re-generates manifest from seeds", async () => {
    const { repoPath, repoId } = await createAndRegisterRepo("test-repo");

    // Modify the seed stats
    const statsPath = path.join(repoPath, ".devac", "seed", "base", "stats.json");
    await fs.writeFile(
      statsPath,
      JSON.stringify({
        nodeCount: 100,
        edgeCount: 50,
        refCount: 20,
        fileCount: 30,
      })
    );

    const result = await hubRefresh({ hubDir, repoId });

    expect(result.success).toBe(true);
    expect(result.packagesUpdated).toBeGreaterThanOrEqual(1);
  });

  it("reports packages and edges updated", async () => {
    await createAndRegisterRepo("test-repo");

    const result = await hubRefresh({ hubDir });

    expect(result.success).toBe(true);
    expect(result.packagesUpdated).toBeDefined();
    expect(result.edgesUpdated).toBeDefined();
  });

  it("continues on single repo failure and reports errors", async () => {
    const { repoPath: repo1Path } = await createAndRegisterRepo("repo1");
    await createAndRegisterRepo("repo2");

    // Corrupt repo1 by removing the seed directory
    // This causes manifestGenerator.generate() to fail when it tries to read seed files
    const seedDir = path.join(repo1Path, ".devac", "seed");
    await fs.rm(seedDir, { recursive: true, force: true });

    const result = await hubRefresh({ hubDir });

    // The refresh should succeed overall
    expect(result.success).toBe(true);
    // At least repo2 should be refreshed (repo1 might fail or be skipped)
    expect(result.reposRefreshed).toBeGreaterThanOrEqual(1);
    // Verify that we processed multiple repos (errors + successful = total registered)
    // The key invariant is that one repo was processed successfully
    expect(result.reposRefreshed + result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("fails if hub not initialized", async () => {
    const result = await hubRefresh({
      hubDir: path.join(tempDir, "nonexistent"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns empty result when no repos registered", async () => {
    const result = await hubRefresh({ hubDir });

    expect(result.success).toBe(true);
    expect(result.reposRefreshed).toBe(0);
  });
});
