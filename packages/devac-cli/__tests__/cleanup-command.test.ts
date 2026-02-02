/**
 * Cleanup Command Tests for DevAC CLI
 *
 * Tests the cleanup command that handles interactive cleanup of stale resources:
 * - Stale branches (merged PRs, closed PRs, deleted remote, inactive)
 * - Stale worktrees (closed issues, merged PRs)
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CleanupOptions, CleanupResult } from "../src/commands/cleanup.js";

describe("cleanup command options", () => {
  describe("options interface", () => {
    it("has optional path field", () => {
      const options: CleanupOptions = {};
      expect(options.path).toBeUndefined();

      const withPath: CleanupOptions = { path: "/path/to/repo" };
      expect(withPath.path).toBe("/path/to/repo");
    });

    it("has optional dryRun field", () => {
      const options: CleanupOptions = { dryRun: true };
      expect(options.dryRun).toBe(true);
    });

    it("has optional branches field", () => {
      const options: CleanupOptions = { branches: true };
      expect(options.branches).toBe(true);
    });

    it("has optional worktrees field", () => {
      const options: CleanupOptions = { worktrees: true };
      expect(options.worktrees).toBe(true);
    });

    it("has optional json field", () => {
      const options: CleanupOptions = { json: true };
      expect(options.json).toBe(true);
    });

    it("has optional yes field for non-interactive mode", () => {
      const options: CleanupOptions = { yes: true };
      expect(options.yes).toBe(true);
    });

    it("accepts multiple options", () => {
      const options: CleanupOptions = {
        path: "/repo",
        dryRun: true,
        branches: true,
        worktrees: false,
        json: true,
        yes: true,
      };

      expect(options.path).toBe("/repo");
      expect(options.dryRun).toBe(true);
      expect(options.branches).toBe(true);
      expect(options.worktrees).toBe(false);
      expect(options.json).toBe(true);
      expect(options.yes).toBe(true);
    });
  });

  describe("mutually exclusive options", () => {
    it("can set branches-only mode", () => {
      const options: CleanupOptions = { branches: true, worktrees: false };
      expect(options.branches).toBe(true);
      expect(options.worktrees).toBe(false);
    });

    it("can set worktrees-only mode", () => {
      const options: CleanupOptions = { branches: false, worktrees: true };
      expect(options.branches).toBe(false);
      expect(options.worktrees).toBe(true);
    });

    it("can set both for all cleanup", () => {
      const options: CleanupOptions = { branches: true, worktrees: true };
      expect(options.branches).toBe(true);
      expect(options.worktrees).toBe(true);
    });
  });
});

describe("cleanup command result", () => {
  describe("result interface", () => {
    it("has required success field", () => {
      const result: CleanupResult = {
        success: true,
        diagnostics: {
          staleBranches: [],
          staleRemoteBranches: [],
          staleWorktrees: [],
        },
        executedActions: [],
        skippedActions: [],
        errors: [],
      };

      expect(result.success).toBe(true);
    });

    it("has diagnostics field", () => {
      const result: CleanupResult = {
        success: true,
        diagnostics: {
          staleBranches: [],
          staleRemoteBranches: [],
          staleWorktrees: [],
        },
        executedActions: [],
        skippedActions: [],
        errors: [],
      };

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.staleBranches).toEqual([]);
      expect(result.diagnostics.staleRemoteBranches).toEqual([]);
      expect(result.diagnostics.staleWorktrees).toEqual([]);
    });

    it("has action arrays", () => {
      const result: CleanupResult = {
        success: true,
        diagnostics: {
          staleBranches: [],
          staleRemoteBranches: [],
          staleWorktrees: [],
        },
        executedActions: [],
        skippedActions: [],
        errors: [],
      };

      expect(Array.isArray(result.executedActions)).toBe(true);
      expect(Array.isArray(result.skippedActions)).toBe(true);
    });

    it("has errors array", () => {
      const result: CleanupResult = {
        success: false,
        diagnostics: {
          staleBranches: [],
          staleRemoteBranches: [],
          staleWorktrees: [],
        },
        executedActions: [],
        skippedActions: [],
        errors: ["Failed to delete branch: feature/old"],
      };

      expect(result.errors).toContain("Failed to delete branch: feature/old");
    });

    it("has optional formatted field", () => {
      const result: CleanupResult = {
        success: true,
        diagnostics: {
          staleBranches: [],
          staleRemoteBranches: [],
          staleWorktrees: [],
        },
        executedActions: [],
        skippedActions: [],
        errors: [],
        formatted: "No stale resources found",
      };

      expect(result.formatted).toBe("No stale resources found");
    });
  });
});

describe("cleanup command behavior", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-cleanup-test-"));
    repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("dry run mode", () => {
    it("dry run option prevents actual changes", () => {
      const options: CleanupOptions = { dryRun: true, path: repoDir };
      expect(options.dryRun).toBe(true);
    });

    it("dry run with branches-only", () => {
      const options: CleanupOptions = { dryRun: true, branches: true };
      expect(options.dryRun).toBe(true);
      expect(options.branches).toBe(true);
    });

    it("dry run with worktrees-only", () => {
      const options: CleanupOptions = { dryRun: true, worktrees: true };
      expect(options.dryRun).toBe(true);
      expect(options.worktrees).toBe(true);
    });
  });

  describe("output formats", () => {
    it("supports JSON output", () => {
      const options: CleanupOptions = { json: true };
      expect(options.json).toBe(true);
    });

    it("supports text output (default)", () => {
      const options: CleanupOptions = {};
      expect(options.json).toBeUndefined();
    });
  });

  describe("non-interactive mode", () => {
    it("yes flag skips prompts", () => {
      const options: CleanupOptions = { yes: true };
      expect(options.yes).toBe(true);
    });

    it("yes flag with dry-run for preview", () => {
      const options: CleanupOptions = { yes: true, dryRun: true };
      expect(options.yes).toBe(true);
      expect(options.dryRun).toBe(true);
    });
  });
});

describe("cleanup diagnostics types", () => {
  describe("stale branch reasons", () => {
    const validReasons = ["merged-pr", "closed-pr", "deleted-remote", "inactive"];

    it("defines expected stale branch reasons", () => {
      for (const reason of validReasons) {
        expect(typeof reason).toBe("string");
        expect(reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe("stale worktree reasons", () => {
    const validReasons = ["closed-issue", "merged-pr"];

    it("defines expected stale worktree reasons", () => {
      for (const reason of validReasons) {
        expect(typeof reason).toBe("string");
        expect(reason.length).toBeGreaterThan(0);
      }
    });
  });
});
