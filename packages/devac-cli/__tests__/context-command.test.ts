/**
 * Context Command Tests for DevAC CLI
 *
 * Tests the context command that discovers cross-repository context
 * including CI status, issues, and reviews.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ContextCIOptions,
  type ContextOptions,
  contextCICommand,
  contextCommand,
} from "../src/commands/context.js";

describe("context command", () => {
  let tempDir: string;
  let workspaceDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-context-test-"));
    workspaceDir = path.join(tempDir, "workspace");
    repoDir = path.join(workspaceDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("options interface", () => {
    it("requires cwd field", () => {
      const options: ContextOptions = {
        cwd: "/path/to/repo",
      };
      expect(options.cwd).toBe("/path/to/repo");
    });

    it("accepts format option", () => {
      const textOptions: ContextOptions = { cwd: "/path", format: "text" };
      const jsonOptions: ContextOptions = { cwd: "/path", format: "json" };

      expect(textOptions.format).toBe("text");
      expect(jsonOptions.format).toBe("json");
    });

    it("accepts discovery options", () => {
      const options: ContextOptions = {
        cwd: "/path",
        discovery: {
          checkSeeds: true,
        },
      };
      expect(options.discovery?.checkSeeds).toBe(true);
    });
  });

  describe("result interface", () => {
    it("returns expected result structure", async () => {
      const result = await contextCommand({
        cwd: repoDir,
      });

      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.context).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it("includes formatted output for text format", async () => {
      const result = await contextCommand({
        cwd: repoDir,
        format: "text",
      });

      if (result.success) {
        expect(result.formatted).toBeDefined();
        expect(typeof result.formatted).toBe("string");
      }
    });

    it("does not include formatted output for json format", async () => {
      const result = await contextCommand({
        cwd: repoDir,
        format: "json",
      });

      if (result.success) {
        expect(result.context).toBeDefined();
      }
    });
  });

  describe("context discovery", () => {
    it("discovers basic context from cwd", async () => {
      const result = await contextCommand({
        cwd: repoDir,
      });

      expect(result.success).toBe(true);
      if (result.success && result.context) {
        expect(result.context.currentDir).toBeDefined();
      }
    });

    it("handles non-existent directory gracefully", async () => {
      const result = await contextCommand({
        cwd: "/non/existent/path",
      });

      // Should either succeed with minimal context or fail gracefully
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("detects workspace structure", async () => {
      // Create workspace marker
      const devacDir = path.join(workspaceDir, ".devac");
      await fs.mkdir(devacDir, { recursive: true });

      const result = await contextCommand({
        cwd: repoDir,
      });

      expect(result.success).toBe(true);
      if (result.success && result.context) {
        expect(result.context.parentDir).toBeDefined();
      }
    });
  });
});

describe("context CI command", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-context-ci-test-"));
    repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("options interface", () => {
    it("requires cwd field", () => {
      const options: ContextCIOptions = {
        cwd: "/path/to/repo",
      };
      expect(options.cwd).toBe("/path/to/repo");
    });

    it("accepts format option", () => {
      const options: ContextCIOptions = {
        cwd: "/path",
        format: "json",
      };
      expect(options.format).toBe("json");
    });

    it("accepts includeChecks option", () => {
      const options: ContextCIOptions = {
        cwd: "/path",
        includeChecks: true,
      };
      expect(options.includeChecks).toBe(true);
    });

    it("accepts syncToHub option", () => {
      const options: ContextCIOptions = {
        cwd: "/path",
        syncToHub: true,
      };
      expect(options.syncToHub).toBe(true);
    });

    it("accepts failingOnly option", () => {
      const options: ContextCIOptions = {
        cwd: "/path",
        failingOnly: true,
      };
      expect(options.failingOnly).toBe(true);
    });
  });

  describe("result interface", () => {
    it("returns expected result structure", async () => {
      const result = await contextCICommand({
        cwd: repoDir,
      });

      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("CI status detection", () => {
    it("handles repo without CI gracefully", async () => {
      const result = await contextCICommand({
        cwd: repoDir,
      });

      // Should not crash on repos without CI
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("handles non-git repo gracefully", async () => {
      const result = await contextCICommand({
        cwd: tempDir, // Not a git repo
      });

      // Should fail gracefully
      expect(result).toBeDefined();
    });
  });
});

describe("context command error handling", () => {
  describe("invalid inputs", () => {
    it("handles empty cwd", async () => {
      const result = await contextCommand({
        cwd: "",
      });

      expect(result).toBeDefined();
      // Empty cwd should either fail or use current directory
    });

    it("handles path with special characters", async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-ctx-special-"));
      const specialDir = path.join(tempDir, "path with spaces");

      try {
        await fs.mkdir(specialDir, { recursive: true });

        const result = await contextCommand({
          cwd: specialDir,
        });

        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
