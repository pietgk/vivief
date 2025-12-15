/**
 * Affected CLI Command Tests for DevAC v2.0 Phase 5
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Section 10.1 and Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AffectedCommandOptions, affectedCommand } from "../src/commands/affected.js";

describe("CLI: affected command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-affected-test-"));

    // Create a minimal package structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create TypeScript files with dependencies
    await fs.writeFile(
      path.join(tempDir, "src", "utils.ts"),
      `export function helper(): string {
  return "helper";
}

export function anotherHelper(): number {
  return 42;
}
`
    );

    await fs.writeFile(
      path.join(tempDir, "src", "service.ts"),
      `import { helper } from "./utils";

export function doWork(): string {
  return helper();
}
`
    );

    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      `import { doWork } from "./service";

export function main(): void {
  console.log(doWork());
}
`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validation", () => {
    it("validates package path exists", async () => {
      const options: AffectedCommandOptions = {
        packagePath: "/nonexistent/path",
        changedFiles: [],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("accepts valid package path", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
    });
  });

  describe("affected analysis", () => {
    it("returns changed symbols for modified files", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      expect(result.changedSymbols).toBeDefined();
      expect(Array.isArray(result.changedSymbols)).toBe(true);
    });

    it("returns affected files list", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toBeDefined();
      expect(Array.isArray(result.affectedFiles)).toBe(true);
    });

    it("includes impact level in affected files", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // Each affected file should have an impactLevel
      for (const file of result.affectedFiles) {
        expect(["direct", "transitive"]).toContain(file.impactLevel);
      }
    });

    it("includes depth in affected files", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // Each affected file should have a depth
      for (const file of result.affectedFiles) {
        expect(typeof file.depth).toBe("number");
        expect(file.depth).toBeGreaterThanOrEqual(0);
      }
    });

    it("reports total affected count", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      expect(typeof result.totalAffected).toBe("number");
    });

    it("reports analysis time", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      expect(typeof result.analysisTimeMs).toBe("number");
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("depth control", () => {
    it("respects maxDepth option", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
        maxDepth: 1,
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // All affected files should have depth <= maxDepth
      for (const file of result.affectedFiles) {
        expect(file.depth).toBeLessThanOrEqual(1);
      }
    });

    it("uses default maxDepth when not specified", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // Should complete without error (default maxDepth is 10)
    });
  });

  describe("output format", () => {
    it("supports json format (default)", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
        format: "json",
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // Result should be structured for JSON serialization
      expect(result.changedSymbols).toBeDefined();
      expect(result.affectedFiles).toBeDefined();
    });

    it("supports list format", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
        format: "list",
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // List format just returns file paths
      expect(result.affectedFiles).toBeDefined();
    });

    it("supports tree format", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
        format: "tree",
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      // Tree format includes depth for visualization
      expect(result.affectedFiles).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("handles empty changed files list", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      expect(result.changedSymbols).toHaveLength(0);
      expect(result.affectedFiles).toHaveLength(0);
      expect(result.totalAffected).toBe(0);
    });

    it("handles non-existent changed files", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "nonexistent.ts")],
      };

      const result = await affectedCommand(options);

      // Should complete without crashing
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("handles files outside package path", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: ["/some/other/path/file.ts"],
      };

      const result = await affectedCommand(options);

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe("changed symbols", () => {
    it("includes entityId for changed symbols", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      for (const symbol of result.changedSymbols) {
        expect(symbol.entityId).toBeDefined();
      }
    });

    it("includes name and kind for changed symbols", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      for (const symbol of result.changedSymbols) {
        expect(symbol.name).toBeDefined();
        expect(symbol.kind).toBeDefined();
      }
    });

    it("includes filePath for changed symbols", async () => {
      const options: AffectedCommandOptions = {
        packagePath: tempDir,
        changedFiles: [path.join(tempDir, "src", "utils.ts")],
      };

      const result = await affectedCommand(options);

      expect(result.success).toBe(true);
      for (const symbol of result.changedSymbols) {
        expect(symbol.filePath).toBeDefined();
      }
    });
  });
});
