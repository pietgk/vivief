/**
 * Hub Init Command Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";

describe("hub init command", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-init-test-"));
    hubDir = path.join(tempDir, ".devac");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates ~/.devac/ directory if not exists", async () => {
    const result = await hubInit({ hubDir });

    const dirExists = await fs
      .access(hubDir)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
    expect(result.success).toBe(true);
  });

  it("creates central.duckdb with correct schema", async () => {
    const result = await hubInit({ hubDir });

    const dbPath = path.join(hubDir, "central.duckdb");
    const dbExists = await fs
      .access(dbPath)
      .then(() => true)
      .catch(() => false);
    expect(dbExists).toBe(true);
    expect(result.hubPath).toBe(dbPath);
  });

  it("outputs success message with hub path", async () => {
    const result = await hubInit({ hubDir });

    expect(result.success).toBe(true);
    expect(result.hubPath).toBeDefined();
    expect(result.created).toBe(true);
    expect(result.message).toContain("initialized");
  });

  it("returns created=false if hub already exists without --force", async () => {
    // First init
    await hubInit({ hubDir });

    // Second init without force
    const result = await hubInit({ hubDir });

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.message).toContain("already exists");
  });

  it("overwrites existing hub with --force", async () => {
    // First init
    await hubInit({ hubDir });

    // Second init with force
    const result = await hubInit({ hubDir, force: true });

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.message).toContain("reinitialized");
  });

  it("accepts custom hub directory path", async () => {
    const customDir = path.join(tempDir, "custom-hub");
    const result = await hubInit({ hubDir: customDir });

    expect(result.success).toBe(true);
    expect(result.hubPath).toBe(path.join(customDir, "central.duckdb"));

    const dbExists = await fs
      .access(path.join(customDir, "central.duckdb"))
      .then(() => true)
      .catch(() => false);
    expect(dbExists).toBe(true);
  });

  it("returns error if directory cannot be created", async () => {
    // Use an invalid path that can't be created
    const invalidDir = "/nonexistent/deeply/nested/path/that/cannot/be/created";

    const result = await hubInit({ hubDir: invalidDir });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
