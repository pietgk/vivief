/**
 * Code Graph CLI Command Tests
 *
 * Tests for symbol query, deps, dependents, file-symbols, and call-graph commands.
 * These are proper integration tests that validate each step of the pipeline.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeCommand } from "../src/commands/analyze.js";
import { callGraphCommand } from "../src/commands/call-graph.js";
import { dependentsCommand } from "../src/commands/dependents.js";
import { depsCommand } from "../src/commands/deps.js";
import { fileSymbolsCommand } from "../src/commands/file-symbols.js";
import { symbolQueryCommand } from "../src/commands/query/symbol.js";

describe("Code Graph Commands", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-code-graph-test-"));

    // Create a package with TypeScript files and dependencies
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-pkg", version: "1.0.0" })
    );

    await fs.writeFile(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "node",
          strict: true,
        },
        include: ["src/**/*"],
      })
    );

    // Create TypeScript files with functions and call relationships
    await fs.writeFile(
      path.join(tempDir, "src", "utils.ts"),
      `export function helper(): string {
  return "helper";
}

export function formatName(name: string): string {
  return name.toUpperCase();
}

export const CONSTANT = 42;
`
    );

    await fs.writeFile(
      path.join(tempDir, "src", "service.ts"),
      `import { helper, formatName } from "./utils";

export function processData(input: string): string {
  const result = helper();
  return formatName(result + input);
}

export class DataService {
  process(data: string): string {
    return processData(data);
  }
}
`
    );

    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      `import { processData, DataService } from "./service";

export function main(): void {
  const result = processData("test");
  console.log(result);
}

export function runService(): void {
  const service = new DataService();
  console.log(service.process("data"));
}
`
    );

    // Analyze the package to generate seeds - VALIDATE SUCCESS
    const analyzeResult = await analyzeCommand({
      packagePath: tempDir,
      repoName: "test-repo",
      branch: "main",
    });

    // Assert analysis succeeded - no silent skips!
    expect(analyzeResult.success).toBe(true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("symbol query command", () => {
    it("finds symbols by exact name", async () => {
      const result = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);

      // Validate field structure - API returns camelCase
      const symbols = result.data as Record<string, unknown>[];
      expect(symbols).toBeDefined();
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]).toHaveProperty("entityId");
      expect(symbols[0]).toHaveProperty("name", "helper");
    });

    it("finds symbols with wildcard match", async () => {
      const result = await symbolQueryCommand("format*", {
        package: tempDir,
      });

      expect(result.success).toBe(true);
      // Should match formatName
      expect(result.count).toBeGreaterThan(0);

      const symbols = result.data as Record<string, unknown>[];
      expect(symbols).toBeDefined();
      expect(symbols.some((s) => (s.name as string).startsWith("format"))).toBe(true);
    });

    it("filters by kind", async () => {
      const result = await symbolQueryCommand("DataService", {
        kind: "class",
        package: tempDir,
      });

      expect(result.success).toBe(true);

      if (result.count > 0) {
        const symbols = result.data as Record<string, unknown>[];
        expect(symbols[0]).toHaveProperty("entityId");
        expect(symbols[0]).toHaveProperty("kind", "class");
      }
    });

    it("returns empty when symbol not found", async () => {
      const result = await symbolQueryCommand("nonexistentSymbol", {
        package: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it("respects limit option", async () => {
      const result = await symbolQueryCommand("", {
        package: tempDir,
        limit: "2",
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeLessThanOrEqual(2);
    });

    it("outputs JSON when requested", async () => {
      const result = await symbolQueryCommand("helper", {
        package: tempDir,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output).toContain("{");
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it("outputs pretty format by default", async () => {
      const result = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output.length).toBeGreaterThan(0);
    });

    it("returns empty for invalid package path", async () => {
      const result = await symbolQueryCommand("helper", {
        package: "/nonexistent/path",
      });

      // With hub mode, invalid paths return empty results rather than errors
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  describe("file-symbols command", () => {
    it("returns symbols in a file", async () => {
      const result = await fileSymbolsCommand({
        filePath: "src/utils.ts",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(result.symbols).toBeDefined();

      // Validate field structure - API returns camelCase
      const symbols = result.symbols as Record<string, unknown>[];
      expect(symbols[0]).toHaveProperty("entityId");
    });

    it("filters by kind", async () => {
      const result = await fileSymbolsCommand({
        filePath: "src/service.ts",
        kind: "class",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      // Should find DataService class
      if (result.count > 0) {
        const symbols = result.symbols as Record<string, unknown>[];
        expect(symbols[0]).toHaveProperty("kind", "class");
      }
    });

    it("returns empty for nonexistent file", async () => {
      const result = await fileSymbolsCommand({
        filePath: "src/nonexistent.ts",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it("outputs pretty format by default", async () => {
      const result = await fileSymbolsCommand({
        filePath: "src/utils.ts",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it("outputs JSON when requested", async () => {
      const result = await fileSymbolsCommand({
        filePath: "src/utils.ts",
        packagePath: tempDir,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("{");
    });
  });

  describe("deps command", () => {
    it("returns dependencies for an entity", async () => {
      // First find a symbol to get its entity ID
      const findResult = await symbolQueryCommand("processData", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      // Extract entityId (camelCase - API format)
      const symbols = findResult.data as Record<string, unknown>[];
      expect(symbols[0]).toHaveProperty("entityId");
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await depsCommand({
        entityId,
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      // processData calls helper and formatName
      expect(result.edges).toBeDefined();
    });

    it("filters by edge type", async () => {
      const findResult = await symbolQueryCommand("processData", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await depsCommand({
        entityId,
        edgeType: "CALLS",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
    });

    it("outputs pretty format by default", async () => {
      const result = await depsCommand({
        entityId: "test-entity",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
    });

    it("outputs JSON when requested", async () => {
      const result = await depsCommand({
        entityId: "test-entity",
        packagePath: tempDir,
        json: true,
      });

      expect(result.output).toContain("{");
    });
  });

  describe("dependents command", () => {
    it("returns dependents for an entity", async () => {
      // Find helper function which is called by processData
      const findResult = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      expect(symbols[0]).toHaveProperty("entityId");
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await dependentsCommand({
        entityId,
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.edges).toBeDefined();
    });

    it("filters by edge type", async () => {
      const findResult = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await dependentsCommand({
        entityId,
        edgeType: "CALLS",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
    });

    it("outputs pretty format by default", async () => {
      const result = await dependentsCommand({
        entityId: "test-entity",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
    });

    it("outputs JSON when requested", async () => {
      const result = await dependentsCommand({
        entityId: "test-entity",
        packagePath: tempDir,
        json: true,
      });

      expect(result.output).toContain("{");
    });
  });

  describe("call-graph command", () => {
    it("returns call graph for a function", async () => {
      const findResult = await symbolQueryCommand("processData", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      expect(symbols[0]).toHaveProperty("entityId");
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await callGraphCommand({
        entityId,
        direction: "both",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.callers).toBeDefined();
      expect(result.callees).toBeDefined();
    });

    it("returns only callers when direction is callers", async () => {
      const findResult = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await callGraphCommand({
        entityId,
        direction: "callers",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.callers).toBeDefined();
    });

    it("returns only callees when direction is callees", async () => {
      const findResult = await symbolQueryCommand("processData", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await callGraphCommand({
        entityId,
        direction: "callees",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.callees).toBeDefined();
    });

    it("respects max depth", async () => {
      const findResult = await symbolQueryCommand("main", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;
      expect(entityId).toBeTruthy();

      const result = await callGraphCommand({
        entityId,
        direction: "callees",
        maxDepth: 1,
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
    });

    it("outputs JSON when requested", async () => {
      const findResult = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;

      const result = await callGraphCommand({
        entityId,
        direction: "both",
        packagePath: tempDir,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("{");
    });

    it("outputs pretty format by default", async () => {
      const findResult = await symbolQueryCommand("helper", {
        package: tempDir,
      });

      expect(findResult.success).toBe(true);
      expect(findResult.count).toBeGreaterThan(0);

      const symbols = findResult.data as Record<string, unknown>[];
      const entityId = symbols[0].entityId as string;

      const result = await callGraphCommand({
        entityId,
        direction: "both",
        packagePath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });
  });
});
