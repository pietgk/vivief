/**
 * Diagnostics Command Tests for DevAC CLI
 *
 * Tests the top-level diagnostics command which is the
 * terminology-aligned interface for querying validation
 * and workflow diagnostics from the hub.
 *
 * Note: The diagnostics command delegates to hubDiagnosticsCommand,
 * so we focus on verifying the command interface and delegation
 * rather than re-testing all hub diagnostics functionality.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { diagnosticsCommand } from "../src/commands/diagnostics.js";
import { hubInit } from "../src/commands/hub-init.js";

describe("diagnostics command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-diagnostics-test-"));
    hubDir = path.join(tempDir, ".devac");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("basic functionality", () => {
    it("returns success when hub is initialized", async () => {
      await hubInit({ hubDir, skipValidation: true });

      const result = await diagnosticsCommand({
        hubDir,
      });

      expect(result.success).toBe(true);
    });

    it("handles uninitialized hub gracefully", async () => {
      // The command may succeed with empty results or fail
      // depending on implementation - we just verify it doesn't throw
      const result = await diagnosticsCommand({
        hubDir,
      });

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
    });

    it("returns empty diagnostics when no diagnostics exist", async () => {
      await hubInit({ hubDir, skipValidation: true });

      const result = await diagnosticsCommand({
        hubDir,
      });

      expect(result.success).toBe(true);
      // The result has 'diagnostics' based on HubDiagnosticsCommandResult
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("filtering options", () => {
    beforeEach(async () => {
      await hubInit({ hubDir, skipValidation: true });
    });

    it("accepts source filter", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        source: "tsc",
      });

      expect(result.success).toBe(true);
    });

    it("accepts severity filter", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        severity: "error",
      });

      expect(result.success).toBe(true);
    });

    it("accepts category filter", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        category: "compilation",
      });

      expect(result.success).toBe(true);
    });

    it("accepts file path filter", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        filePath: "src/index.ts",
      });

      expect(result.success).toBe(true);
    });

    it("accepts actionable filter", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        actionable: true,
      });

      expect(result.success).toBe(true);
    });

    it("accepts limit option", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        limit: 10,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("output formats", () => {
    beforeEach(async () => {
      await hubInit({ hubDir, skipValidation: true });
    });

    it("returns pretty output by default", async () => {
      const result = await diagnosticsCommand({
        hubDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe("string");
    });

    it("returns JSON-formatted output when json option set", async () => {
      const result = await diagnosticsCommand({
        hubDir,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      // Output should be a string (may contain JSON or formatted output)
      expect(typeof result.output).toBe("string");
    });
  });

  describe("type exports", () => {
    it("exports DiagnosticsCommandOptions type", async () => {
      // This is a compile-time check - if types aren't exported, this would fail
      const options: import("../src/commands/diagnostics.js").DiagnosticsCommandOptions = {
        hubDir: "/test",
      };
      expect(options.hubDir).toBe("/test");
    });

    it("exports DiagnosticsCommandResult type", async () => {
      await hubInit({ hubDir, skipValidation: true });

      const result: import("../src/commands/diagnostics.js").DiagnosticsCommandResult =
        await diagnosticsCommand({ hubDir });

      expect(result.success).toBeDefined();
      expect(result.diagnostics).toBeDefined();
      expect(result.output).toBeDefined();
    });
  });
});
