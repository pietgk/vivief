/**
 * CLI E2E Tests
 *
 * End-to-end tests for CLI commands.
 * Tests actual CLI execution with real fixtures.
 *
 * Note: The old `validate` command tests have been removed as part of the
 * v4.0 three-command reorganization. Validation is now available via:
 * - `devac sync --validate` - Run validation after analysis
 * - `devac status --changeset` - Check if changeset is needed
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * Execute a CLI command and capture output.
 */
async function execCli(
  args: string[],
  cwd: string,
  timeout = 60000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    // Use the locally built CLI
    const cliPath = path.resolve(__dirname, "../../dist/index.js");

    const proc = spawn("node", [cliPath, ...args], {
      cwd,
      timeout,
      env: {
        ...process.env,
        // Disable colors for easier parsing
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on("error", (error) => {
      resolve({ stdout, stderr: error.message, code: null });
    });
  });
}

describe("CLI E2E", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("CLI Help and Version", () => {
    test("devac --version outputs version", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["--version"], workspace.rootDir);

      // Should output a version number
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test("devac --help shows core commands", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["--help"], workspace.rootDir);

      // Should show the three core commands
      expect(result.stdout).toContain("sync");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("query");
    });

    test("devac sync --help shows options", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["sync", "--help"], workspace.rootDir);

      expect(result.stdout).toContain("sync");
      expect(result.stdout).toContain("--validate");
    });

    test("devac status --help shows options", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["status", "--help"], workspace.rootDir);

      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("--diagnostics");
      expect(result.stdout).toContain("--doctor");
    });

    test("devac query --help shows subcommands", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["query", "--help"], workspace.rootDir);

      expect(result.stdout).toContain("query");
      expect(result.stdout).toContain("sql");
      expect(result.stdout).toContain("symbol");
      expect(result.stdout).toContain("deps");
    });
  });

  describe("Default action", () => {
    test("devac with no args shows status", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli([], workspace.rootDir);

      // Should show status output, not help
      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain("Usage: devac [options] [command]");
    });
  });
});
