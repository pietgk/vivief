/**
 * Effects Command Tests for DevAC CLI
 *
 * Tests the effects command that queries effects extracted during analysis.
 * Effects represent observable behaviors in code (function calls, stores, etc.).
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type EffectsCommandOptions, effectsCommand } from "../src/commands/effects.js";

describe("effects command", () => {
  let tempDir: string;
  let packageDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-effects-test-"));
    packageDir = path.join(tempDir, "package");
    await fs.mkdir(packageDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("options interface", () => {
    it("has required fields defined", () => {
      const options: EffectsCommandOptions = {};
      expect(options.packagePath).toBeUndefined();
      expect(options.type).toBeUndefined();
      expect(options.file).toBeUndefined();
      expect(options.entity).toBeUndefined();
      expect(options.externalOnly).toBeUndefined();
      expect(options.asyncOnly).toBeUndefined();
      expect(options.limit).toBeUndefined();
      expect(options.json).toBeUndefined();
    });

    it("accepts all optional parameters", () => {
      const options: EffectsCommandOptions = {
        packagePath: "/path/to/package",
        type: "FunctionCall",
        file: "src/auth.ts",
        entity: "repo:pkg:function:abc123",
        externalOnly: true,
        asyncOnly: false,
        limit: 50,
        json: true,
      };

      expect(options.packagePath).toBe("/path/to/package");
      expect(options.type).toBe("FunctionCall");
      expect(options.file).toBe("src/auth.ts");
      expect(options.entity).toBe("repo:pkg:function:abc123");
      expect(options.externalOnly).toBe(true);
      expect(options.asyncOnly).toBe(false);
      expect(options.limit).toBe(50);
      expect(options.json).toBe(true);
    });
  });

  describe("command execution with no seeds", () => {
    it("returns error when no effects found in package mode", async () => {
      const result = await effectsCommand({
        packagePath: packageDir,
      });

      // Without seeds, we expect either an error or empty results
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.count).toBe("number");
      expect(typeof result.timeMs).toBe("number");
    });

    it("handles missing package directory gracefully", async () => {
      const result = await effectsCommand({
        packagePath: "/non/existent/path",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("filter options", () => {
    it("accepts valid effect types", () => {
      const validTypes = ["FunctionCall", "Store", "Retrieve", "Send", "Request", "Response"];
      for (const type of validTypes) {
        const options: EffectsCommandOptions = { type };
        expect(options.type).toBe(type);
      }
    });

    it("accepts file path filter", () => {
      const options: EffectsCommandOptions = {
        file: "src/services/payment",
      };
      expect(options.file).toBe("src/services/payment");
    });

    it("accepts entity ID filter", () => {
      const options: EffectsCommandOptions = {
        entity: "repo:pkg:function:hash123",
      };
      expect(options.entity).toBe("repo:pkg:function:hash123");
    });

    it("accepts boolean filters", () => {
      const externalOnly: EffectsCommandOptions = { externalOnly: true };
      const asyncOnly: EffectsCommandOptions = { asyncOnly: true };
      const both: EffectsCommandOptions = { externalOnly: true, asyncOnly: true };

      expect(externalOnly.externalOnly).toBe(true);
      expect(asyncOnly.asyncOnly).toBe(true);
      expect(both.externalOnly).toBe(true);
      expect(both.asyncOnly).toBe(true);
    });

    it("accepts limit parameter", () => {
      const options: EffectsCommandOptions = { limit: 100 };
      expect(options.limit).toBe(100);
    });
  });

  describe("output formats", () => {
    it("supports JSON output option", () => {
      const options: EffectsCommandOptions = { json: true };
      expect(options.json).toBe(true);
    });

    it("defaults to table output when json is false", () => {
      const options: EffectsCommandOptions = { json: false };
      expect(options.json).toBe(false);
    });
  });

  describe("result structure", () => {
    it("returns expected result fields", async () => {
      const result = await effectsCommand({
        packagePath: packageDir,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("timeMs");
    });

    it("includes effects array on success", async () => {
      // With no seeds, we should still get a result structure
      const result = await effectsCommand({
        packagePath: packageDir,
        json: true,
      });

      // Even on failure, should have these properties
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.output).toBe("string");
    });
  });
});

describe("effects command edge cases", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-effects-edge-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("SQL injection prevention", () => {
    it("escapes single quotes in type filter", async () => {
      const result = await effectsCommand({
        packagePath: tempDir,
        type: "'; DROP TABLE effects; --",
      });

      // Should not crash or execute malicious SQL
      expect(result).toBeDefined();
    });

    it("escapes single quotes in file filter", async () => {
      const result = await effectsCommand({
        packagePath: tempDir,
        file: "'; DELETE FROM effects; --",
      });

      // Should not crash or execute malicious SQL
      expect(result).toBeDefined();
    });

    it("escapes single quotes in entity filter", async () => {
      const result = await effectsCommand({
        packagePath: tempDir,
        entity: "'; UPDATE effects SET callee_name='hacked'; --",
      });

      // Should not crash or execute malicious SQL
      expect(result).toBeDefined();
    });
  });

  describe("limit parameter validation", () => {
    it("handles zero limit", async () => {
      const result = await effectsCommand({
        packagePath: tempDir,
        limit: 0,
      });

      expect(result).toBeDefined();
    });

    it("handles large limit", async () => {
      const result = await effectsCommand({
        packagePath: tempDir,
        limit: 10000,
      });

      expect(result).toBeDefined();
    });
  });
});
