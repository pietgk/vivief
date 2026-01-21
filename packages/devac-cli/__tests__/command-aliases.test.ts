/**
 * Command Structure Tests for DevAC CLI v4.0
 *
 * Tests the three-command model:
 * - sync: analyze packages, register repos, sync CI/issues/docs
 * - status: workspace health, seeds, diagnostics, doctor
 * - query: all code graph queries (symbol, deps, sql, etc.)
 *
 * Plus utility commands:
 * - mcp: MCP server for AI assistants
 * - workflow: CI/git integration
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CLI command structure (v4.0)", () => {
  let tempDir: string;
  const cliPath = path.resolve(__dirname, "../dist/index.js");

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-cmd-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI commands and capture output
   */
  function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(`node ${cliPath} ${args}`, {
        encoding: "utf-8",
        cwd: tempDir,
        timeout: 30000,
      });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitCode: execError.status ?? 1,
      };
    }
  }

  describe("main help shows three core commands", () => {
    it("lists sync command", () => {
      const help = runCli("--help");
      expect(help.stdout).toContain("sync");
    });

    it("lists status command", () => {
      const help = runCli("--help");
      expect(help.stdout).toContain("status");
    });

    it("lists query command", () => {
      const help = runCli("--help");
      expect(help.stdout).toContain("query");
    });

    it("lists mcp command", () => {
      const help = runCli("--help");
      expect(help.stdout).toContain("mcp");
    });

    it("lists workflow command", () => {
      const help = runCli("--help");
      expect(help.stdout).toContain("workflow");
    });
  });

  describe("sync command", () => {
    it("sync command is available", () => {
      const result = runCli("sync --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("sync");
    });

    it("sync supports --validate flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--validate");
    });

    it("sync supports --ci flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--ci");
    });

    it("sync supports --issues flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--issues");
    });

    it("sync supports --docs flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--docs");
    });

    it("sync supports --watch flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--watch");
    });

    it("sync supports --force flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--force");
    });

    it("sync supports --clean flag", () => {
      const result = runCli("sync --help");
      expect(result.stdout).toContain("--clean");
    });
  });

  describe("status command", () => {
    it("status command is available", () => {
      const result = runCli("status --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("status");
    });

    it("status supports --brief option", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--brief");
    });

    it("status supports --full option", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--full");
    });

    it("status supports --diagnostics flag", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--diagnostics");
    });

    it("status supports --doctor flag", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--doctor");
    });

    it("status supports --seeds flag", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--seeds");
    });

    it("status supports --hub flag", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--hub");
    });

    it("status supports --changeset flag", () => {
      const result = runCli("status --help");
      expect(result.stdout).toContain("--changeset");
    });
  });

  describe("query command", () => {
    it("query command is available", () => {
      const result = runCli("query --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("query");
    });

    it("query has sql subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("sql");
    });

    it("query has symbol subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("symbol");
    });

    it("query has deps subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("deps");
    });

    it("query has dependents subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("dependents");
    });

    it("query has affected subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("affected");
    });

    it("query has file subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("file");
    });

    it("query has call-graph subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("call-graph");
    });

    it("query has effects subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("effects");
    });

    it("query has rules subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("rules");
    });

    it("query has c4 subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("c4");
    });

    it("query has context subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("context");
    });

    it("query has repos subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("repos");
    });

    it("query has schema subcommand", () => {
      const result = runCli("query --help");
      expect(result.stdout).toContain("schema");
    });
  });

  describe("workflow command", () => {
    it("workflow command is available", () => {
      const result = runCli("workflow --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("workflow");
    });

    it("workflow has pre-commit subcommand", () => {
      const result = runCli("workflow --help");
      expect(result.stdout).toContain("pre-commit");
    });

    it("workflow has prepare-ship subcommand", () => {
      const result = runCli("workflow --help");
      expect(result.stdout).toContain("prepare-ship");
    });

    it("workflow has check-changeset subcommand", () => {
      const result = runCli("workflow --help");
      expect(result.stdout).toContain("check-changeset");
    });

    it("workflow has install-local subcommand", () => {
      const result = runCli("workflow --help");
      expect(result.stdout).toContain("install-local");
    });

    it("workflow has plugin-dev subcommand", () => {
      const result = runCli("workflow --help");
      expect(result.stdout).toContain("plugin-dev");
    });
  });

  describe("default action (no arguments)", () => {
    it("shows status when no command provided", () => {
      const result = runCli("");

      // Should show some status output (not help)
      expect(result.exitCode).toBe(0);
      // Should not show the full help text
      expect(result.stdout).not.toContain("Usage: devac [options] [command]");
    });

    it("status output contains expected keywords", () => {
      const result = runCli("");

      expect(result.exitCode).toBe(0);
      // One-liner status typically has keywords like workspace, hub, next
      const output = result.stdout.toLowerCase();
      expect(
        output.includes("workspace") ||
          output.includes("hub") ||
          output.includes("ok") ||
          output.includes("next")
      ).toBe(true);
    });
  });
});
