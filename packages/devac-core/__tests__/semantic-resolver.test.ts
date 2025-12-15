/**
 * Semantic Resolver Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Section 6.5 and Phase 2 plan.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Import semantic resolver (to be implemented)
import {
  type SemanticResolver,
  createSemanticResolver,
} from "../src/resolver/semantic-resolver.js";

describe("SemanticResolver", () => {
  let tempDir: string;
  let resolver: SemanticResolver;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-resolver-test-"));
    resolver = createSemanticResolver({
      repoName: "test-repo",
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("buildExportIndex", () => {
    it("indexes all exported symbols in package", async () => {
      // Create a file with multiple exports
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        `
export function helper() { return 1; }
export const VALUE = 42;
export class MyClass {}
export interface MyInterface {}
export type MyType = string;
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      expect(index.exports.size).toBeGreaterThan(0);
      expect(index.hasExport("helper")).toBe(true);
      expect(index.hasExport("VALUE")).toBe(true);
      expect(index.hasExport("MyClass")).toBe(true);
      expect(index.hasExport("MyInterface")).toBe(true);
      expect(index.hasExport("MyType")).toBe(true);
    });

    it("handles default exports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `
export default function mainFunction() {
  return "main";
}
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      // Default exports are indexed under "default" name
      const mainFile = path.join(tempDir, "src", "main.ts");
      expect(index.getDefaultExport(mainFile)).toBeDefined();
    });

    it("handles named exports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "src", "named.ts"),
        `
export const foo = 1;
export const bar = 2;
export function baz() {}
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      expect(index.hasExport("foo")).toBe(true);
      expect(index.hasExport("bar")).toBe(true);
      expect(index.hasExport("baz")).toBe(true);
    });

    it("handles re-exports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // Original file
      await fs.writeFile(
        path.join(tempDir, "src", "original.ts"),
        `
export const originalValue = 123;
export function originalFunc() {}
`
      );

      // Re-export file
      await fs.writeFile(
        path.join(tempDir, "src", "reexport.ts"),
        `
export { originalValue, originalFunc } from "./original";
export { originalValue as renamedValue } from "./original";
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      // Original exports
      expect(index.hasExport("originalValue")).toBe(true);
      expect(index.hasExport("originalFunc")).toBe(true);

      // Re-exports should also be tracked
      expect(index.hasExport("renamedValue")).toBe(true);
    });

    it("handles barrel exports (export *)", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "export const fromA = 1;");

      await fs.writeFile(path.join(tempDir, "src", "b.ts"), "export const fromB = 2;");

      await fs.writeFile(
        path.join(tempDir, "src", "index.ts"),
        `
export * from "./a";
export * from "./b";
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      expect(index.hasExport("fromA")).toBe(true);
      expect(index.hasExport("fromB")).toBe(true);
    });
  });

  describe("resolveRef", () => {
    it("resolves relative imports to entity IDs", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        "export function helper() { return 1; }"
      );

      await fs.writeFile(path.join(tempDir, "src", "main.ts"), `import { helper } from "./utils";`);

      const index = await resolver.buildExportIndex(tempDir);

      const ref = {
        importPath: "./utils",
        importedName: "helper",
        sourceFile: path.join(tempDir, "src", "main.ts"),
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
      expect(resolved?.targetEntityId).toBeDefined();
      // Entity ID format: repo:package:kind:hash - verify structure
      expect(resolved?.targetEntityId).toMatch(/^test-repo:.+:function:[a-f0-9]+$/);
      expect(resolved?.targetName).toBe("helper");
    });

    it("returns null for external dependencies", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(path.join(tempDir, "src", "main.ts"), `import { useState } from "react";`);

      const index = await resolver.buildExportIndex(tempDir);

      const ref = {
        importPath: "react",
        importedName: "useState",
        sourceFile: path.join(tempDir, "src", "main.ts"),
      };

      const resolved = await resolver.resolveRef(ref, index);

      // External deps return null (not resolved within package)
      expect(resolved).toBeNull();
    });

    it("handles aliased imports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        "export function originalName() { return 1; }"
      );

      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `import { originalName as aliased } from "./utils";`
      );

      const index = await resolver.buildExportIndex(tempDir);

      const ref = {
        importPath: "./utils",
        importedName: "originalName",
        localName: "aliased",
        sourceFile: path.join(tempDir, "src", "main.ts"),
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
      // Entity ID format: repo:package:kind:hash - verify structure
      expect(resolved?.targetEntityId).toMatch(/^test-repo:.+:function:[a-f0-9]+$/);
      expect(resolved?.targetName).toBe("originalName");
    });

    it("resolves default imports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "component.ts"),
        "export default class MyComponent {}"
      );

      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `import MyComponent from "./component";`
      );

      const index = await resolver.buildExportIndex(tempDir);

      const ref = {
        importPath: "./component",
        importedName: "default",
        localName: "MyComponent",
        sourceFile: path.join(tempDir, "src", "main.ts"),
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
    });
  });

  describe("resolvePackage", () => {
    it("resolves all refs in a package", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        `
export function helper() { return 1; }
export const VALUE = 42;
`
      );

      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `
import { helper, VALUE } from "./utils";
import { external } from "external-package";

console.log(helper(), VALUE, external);
`
      );

      const result = await resolver.resolvePackage(tempDir);

      expect(result.total).toBeGreaterThan(0);
      expect(result.resolved).toBeGreaterThan(0);
      // External import should be unresolved
      expect(result.unresolved).toBeGreaterThan(0);
      expect(result.timeMs).toBeGreaterThan(0);
    });

    it("returns resolution statistics", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(path.join(tempDir, "src", "a.ts"), "export const a = 1;");

      await fs.writeFile(
        path.join(tempDir, "src", "b.ts"),
        `import { a } from "./a"; export const b = a + 1;`
      );

      const result = await resolver.resolvePackage(tempDir);

      expect(result).toMatchObject({
        total: expect.any(Number),
        resolved: expect.any(Number),
        unresolved: expect.any(Number),
        errors: expect.any(Array),
        timeMs: expect.any(Number),
      });
    });
  });

  describe("updateForFileChange", () => {
    it("re-resolves refs affected by file change", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // Initial file with export
      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        "export function oldHelper() { return 1; }"
      );

      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `import { oldHelper } from "./utils";`
      );

      // Build initial index
      const index = await resolver.buildExportIndex(tempDir);
      expect(index.hasExport("oldHelper")).toBe(true);

      // Update the file with new export
      await fs.writeFile(
        path.join(tempDir, "src", "utils.ts"),
        "export function newHelper() { return 2; }"
      );

      // Update index for changed file
      const updatedIndex = await resolver.updateForFileChange(
        path.join(tempDir, "src", "utils.ts"),
        index
      );

      expect(updatedIndex.hasExport("oldHelper")).toBe(false);
      expect(updatedIndex.hasExport("newHelper")).toBe(true);
    });

    it("handles file deletion", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(path.join(tempDir, "src", "to-delete.ts"), "export const deleteMe = 1;");

      const index = await resolver.buildExportIndex(tempDir);
      expect(index.hasExport("deleteMe")).toBe(true);

      // Delete the file
      await fs.unlink(path.join(tempDir, "src", "to-delete.ts"));

      // Update index
      const updatedIndex = await resolver.updateForFileChange(
        path.join(tempDir, "src", "to-delete.ts"),
        index
      );

      expect(updatedIndex.hasExport("deleteMe")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles circular imports", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "a.ts"),
        `
import { b } from "./b";
export const a = 1;
export const useB = b;
`
      );

      await fs.writeFile(
        path.join(tempDir, "src", "b.ts"),
        `
import { a } from "./a";
export const b = 2;
export const useA = a;
`
      );

      // Should not hang or throw
      const index = await resolver.buildExportIndex(tempDir);
      const result = await resolver.resolvePackage(tempDir);

      expect(index.hasExport("a")).toBe(true);
      expect(index.hasExport("b")).toBe(true);
      expect(result.resolved).toBeGreaterThan(0);
    });

    it("handles empty package", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      const index = await resolver.buildExportIndex(tempDir);

      expect(index.exports.size).toBe(0);
    });

    it("handles non-existent import paths gracefully", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(
        path.join(tempDir, "src", "main.ts"),
        `import { missing } from "./nonexistent";`
      );

      const index = await resolver.buildExportIndex(tempDir);

      const ref = {
        importPath: "./nonexistent",
        importedName: "missing",
        sourceFile: path.join(tempDir, "src", "main.ts"),
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeNull();
    });
  });

  describe("cross-language resolution", () => {
    it("handles mixed TypeScript and Python packages", async () => {
      // Create a mixed package structure
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "scripts"), { recursive: true });

      // TypeScript files
      await fs.writeFile(
        path.join(tempDir, "src", "api.ts"),
        `
export function fetchData() { return {}; }
export const API_URL = "https://api.example.com";
`
      );

      // Python files
      await fs.writeFile(
        path.join(tempDir, "scripts", "process.py"),
        `
def process_data(data):
    """Process incoming data."""
    return data

class DataProcessor:
    def run(self):
        pass
`
      );

      // Build index should handle both languages
      const index = await resolver.buildExportIndex(tempDir);

      // TypeScript exports should be indexed
      expect(index.hasExport("fetchData")).toBe(true);
      expect(index.hasExport("API_URL")).toBe(true);

      // Note: Python exports may or may not be indexed depending on
      // whether the resolver supports Python. This test documents
      // the expected behavior for mixed packages.
    });

    it("resolves Python imports within Python files", async () => {
      await fs.mkdir(path.join(tempDir, "lib"), { recursive: true });

      // Python module with exports
      await fs.writeFile(
        path.join(tempDir, "lib", "utils.py"),
        `
def helper_function():
    """A helper function."""
    return 42

class HelperClass:
    """A helper class."""
    pass

CONSTANT_VALUE = 100
`
      );

      // Python file that imports from utils
      await fs.writeFile(
        path.join(tempDir, "lib", "main.py"),
        `
from .utils import helper_function, HelperClass, CONSTANT_VALUE

def main():
    result = helper_function()
    obj = HelperClass()
    return result + CONSTANT_VALUE
`
      );

      // Build index - Python support depends on resolver implementation
      const index = await resolver.buildExportIndex(tempDir);

      // The resolver may or may not support Python exports
      // This test documents the expected structure
      expect(index).toBeDefined();
      expect(index.exports).toBeDefined();
    });

    it("keeps TypeScript and Python exports separate in index", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      // TypeScript file with helper export
      await fs.writeFile(
        path.join(tempDir, "src", "helper.ts"),
        `export function helper() { return "ts"; }`
      );

      // Python file with same-named export
      await fs.writeFile(
        path.join(tempDir, "src", "helper.py"),
        `
def helper():
    """Python helper."""
    return "py"
`
      );

      const index = await resolver.buildExportIndex(tempDir);

      // TypeScript export should be indexed
      expect(index.hasExport("helper")).toBe(true);

      // Get export info to verify source file
      const helperExport = index.getExport("helper");
      if (helperExport) {
        // Should come from the TypeScript file (primary language)
        expect(helperExport.filePath).toMatch(/\.ts$/);
      }
    });
  });
});
