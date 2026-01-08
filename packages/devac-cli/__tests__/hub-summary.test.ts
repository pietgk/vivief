/**
 * Hub Summary Command Tests
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCentralHub } from "@pietgk/devac-core";
import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";
import { hubSummaryCommand } from "../src/commands/hub-summary.js";

describe("hub summary command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-summary-test-"));
    hubDir = path.join(tempDir, ".devac");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createAndRegisterRepo(name: string): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, ".git", "config"),
      `[remote "origin"]\n  url = git@github.com:org/${name}.git\n`
    );

    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name, version: "1.0.0" })
    );
    await fs.writeFile(
      path.join(seedPath, "stats.json"),
      JSON.stringify({
        nodeCount: 10,
        edgeCount: 5,
        refCount: 2,
        fileCount: 3,
      })
    );
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");
    await fs.writeFile(
      path.join(repoPath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    await hubRegister({ hubDir, repoPath });
    return repoPath;
  }

  async function pushValidationErrors(repoId: string): Promise<void> {
    const hub = createCentralHub({ hubDir });
    await hub.init({ skipValidation: true });
    try {
      await hub.pushValidationErrors(repoId, "", [
        {
          file: "src/auth.ts",
          line: 10,
          column: 5,
          message: "Type error",
          severity: "error",
          source: "tsc",
          code: "TS2322",
        },
        {
          file: "src/utils.ts",
          line: 20,
          column: 1,
          message: "Unused variable",
          severity: "warning",
          source: "eslint",
          code: "no-unused-vars",
        },
      ]);
    } finally {
      await hub.close();
    }
  }

  async function pushDiagnostics(repoId: string): Promise<void> {
    const hub = createCentralHub({ hubDir });
    await hub.init({ skipValidation: true });
    const now = new Date().toISOString();
    try {
      await hub.pushDiagnostics([
        {
          diagnostic_id: "diag-1",
          repo_id: repoId,
          source: "tsc",
          file_path: "src/file1.ts",
          line_number: 10,
          column_number: 5,
          severity: "error",
          category: "compilation",
          title: "Error 1",
          description: "Description 1",
          code: null,
          suggestion: null,
          resolved: false,
          actionable: true,
          created_at: now,
          updated_at: now,
          github_issue_number: null,
          github_pr_number: null,
          workflow_name: null,
          ci_url: null,
        },
        {
          diagnostic_id: "diag-2",
          repo_id: repoId,
          source: "ci-check",
          file_path: null,
          line_number: null,
          column_number: null,
          severity: "warning",
          category: "ci-check",
          title: "Warning 1",
          description: "Description 2",
          code: null,
          suggestion: null,
          resolved: false,
          actionable: true,
          created_at: now,
          updated_at: now,
          github_issue_number: null,
          github_pr_number: null,
          workflow_name: null,
          ci_url: null,
        },
        {
          diagnostic_id: "diag-3",
          repo_id: repoId,
          source: "github-issue",
          file_path: null,
          line_number: null,
          column_number: null,
          severity: "suggestion",
          category: "task",
          title: "Suggestion 1",
          description: "Description 3",
          code: null,
          suggestion: null,
          resolved: false,
          actionable: true,
          created_at: now,
          updated_at: now,
          github_issue_number: 1,
          github_pr_number: null,
          workflow_name: null,
          ci_url: null,
        },
      ]);
    } finally {
      await hub.close();
    }
  }

  describe("counts mode", () => {
    it("returns zero counts when no data exists", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");

      const result = await hubSummaryCommand({ hubDir, type: "counts" });

      expect(result.success).toBe(true);
      expect(result.counts?.validation?.total).toBe(0);
      expect(result.counts?.diagnostics?.total).toBe(0);
    });

    it("returns validation counts", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushValidationErrors("org/repo1");

      const result = await hubSummaryCommand({ hubDir, type: "counts" });

      expect(result.success).toBe(true);
      expect(result.counts?.validation?.errors).toBe(1);
      expect(result.counts?.validation?.warnings).toBe(1);
      expect(result.counts?.validation?.total).toBe(2);
    });

    it("returns diagnostics counts", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushDiagnostics("org/repo1");

      const result = await hubSummaryCommand({ hubDir, type: "counts" });

      expect(result.success).toBe(true);
      expect(result.counts?.diagnostics?.error).toBe(1);
      expect(result.counts?.diagnostics?.warning).toBe(1);
      expect(result.counts?.diagnostics?.suggestion).toBe(1);
      expect(result.counts?.diagnostics?.total).toBe(3);
    });
  });

  describe("validation mode", () => {
    it("returns validation summary grouped by source", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushValidationErrors("org/repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "validation",
        groupBy: "source",
      });

      expect(result.success).toBe(true);
      expect(result.validationSummary).toBeDefined();
      expect(result.validationSummary?.length).toBeGreaterThan(0);
    });

    it("returns empty summary when no validation errors", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "validation",
        groupBy: "source",
      });

      expect(result.success).toBe(true);
      expect(result.validationSummary).toEqual([]);
    });
  });

  describe("diagnostics mode", () => {
    it("returns diagnostics summary grouped by source", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushDiagnostics("org/repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "diagnostics",
        groupBy: "source",
      });

      expect(result.success).toBe(true);
      expect(result.diagnosticsSummary).toBeDefined();
      expect(result.diagnosticsSummary?.length).toBeGreaterThan(0);
    });

    it("returns diagnostics summary grouped by severity", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushDiagnostics("org/repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "diagnostics",
        groupBy: "severity",
      });

      expect(result.success).toBe(true);
      expect(result.diagnosticsSummary).toBeDefined();
    });

    it("returns empty summary when no diagnostics", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "diagnostics",
        groupBy: "source",
      });

      expect(result.success).toBe(true);
      expect(result.diagnosticsSummary).toEqual([]);
    });
  });

  describe("output formatting", () => {
    it("outputs pretty format by default", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");
      await pushValidationErrors("org/repo1");

      const result = await hubSummaryCommand({ hubDir, type: "counts" });

      expect(result.success).toBe(true);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it("outputs JSON when requested", async () => {
      await hubInit({ hubDir, skipValidation: true });
      await createAndRegisterRepo("repo1");

      const result = await hubSummaryCommand({
        hubDir,
        type: "counts",
        json: true,
      });

      expect(result.output).toContain("{");
      expect(() => JSON.parse(result.output)).not.toThrow();
    });
  });

  it("returns zero counts when hub has no data", async () => {
    // Hub must be initialized first (no longer auto-creates in readOnly mode)
    await hubInit({ hubDir, skipValidation: true });

    const result = await hubSummaryCommand({ hubDir, type: "counts" });

    expect(result.success).toBe(true);
    expect(result.counts?.validation?.total).toBe(0);
    expect(result.counts?.diagnostics?.total).toBe(0);
  });
});
