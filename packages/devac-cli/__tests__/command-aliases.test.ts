/**
 * Command Aliases Tests for DevAC CLI
 *
 * Tests that command aliases work correctly:
 * - analyze → extract
 * - validate → check
 * - workspace → ws
 *
 * Also tests the default action (devac with no args shows status)
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("command aliases", () => {
  let tempDir: string;
  const cliPath = path.resolve(__dirname, "../dist/index.js");

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-alias-test-"));
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

  describe("analyze → extract alias", () => {
    it("extract command shows same help as analyze", () => {
      const analyzeHelp = runCli("analyze --help");
      const extractHelp = runCli("extract --help");

      expect(analyzeHelp.exitCode).toBe(0);
      expect(extractHelp.exitCode).toBe(0);

      // Both should mention "analyze|extract"
      expect(analyzeHelp.stdout).toContain("analyze|extract");
      expect(extractHelp.stdout).toContain("analyze|extract");
    });

    it("extract command is listed in main help", () => {
      const help = runCli("--help");

      expect(help.stdout).toContain("analyze|extract");
    });
  });

  describe("validate → check alias", () => {
    it("check command shows same help as validate", () => {
      const validateHelp = runCli("validate --help");
      const checkHelp = runCli("check --help");

      expect(validateHelp.exitCode).toBe(0);
      expect(checkHelp.exitCode).toBe(0);

      // Both should mention "validate|check"
      expect(validateHelp.stdout).toContain("validate|check");
      expect(checkHelp.stdout).toContain("validate|check");
    });

    it("check command is listed in main help", () => {
      const help = runCli("--help");

      expect(help.stdout).toContain("validate|check");
    });
  });

  describe("workspace → ws alias", () => {
    it("ws command shows same help as workspace", () => {
      const workspaceHelp = runCli("workspace --help");
      const wsHelp = runCli("ws --help");

      expect(workspaceHelp.exitCode).toBe(0);
      expect(wsHelp.exitCode).toBe(0);

      // Both should mention "workspace|ws"
      expect(workspaceHelp.stdout).toContain("workspace|ws");
      expect(wsHelp.stdout).toContain("workspace|ws");
    });

    it("ws command is listed in main help", () => {
      const help = runCli("--help");

      expect(help.stdout).toContain("workspace|ws");
    });

    it("ws subcommands work (status)", () => {
      const result = runCli("ws status --help");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("status");
    });
  });

  describe("merged workspace subcommands", () => {
    it("workspace has register subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("register");
    });

    it("workspace has unregister subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("unregister");
    });

    it("workspace has list subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("list");
    });

    it("workspace has refresh subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("refresh");
    });

    it("workspace has sync subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("sync");
    });

    it("workspace has ci subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("ci");
    });

    it("workspace has issues subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("issues");
    });

    it("workspace has review subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("review");
    });

    it("workspace has mcp subcommand", () => {
      const result = runCli("workspace --help");

      expect(result.stdout).toContain("mcp");
    });
  });

  describe("default action (no arguments)", () => {
    it("shows status when no command provided", () => {
      const result = runCli("");

      // Should show some status output (not help)
      // Status output typically contains workspace/hub info
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

  describe("diagnostics command", () => {
    it("diagnostics command is available", () => {
      const result = runCli("diagnostics --help");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("diagnostics");
    });

    it("diagnostics command is listed in main help", () => {
      const help = runCli("--help");

      expect(help.stdout).toContain("diagnostics");
    });
  });

  describe("status command", () => {
    it("status command is available", () => {
      const result = runCli("status --help");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("status");
    });

    it("status command supports --brief option", () => {
      const result = runCli("status --help");

      expect(result.stdout).toContain("--brief");
    });

    it("status command supports --full option", () => {
      const result = runCli("status --help");

      expect(result.stdout).toContain("--full");
    });

    it("status command is listed in main help", () => {
      const help = runCli("--help");

      expect(help.stdout).toContain("status");
    });
  });
});
