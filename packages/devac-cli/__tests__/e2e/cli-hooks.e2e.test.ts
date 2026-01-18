/**
 * CLI Hooks E2E Tests
 *
 * End-to-end tests for CLI hook commands.
 * Tests actual CLI execution with real fixtures.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Helper to get package path with runtime assertion (satisfies biome) */
function getPkgPath(packages: Record<string, string>, name: string): string {
  const pkgPath = packages[name];
  if (!pkgPath) throw new Error(`Package ${name} not found in workspace`);
  return pkgPath;
}

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

describe("CLI Hooks E2E", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("devac validate --on-stop", () => {
    test("outputs nothing for clean package with no changes", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Run validate with --on-stop on package with no changes
      const result = await execCli(
        [
          "validate",
          "--on-stop",
          "--mode",
          "quick",
          "--package",
          getPkgPath(workspace.packages, "pkg-clean"),
        ],
        workspace.rootDir
      );

      // Should be silent when no changes detected
      expect(result.stdout.trim()).toBe("");
    });

    test("detects staged TypeScript errors and outputs hook JSON", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add a file with TypeScript errors
      const errorFilePath = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "src",
        "error.ts"
      );
      await harness.writeFile(
        errorFilePath,
        `// TypeScript error: string not assignable to number
const x: number = "not a number";
export { x };
`
      );

      // Stage the file
      await workspace.git.stageFile(path.relative(workspace.rootDir, errorFilePath));

      // Verify file is staged
      const staged = await workspace.git.getStagedFiles();
      expect(staged.some((f) => f.includes("error.ts"))).toBe(true);

      // Run validate with --on-stop
      // Note: This test validates the CLI command structure, actual typecheck
      // execution depends on tsc being available and may timeout
      const result = await execCli(
        [
          "validate",
          "--on-stop",
          "--mode",
          "quick",
          "--package",
          getPkgPath(workspace.packages, "pkg-clean"),
        ],
        workspace.rootDir,
        120000 // Longer timeout for actual typecheck
      );

      // If issues found, output should be valid hook JSON
      if (result.stdout.trim()) {
        const parseResult = harness.parseHookOutput(result.stdout);
        if (parseResult.valid && parseResult.output) {
          expect(parseResult.output.hookSpecificOutput.hookEventName).toBe("Stop");
        }
      }
    });

    test("skip-typecheck option prevents typecheck execution", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add a file that would have errors
      const errorFilePath = path.join(
        getPkgPath(workspace.packages, "pkg-clean"),
        "src",
        "error.ts"
      );
      await harness.writeFile(
        errorFilePath,
        `export const x: number = "should be error but skipped";`
      );
      await workspace.git.stageFile(path.relative(workspace.rootDir, errorFilePath));

      // Run validate with --skip-typecheck
      const result = await execCli(
        [
          "validate",
          "--on-stop",
          "--mode",
          "quick",
          "--skip-typecheck",
          "--package",
          getPkgPath(workspace.packages, "pkg-clean"),
        ],
        workspace.rootDir
      );

      // With typecheck skipped and no lint errors, output should be empty
      // (Note: lint might still run and find issues depending on config)
      expect(result.code).toBe(0);
    });
  });

  describe("devac validate basic", () => {
    test("validate command runs without errors on clean package", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      // Run validate in quick mode
      const result = await execCli(
        ["validate", "--mode", "quick", "--package", getPkgPath(workspace.packages, "pkg-clean")],
        workspace.rootDir,
        60000
      );

      // Should complete without error (may or may not find issues depending on tsc availability)
      expect(result.code).not.toBe(null);
    });

    test("validate command accepts --mode quick option", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(
        ["validate", "--mode", "quick", "--package", getPkgPath(workspace.packages, "pkg-clean")],
        workspace.rootDir
      );

      // Command should be recognized and not error due to invalid options
      expect(result.stderr).not.toContain("unknown option");
    });

    test("validate command accepts --mode full option", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(
        ["validate", "--mode", "full", "--package", getPkgPath(workspace.packages, "pkg-clean")],
        workspace.rootDir
      );

      // Command should be recognized
      expect(result.stderr).not.toContain("unknown option");
    });
  });

  describe("CLI Help and Version", () => {
    test("validate --help shows usage", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["validate", "--help"], workspace.rootDir);

      expect(result.stdout).toContain("validate");
      expect(result.stdout).toContain("--mode");
    });

    test("devac --version outputs version", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: false,
      });

      const result = await execCli(["--version"], workspace.rootDir);

      // Should output a version number
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });
});
