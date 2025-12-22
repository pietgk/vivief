/**
 * Hub Feedback Command Tests
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCentralHub } from "@pietgk/devac-core";
import { hubFeedbackCommand } from "../src/commands/hub-feedback.js";
import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub feedback command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-feedback-test-"));
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

  async function pushFeedback(repoId: string): Promise<void> {
    const hub = createCentralHub({ hubDir });
    await hub.init();
    const now = new Date().toISOString();
    try {
      await hub.pushFeedback([
        {
          feedback_id: "fb-1",
          repo_id: repoId,
          source: "tsc",
          file_path: "src/auth.ts",
          line_number: 10,
          column_number: 5,
          severity: "error",
          category: "compilation",
          title: "Type error",
          description: "Type 'string' is not assignable to type 'number'",
          code: "TS2322",
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
          feedback_id: "fb-2",
          repo_id: repoId,
          source: "ci-check",
          file_path: null,
          line_number: null,
          column_number: null,
          severity: "error",
          category: "ci-check",
          title: "Build failed",
          description: "CI build failed on main branch",
          code: null,
          suggestion: null,
          resolved: false,
          actionable: true,
          created_at: now,
          updated_at: now,
          github_issue_number: null,
          github_pr_number: null,
          workflow_name: "build",
          ci_url: "https://github.com/org/repo/actions/runs/123",
        },
        {
          feedback_id: "fb-3",
          repo_id: repoId,
          source: "github-issue",
          file_path: null,
          line_number: null,
          column_number: null,
          severity: "warning",
          category: "task",
          title: "Add authentication",
          description: "Need to implement user authentication",
          code: null,
          suggestion: null,
          resolved: false,
          actionable: true,
          created_at: now,
          updated_at: now,
          github_issue_number: 42,
          github_pr_number: null,
          workflow_name: null,
          ci_url: null,
        },
      ]);
    } finally {
      await hub.close();
    }
  }

  it("returns empty array when no feedback exists", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");

    const result = await hubFeedbackCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.feedback).toEqual([]);
  });

  it("returns feedback from hub", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.feedback).toHaveLength(3);
  });

  it("filters by source", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, source: "ci-check" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.feedback?.[0]?.source).toBe("ci-check");
  });

  it("filters by severity", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, severity: "warning" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.feedback?.[0]?.severity).toBe("warning");
  });

  it("filters by category", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, category: "task" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.feedback?.[0]?.category).toBe("task");
  });

  it("filters by file path", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, filePath: "auth.ts" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.feedback?.[0]?.file_path).toContain("auth.ts");
  });

  it("filters by actionable status", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, actionable: true });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    for (const fb of result.feedback ?? []) {
      expect(fb.actionable).toBe(true);
    }
  });

  it("respects limit option", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, limit: 1 });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it("outputs JSON by default", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir });

    expect(result.output).toContain("{");
    expect(() => JSON.parse(result.output)).not.toThrow();
  });

  it("outputs pretty format when requested", async () => {
    await hubInit({ hubDir });
    await createAndRegisterRepo("repo1");
    await pushFeedback("org/repo1");

    const result = await hubFeedbackCommand({ hubDir, pretty: true });

    expect(result.success).toBe(true);
    // Pretty format should contain readable text
    expect(result.output.length).toBeGreaterThan(0);
  });

  it("returns empty results when hub has no data", async () => {
    // Hub auto-creates on first access, so this tests empty results
    const result = await hubFeedbackCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.feedback).toEqual([]);
  });
});
