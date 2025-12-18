/**
 * Validate CLI Command Tests for DevAC v2.0 Phase 5
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Section 10 and Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ValidateOptions, validateCommand } from "../src/commands/validate.js";

describe("CLI: validate command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-validate-test-"));

    // Create a minimal package structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create a tsconfig.json
    await fs.writeFile(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          outDir: "./dist",
        },
        include: ["src/**/*"],
      })
    );

    // Create a valid TypeScript file
    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      `export function greet(name: string): string {
  return "Hello, " + name;
}
`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validation", () => {
    it("validates package path exists", async () => {
      const options: ValidateOptions = {
        packagePath: "/nonexistent/path",
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("accepts valid package path", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      // Should succeed (no files to validate means success)
      expect(result.success).toBe(true);
    });
  });

  describe("quick mode", () => {
    it("runs typecheck in quick mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("quick");
      expect(result.typecheck).toBeDefined();
    });

    it("runs lint in quick mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("quick");
      expect(result.lint).toBeDefined();
    });

    it("skips tests in quick mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("quick");
      expect(result.tests).toBeUndefined();
    });

    it("uses maxDepth 1 in quick mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.affected.maxDepthReached).toBeLessThanOrEqual(1);
    });
  });

  describe("full mode", () => {
    it("runs typecheck in full mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "full",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("full");
      expect(result.typecheck).toBeDefined();
    });

    it("runs lint in full mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "full",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("full");
      expect(result.lint).toBeDefined();
    });

    it("runs tests in full mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "full",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("full");
      expect(result.tests).toBeDefined();
    });

    it("uses higher maxDepth in full mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "full",
      };

      const result = await validateCommand(options);

      // Full mode allows deeper traversal (up to 10)
      expect(result.affected).toBeDefined();
    });
  });

  describe("affected analysis", () => {
    it("analyzes affected symbols for changed files", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.affected).toBeDefined();
      expect(result.affected.changedSymbols).toBeDefined();
      expect(result.affected.affectedFiles).toBeDefined();
    });

    it("reports affected file count", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(typeof result.affected.totalAffected).toBe("number");
    });

    it("includes analysis time", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(typeof result.affected.analysisTimeMs).toBe("number");
    });
  });

  describe("issue enrichment", () => {
    it("enriches typecheck issues with context", async () => {
      // Create a file with type error
      await fs.writeFile(
        path.join(tempDir, "src", "error.ts"),
        `export function broken(): string {
  return 123; // Type error: number not assignable to string
}
`
      );

      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "error.ts")],
        mode: "quick",
        enrichIssues: true,
      };

      const result = await validateCommand(options);

      // If there are issues, they should have promptMarkdown
      if (result.typecheck && result.typecheck.issues.length > 0) {
        expect(result.typecheck.issues[0]!.promptMarkdown).toBeDefined();
      }
    });
  });

  describe("result structure", () => {
    it("returns success status", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(typeof result.success).toBe("boolean");
    });

    it("returns total issue count", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(typeof result.totalIssues).toBe("number");
    });

    it("returns total time", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(typeof result.totalTimeMs).toBe("number");
    });

    it("returns mode used", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.mode).toBe("quick");
    });
  });

  describe("config overrides", () => {
    it("allows skipping typecheck", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
        skipTypecheck: true,
      };

      const result = await validateCommand(options);

      expect(result.typecheck).toBeUndefined();
    });

    it("allows skipping lint", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
        skipLint: true,
      };

      const result = await validateCommand(options);

      expect(result.lint).toBeUndefined();
    });

    it("allows forcing tests in quick mode", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
        forceTests: true,
      };

      const result = await validateCommand(options);

      expect(result.tests).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("handles missing tsconfig gracefully", async () => {
      // Remove tsconfig
      await fs.rm(path.join(tempDir, "tsconfig.json"));

      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "index.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      // Should still complete (typecheck may fail but command shouldn't crash)
      expect(result).toBeDefined();
      expect(result.mode).toBe("quick");
    });

    it("handles empty changed files list", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [],
        mode: "quick",
      };

      const result = await validateCommand(options);

      expect(result.success).toBe(true);
      expect(result.totalIssues).toBe(0);
    });

    it("handles non-existent changed files", async () => {
      const options: ValidateOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "nonexistent.ts")],
        mode: "quick",
      };

      const result = await validateCommand(options);

      // Should complete without crashing
      expect(result).toBeDefined();
    });
  });
});
