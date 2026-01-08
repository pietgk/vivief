/**
 * Sync Command Tests
 *
 * Tests for the `devac sync` command which combines analyze + register.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { syncCommand } from "../src/commands/sync.js";

describe("sync command", () => {
  let tempDir: string;
  let workspaceDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-sync-test-"));
    workspaceDir = path.join(tempDir, "workspace");
    hubDir = path.join(workspaceDir, ".devac");

    await fs.mkdir(workspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a mock repo with optional seed data
   */
  async function createMockRepo(
    repoPath: string,
    options: {
      name?: string;
      hasSeeds?: boolean;
      gitRemote?: string;
    } = {}
  ): Promise<void> {
    const { name = "test-pkg", hasSeeds = false, gitRemote } = options;

    await fs.mkdir(repoPath, { recursive: true });

    // Create git directory
    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    await fs.writeFile(path.join(repoPath, ".git", "HEAD"), "ref: refs/heads/main\n");
    if (gitRemote) {
      await fs.writeFile(
        path.join(repoPath, ".git", "config"),
        `[remote "origin"]\n  url = ${gitRemote}\n`
      );
    }

    // Create package.json
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name, version: "1.0.0" })
    );

    // Create a source file for analysis
    await fs.mkdir(path.join(repoPath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "src", "index.ts"),
      'export function hello() { return "world"; }\n'
    );

    // Optionally create seeds
    if (hasSeeds) {
      const seedPath = path.join(repoPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

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
    }
  }

  it("fails if not in a workspace", async () => {
    const result = await syncCommand({
      path: path.join(tempDir, "not-a-workspace"),
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Not in a workspace");
  });

  it("fails if hub is not initialized", async () => {
    // Create a repo to make it a valid workspace
    await createMockRepo(path.join(workspaceDir, "repo1"), {
      gitRemote: "git@github.com:test/repo1.git",
      hasSeeds: true,
    });

    const result = await syncCommand({
      path: workspaceDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Hub not initialized");
  });

  it("dry run reports what would be done", async () => {
    // Create workspace with hub
    await createMockRepo(path.join(workspaceDir, "repo1"), {
      gitRemote: "git@github.com:test/repo1.git",
      hasSeeds: false, // Needs analysis
    });
    await hubInit({ hubDir, skipValidation: true });

    const progress: string[] = [];
    const result = await syncCommand({
      path: workspaceDir,
      dryRun: true,
      onProgress: (msg) => progress.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.packagesAnalyzed).toBe(0);
    expect(result.reposRegistered).toBe(0);
    expect(result.message).toContain("Dry run");
    expect(progress.some((p) => p.includes("Dry run"))).toBe(true);
  });

  it("analyze-only skips registration", async () => {
    // Create workspace with already analyzed repo
    await createMockRepo(path.join(workspaceDir, "repo1"), {
      gitRemote: "git@github.com:test/repo1.git",
      hasSeeds: true,
    });
    await hubInit({ hubDir, skipValidation: true });

    const result = await syncCommand({
      path: workspaceDir,
      analyze: true,
      register: false, // Skip registration
    });

    expect(result.success).toBe(true);
    expect(result.reposRegistered).toBe(0);
  });

  it("register-only skips analysis", async () => {
    // Create workspace with already analyzed repo
    await createMockRepo(path.join(workspaceDir, "repo1"), {
      gitRemote: "git@github.com:test/repo1.git",
      hasSeeds: true,
    });
    await hubInit({ hubDir, skipValidation: true });

    const result = await syncCommand({
      path: workspaceDir,
      analyze: false, // Skip analysis
      register: true,
    });

    expect(result.success).toBe(true);
    expect(result.packagesAnalyzed).toBe(0);
    expect(result.reposRegistered).toBeGreaterThanOrEqual(1);
  });

  it("returns success with nothing to do when workspace is up-to-date", async () => {
    // Create workspace with already analyzed and registered repo
    await createMockRepo(path.join(workspaceDir, "repo1"), {
      gitRemote: "git@github.com:test/repo1.git",
      hasSeeds: true,
    });
    await hubInit({ hubDir, skipValidation: true });

    // First sync to register
    await syncCommand({
      path: workspaceDir,
      analyze: false, // Skip analysis since we have mock seeds
      register: true,
    });

    // Second sync should have nothing to do (except re-register)
    const result = await syncCommand({
      path: workspaceDir,
      analyze: false, // Skip analysis
      register: true,
    });

    expect(result.success).toBe(true);
  });
});
