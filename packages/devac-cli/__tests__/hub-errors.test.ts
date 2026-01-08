/**
 * Hub Errors Command Tests
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCentralHub } from "@pietgk/devac-core";
import { hubErrorsCommand } from "../src/commands/hub-errors.js";
import { hubInit } from "../src/commands/hub-init.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub errors command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-errors-test-"));
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
          message: "Type error: string not assignable to number",
          severity: "error",
          source: "tsc",
          code: "TS2322",
        },
        {
          file: "src/utils.ts",
          line: 20,
          column: 1,
          message: "Unused variable 'x'",
          severity: "warning",
          source: "eslint",
          code: "no-unused-vars",
        },
      ]);
    } finally {
      await hub.close();
    }
  }

  it("returns empty array when no errors exist", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");

    const result = await hubErrorsCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("returns validation errors from hub", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it("filters by severity", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir, severity: "error" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.errors?.[0]?.severity).toBe("error");
  });

  it("filters by source", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir, source: "eslint" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.errors?.[0]?.source).toBe("eslint");
  });

  it("filters by file path", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir, file: "auth.ts" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.errors?.[0]?.file).toContain("auth.ts");
  });

  it("respects limit option", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir, limit: 1 });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it("outputs pretty format by default", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir });

    expect(result.output).not.toContain("{");
    expect(result.output).toContain("auth.ts");
  });

  it("outputs JSON when requested", async () => {
    await hubInit({ hubDir, skipValidation: true });
    await createAndRegisterRepo("repo1");
    await pushValidationErrors("org/repo1");

    const result = await hubErrorsCommand({ hubDir, json: true });

    expect(result.output).toContain("{");
    expect(() => JSON.parse(result.output)).not.toThrow();
  });

  it("returns empty results when hub has no data", async () => {
    // Hub must be initialized first (no longer auto-creates in readOnly mode)
    await hubInit({ hubDir, skipValidation: true });

    const result = await hubErrorsCommand({ hubDir });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
