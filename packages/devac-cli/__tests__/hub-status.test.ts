/**
 * Hub Status Command Tests for DevAC v2.0
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";
import { hubStatus } from "../src/commands/hub-status.js";

describe("hub status command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-status-test-"));
    hubDir = path.join(tempDir, ".devac");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createAndRegisterRepo(name: string): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    // Create unique git remote for each repo
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

    await hubRegister({ hubDir, repoPath });
    return repoPath;
  }

  it("shows hub path", async () => {
    await hubInit({ hubDir, skipValidation: true });

    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(true);
    expect(result.status?.hubPath).toBe(path.join(hubDir, "central.duckdb"));
  });

  it("shows total repo count", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await createAndRegisterRepo("repo2");

    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(true);
    expect(result.status?.repoCount).toBe(2);
  });

  it("shows total package count", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");

    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(true);
    expect(result.status?.totalPackages).toBeGreaterThanOrEqual(1);
  });

  it("shows cross-repo edge count", async () => {
    await hubInit({ hubDir, skipValidation: true });

    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(true);
    expect(result.status?.crossRepoEdges).toBeDefined();
    expect(typeof result.status?.crossRepoEdges).toBe("number");
  });

  it("indicates if hub not initialized", async () => {
    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not initialized");
  });

  it("shows cache size", async () => {
    await hubInit({ hubDir, skipValidation: true });

    const result = await hubStatus({ hubDir });

    expect(result.success).toBe(true);
    expect(result.status?.cacheSize).toBeDefined();
  });
});
