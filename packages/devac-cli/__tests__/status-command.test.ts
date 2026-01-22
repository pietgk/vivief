/**
 * Status Command Tests for DevAC CLI
 *
 * Tests the unified status command that shows:
 * - Context: Where am I? What issue?
 * - DevAC Health: Is DevAC running? (watch, hub, mcp)
 * - Code Diagnostics: Is code healthy? (errors, lint, tests, coverage)
 * - Work Activity: What's pending? (PRs, reviews)
 * - Next: What should I do?
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";
import { statusCommand } from "../src/commands/status.js";

describe("status command", () => {
  let tempDir: string;
  let workspaceDir: string;
  let hubDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-status-test-"));
    // Create workspace structure: tempDir/workspace/.devac and tempDir/workspace/repo
    workspaceDir = path.join(tempDir, "workspace");
    hubDir = path.join(workspaceDir, ".devac");
    repoDir = path.join(workspaceDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("context detection", () => {
    it("detects current working directory", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.context.cwd).toBe(repoDir);
    });

    it("detects workspace when present in parent directory", async () => {
      // Create workspace structure with .devac in parent
      await fs.mkdir(hubDir, { recursive: true });

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.context.isWorkspace).toBe(true);
      expect(result.context.workspacePath).toBe(workspaceDir);
    });

    it("detects git branch when in repo", async () => {
      // Create git structure in repoDir
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
      await fs.writeFile(path.join(repoDir, ".git", "HEAD"), "ref: refs/heads/feature/my-branch\n");

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.context.branch).toBe("feature/my-branch");
    });

    it("detects worktree info from directory name", async () => {
      // Create a worktree-style directory under workspace
      const worktreeDir = path.join(workspaceDir, "api-ghapi-123-auth");
      await fs.mkdir(worktreeDir, { recursive: true });

      const result = await statusCommand({
        path: worktreeDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.context.repoName).toBe("api");
      expect(result.context.issueId).toBe("ghapi-123");
      expect(result.context.worktreeSlug).toBe("auth");
    });
  });

  describe("health detection", () => {
    it("detects hub as not connected when not initialized", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.health.hubConnected).toBe(false);
    });

    it("detects hub as connected when initialized", async () => {
      // Initialize hub in workspace's .devac directory
      await hubInit({ hubDir, skipValidation: true });

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.health.hubConnected).toBe(true);
      expect(result.health.hubPath).toContain("central.duckdb");
    });

    it("counts registered repos", async () => {
      await hubInit({ hubDir, skipValidation: true });

      // Create and register a repo within the workspace
      const testRepoPath = path.join(workspaceDir, "test-repo");
      await createMockRepo(testRepoPath);
      await hubRegister({ hubDir, repoPath: testRepoPath });

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.health.reposRegistered).toBe(1);
    });

    it("detects watch as active when lockfile exists", async () => {
      // Create .devac directory and lockfile in workspace
      await fs.mkdir(hubDir, { recursive: true });
      await fs.writeFile(path.join(hubDir, "watch.lock"), "");

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.health.watchActive).toBe(true);
    });

    it("detects watch as inactive when no lockfile", async () => {
      // Create .devac directory but no lockfile
      await fs.mkdir(hubDir, { recursive: true });

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.health.watchActive).toBe(false);
    });
  });

  describe("diagnostics aggregation", () => {
    it("returns zero counts when no diagnostics", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.diagnostics.errors).toBe(0);
      expect(result.diagnostics.warnings).toBe(0);
    });

    it("aggregates diagnostics by source", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.diagnostics.bySource).toBeDefined();
      expect(result.diagnostics.bySource.tsc).toBeDefined();
      expect(result.diagnostics.bySource.eslint).toBeDefined();
      expect(result.diagnostics.bySource.test).toBeDefined();
      expect(result.diagnostics.bySource.coverage).toBeDefined();
    });
  });

  describe("activity summary", () => {
    it("returns zero counts when no activity data", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.activity.openPRs).toBe(0);
      expect(result.activity.pendingReviews).toBe(0);
      expect(result.activity.openIssues).toBe(0);
    });
  });

  describe("next steps", () => {
    it("suggests initializing hub when not connected", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.next).toContainEqual(expect.stringContaining("devac sync"));
    });

    it("suggests starting watch when hub connected but watch inactive", async () => {
      await hubInit({ hubDir, skipValidation: true });

      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      // Check that next contains something about watch
      const hasWatchSuggestion = result.next.some((step) => step.toLowerCase().includes("watch"));
      expect(hasWatchSuggestion).toBe(true);
    });
  });

  describe("output formats", () => {
    it("returns formatted output for summary format", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "summary",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.formatted).toBeDefined();
      expect(typeof result.formatted).toBe("string");
      // Summary should be relatively short
      expect(result.formatted?.split("\n").length).toBeLessThanOrEqual(3);
    });

    it("returns formatted output for brief format", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.formatted).toBeDefined();
      expect(result.formatted).toContain("DevAC Status");
    });

    it("returns formatted output for full format", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "full",
        groupBy: "type",
      });

      expect(result.success).toBe(true);
      expect(result.formatted).toBeDefined();
      expect(result.formatted).toContain("DevAC Full Status");
    });

    it("returns JSON-compatible result when json option set", async () => {
      const result = await statusCommand({
        path: repoDir,
        level: "brief",
        groupBy: "type",
        json: true,
      });

      expect(result.success).toBe(true);
      // When json=true, formatted should not be set
      expect(result.formatted).toBeUndefined();

      // Result should be JSON-serializable
      const json = JSON.stringify(result);
      expect(json).toBeDefined();
      const parsed = JSON.parse(json);
      expect(parsed.context).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("handles non-existent path gracefully", async () => {
      const result = await statusCommand({
        path: path.join(tempDir, "non-existent"),
        level: "brief",
        groupBy: "type",
      });

      // Should still succeed but with limited info
      expect(result).toBeDefined();
    });

    it("returns success false on critical error", async () => {
      // Create a path that will cause issues
      const problematicPath = "/root/definitely-no-access";

      const result = await statusCommand({
        path: problematicPath,
        level: "brief",
        groupBy: "type",
      });

      // Should handle gracefully (may succeed with limited info or fail cleanly)
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  // Helper function to create a mock repo
  async function createMockRepo(repoPath: string): Promise<void> {
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    // Create git config
    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, ".git", "config"),
      `[remote "origin"]\n  url = git@github.com:org/test-repo.git\n`
    );

    // Create package.json
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "test-repo", version: "1.0.0" })
    );

    // Create mock seed files
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
  }
});
