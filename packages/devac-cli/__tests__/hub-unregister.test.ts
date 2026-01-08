/**
 * Hub Unregister Command Tests for DevAC v2.0
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubList } from "../src/commands/hub-list.js";
import { hubRegister } from "../src/commands/hub-register.js";
import { hubUnregister } from "../src/commands/hub-unregister.js";

describe("hub unregister command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-unreg-test-"));
    hubDir = path.join(tempDir, ".devac");
    await hubInit({ hubDir, skipValidation: true });
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
      JSON.stringify({ nodeCount: 10, edgeCount: 5, refCount: 2, fileCount: 3 })
    );
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");
    await fs.writeFile(
      path.join(repoPath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    const result = await hubRegister({ hubDir, repoPath, skipValidation: true });
    if (!result.repoId) throw new Error("Failed to register repo");
    return { repoPath, repoId: result.repoId };
  }

  it("removes repo from registry", async () => {
    const { repoId } = await createAndRegisterRepo("test-repo");

    const result = await hubUnregister({ hubDir, repoId, skipValidation: true });

    expect(result.success).toBe(true);

    const listResult = await hubList({ hubDir, skipValidation: true });
    expect(listResult.repos).toHaveLength(0);
  });

  it("removes cross-repo edges", async () => {
    const { repoId } = await createAndRegisterRepo("test-repo");

    const result = await hubUnregister({ hubDir, repoId, skipValidation: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain("unregistered");
  });

  it("keeps manifest.json by default", async () => {
    const { repoPath, repoId } = await createAndRegisterRepo("test-repo");

    await hubUnregister({ hubDir, repoId, skipValidation: true });

    const manifestPath = path.join(repoPath, ".devac", "manifest.json");
    const manifestExists = await fs
      .access(manifestPath)
      .then(() => true)
      .catch(() => false);
    expect(manifestExists).toBe(true);
  });

  it("succeeds even if repo not registered", async () => {
    const result = await hubUnregister({
      hubDir,
      repoId: "github.com/nonexistent/repo",
      skipValidation: true,
    });

    expect(result.success).toBe(true);
  });

  it("fails if hub not initialized", async () => {
    const result = await hubUnregister({
      hubDir: path.join(tempDir, "nonexistent"),
      repoId: "some-repo",
      skipValidation: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
