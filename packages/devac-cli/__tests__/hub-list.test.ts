/**
 * Hub List Command Tests for DevAC v2.0
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubList } from "../src/commands/hub-list.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub list command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-list-test-"));
    hubDir = path.join(tempDir, ".devac");
    await hubInit({ hubDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createMockRepo(name: string, gitRemote?: string): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    if (gitRemote) {
      await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, ".git", "config"),
        `[remote "origin"]\n  url = ${gitRemote}\n`
      );
    }

    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name, version: "1.0.0" })
    );
    await fs.writeFile(
      path.join(seedPath, "stats.json"),
      JSON.stringify({ nodeCount: 10, edgeCount: 5, refCount: 2, fileCount: 3 })
    );
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");
    await fs.writeFile(
      path.join(repoPath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    return repoPath;
  }

  it("lists all registered repos", async () => {
    const repo1 = await createMockRepo("repo1", "git@github.com:org/repo1.git");
    const repo2 = await createMockRepo("repo2", "git@github.com:org/repo2.git");

    const reg1 = await hubRegister({ hubDir, repoPath: repo1 });
    expect(reg1.success).toBe(true);
    expect(reg1.repoId).toBe("github.com/org/repo1");

    // Verify first repo was registered before adding second
    const afterFirst = await hubList({ hubDir });
    expect(afterFirst.success).toBe(true);
    expect(afterFirst.repos).toHaveLength(1);

    const reg2 = await hubRegister({ hubDir, repoPath: repo2 });
    expect(reg2.success).toBe(true);
    expect(reg2.repoId).toBe("github.com/org/repo2");

    const result = await hubList({ hubDir });

    expect(result.success).toBe(true);
    expect(result.repos).toHaveLength(2);
  });

  it("shows repo_id, path, package count, status", async () => {
    const repo = await createMockRepo("test-repo", "git@github.com:org/test.git");
    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubList({ hubDir });

    expect(result.success).toBe(true);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]!.repoId).toBe("github.com/org/test");
    expect(result.repos[0]!.localPath).toBe(repo);
    expect(result.repos[0]!.packages).toBeGreaterThanOrEqual(1);
    expect(result.repos[0]!.status).toBe("active");
  });

  it("shows last_synced timestamp", async () => {
    const repo = await createMockRepo("test-repo");
    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubList({ hubDir });

    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]!.lastSynced).toBeDefined();
  });

  it("returns empty list if no repos registered", async () => {
    const result = await hubList({ hubDir });

    expect(result.success).toBe(true);
    expect(result.repos).toHaveLength(0);
  });

  it("fails if hub not initialized", async () => {
    const result = await hubList({ hubDir: path.join(tempDir, "nonexistent") });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
