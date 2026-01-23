/**
 * Prerequisites Checker Tests
 *
 * Tests for the prerequisites checking system that validates
 * environment state before running DevAC commands.
 *
 * NOTE: Hub validation requires a workspace structure where:
 * - Hub (.devac) is at workspace level (parent of git repos)
 * - Not inside a git repository
 * Structure: workspace/.devac + workspace/repo/.git
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkStatusPrerequisites,
  checkSyncPrerequisites,
  getReadinessForStatus,
} from "../../src/prerequisites/checker.js";

/**
 * Helper to create a valid workspace structure:
 * - workspaceDir/.devac (hub at workspace level)
 * - workspaceDir/repo/.git (git repo inside workspace)
 */
async function createWorkspaceStructure(baseDir: string): Promise<{
  workspaceDir: string;
  repoDir: string;
  hubDir: string;
}> {
  const workspaceDir = baseDir;
  const hubDir = path.join(workspaceDir, ".devac");
  const repoDir = path.join(workspaceDir, "repo");

  await fs.mkdir(hubDir, { recursive: true });
  await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });

  return { workspaceDir, repoDir, hubDir };
}

describe("checkStatusPrerequisites", () => {
  let testDir: string;
  let repoDir: string;
  let hubDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), "devac-status-prereq-test-"));
    const structure = await createWorkspaceStructure(testDir);
    repoDir = structure.repoDir;
    hubDir = structure.hubDir;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("includes hub lock check when hub directory is valid", async () => {
    // Run from inside the repo (typical usage)
    const result = await checkStatusPrerequisites(repoDir);

    // Should have hub_writable check in allChecks (passed because no socket)
    const hubCheck = result.allChecks.find((c) => c.id === "hub_writable");
    expect(hubCheck).toBeDefined();
    expect(hubCheck?.passed).toBe(true);
  });

  it("includes hub lock warning when MCP is running", async () => {
    // Simulate MCP running by creating socket
    await fs.writeFile(path.join(hubDir, "mcp.sock"), "");

    const result = await checkStatusPrerequisites(repoDir);

    // Should have a warning about hub lock
    const hubWarning = result.warnings.find((w) => w.id === "hub_writable");
    expect(hubWarning).toBeDefined();
    expect(hubWarning?.message).toContain("MCP");
    expect(hubWarning?.passed).toBe(false);
    expect(hubWarning?.required).toBe(false);
  });

  it("no hub lock warning when MCP is not running", async () => {
    const result = await checkStatusPrerequisites(repoDir);

    // Should not have hub_writable in warnings
    const hubWarning = result.warnings.find((w) => w.id === "hub_writable");
    expect(hubWarning).toBeUndefined();
  });

  it("detects context from git repo even without .devac directory", async () => {
    // Remove .devac
    await fs.rm(hubDir, { recursive: true });

    const result = await checkStatusPrerequisites(repoDir);

    expect(result.ready).toBe(true);
    const contextCheck = result.allChecks.find((c) => c.id === "context_found");
    expect(contextCheck?.passed).toBe(true);
  });
});

describe("checkSyncPrerequisites vs checkStatusPrerequisites parity", () => {
  let testDir: string;
  let repoDir: string;
  let hubDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), "devac-parity-test-"));
    const structure = await createWorkspaceStructure(testDir);
    repoDir = structure.repoDir;
    hubDir = structure.hubDir;
    // Create a source file in the repo so sync prerequisites pass
    await fs.writeFile(path.join(repoDir, "index.ts"), "export const x = 1;");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("both functions check for hub lock when hub is valid", async () => {
    // Simulate MCP running
    await fs.writeFile(path.join(hubDir, "mcp.sock"), "");

    const [syncResult, statusResult] = await Promise.all([
      checkSyncPrerequisites(repoDir),
      checkStatusPrerequisites(repoDir),
    ]);

    // Both should detect the lock
    const syncLockWarning = syncResult.warnings.find((w) => w.id === "hub_writable");
    const statusLockWarning = statusResult.warnings.find((w) => w.id === "hub_writable");

    expect(syncLockWarning).toBeDefined();
    expect(statusLockWarning).toBeDefined();
    expect(syncLockWarning?.message).toContain("MCP");
    expect(statusLockWarning?.message).toContain("MCP");
  });
});

describe("getReadinessForStatus", () => {
  let testDir: string;
  let repoDir: string;
  let hubDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), "devac-readiness-test-"));
    const structure = await createWorkspaceStructure(testDir);
    repoDir = structure.repoDir;
    hubDir = structure.hubDir;
    // Create a source file in the repo
    await fs.writeFile(path.join(repoDir, "index.ts"), "export const x = 1;");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("shows hub lock warning in full output when MCP is running", async () => {
    // Simulate MCP running
    await fs.writeFile(path.join(hubDir, "mcp.sock"), "");

    const readiness = await getReadinessForStatus(repoDir);

    // The warning should be visible in status output
    const fullText = readiness.full.join("\n");
    expect(fullText).toContain("MCP");
  });

  it("no MCP warning in output when MCP is not running", async () => {
    const readiness = await getReadinessForStatus(repoDir);

    const fullText = readiness.full.join("\n");
    expect(fullText).not.toContain("MCP");
  });
});
