/**
 * Multi-Package Integration Tests
 *
 * Tests cross-package dependency scenarios and affected analysis
 * using real fixtures with dependencies.
 */

import * as path from "node:path";
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Helper to get package path with runtime assertion (satisfies biome) */
function getPkgPath(packages: Record<string, string>, name: string): string {
  const pkgPath = packages[name];
  if (!pkgPath) throw new Error(`Package ${name} not found in workspace`);
  return pkgPath;
}

describe("Multi-Package Integration", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("Workspace with Dependencies", () => {
    test("creates workspace with dependent packages", async () => {
      // pkg-multi-depend depends on pkg-clean
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-multi-depend"],
      });

      expect(getPkgPath(workspace.packages, "pkg-clean")).toBeTruthy();
      expect(getPkgPath(workspace.packages, "pkg-multi-depend")).toBeTruthy();

      // Verify both packages have their expected files
      const cleanPkgJson = path.join(getPkgPath(workspace.packages, "pkg-clean"), "package.json");
      const multiPkgJson = path.join(
        getPkgPath(workspace.packages, "pkg-multi-depend"),
        "package.json"
      );

      expect(await harness.fileExists(cleanPkgJson)).toBe(true);
      expect(await harness.fileExists(multiPkgJson)).toBe(true);
    });

    test("copies source files for both packages", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-multi-depend"],
      });

      // Check pkg-clean source
      const cleanSrc = path.join(getPkgPath(workspace.packages, "pkg-clean"), "src", "index.ts");
      expect(await harness.fileExists(cleanSrc)).toBe(true);

      // Check pkg-multi-depend source
      const multiSrc = path.join(
        getPkgPath(workspace.packages, "pkg-multi-depend"),
        "src",
        "index.ts"
      );
      expect(await harness.fileExists(multiSrc)).toBe(true);
    });
  });

  describe("All Fixture Types", () => {
    test("creates workspace with all fixture types", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: [
          "pkg-clean",
          "pkg-ts-errors",
          "pkg-lint-errors",
          "pkg-test-failures",
          "pkg-multi-depend",
        ],
      });

      expect(Object.keys(workspace.packages)).toHaveLength(5);

      for (const [_name, packagePath] of Object.entries(workspace.packages)) {
        expect(await harness.fileExists(packagePath)).toBe(true);
        expect(await harness.fileExists(path.join(packagePath, "package.json"))).toBe(true);
      }
    });
  });

  describe("Fixture Content Verification", () => {
    test("pkg-clean has no intentional errors", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
      });

      const indexContent = await harness.readFile(
        path.join(getPkgPath(workspace.packages, "pkg-clean"), "src", "index.ts")
      );

      // Should have valid TypeScript without @ts-expect-error comments
      expect(indexContent).not.toContain("@ts-expect-error");
      expect(indexContent).toContain("export function add");
      expect(indexContent).toContain("export function subtract");
    });

    test("pkg-ts-errors has intentional type errors", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-ts-errors"],
      });

      const typeErrorsContent = await harness.readFile(
        path.join(getPkgPath(workspace.packages, "pkg-ts-errors"), "src", "type-errors.ts")
      );

      // Should contain @ts-expect-error comments indicating intentional errors
      expect(typeErrorsContent).toContain("@ts-expect-error");
      expect(typeErrorsContent).toContain("INTENTIONAL TYPE ERRORS");
    });

    test("pkg-lint-errors has intentional lint violations", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-lint-errors"],
      });

      const lintErrorsContent = await harness.readFile(
        path.join(getPkgPath(workspace.packages, "pkg-lint-errors"), "src", "lint-errors.ts")
      );

      // Should contain biome-ignore comments indicating intentional errors
      expect(lintErrorsContent).toContain("biome-ignore");
      expect(lintErrorsContent).toContain("INTENTIONAL LINT ERRORS");
    });

    test("pkg-test-failures has intentionally failing tests", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-test-failures"],
      });

      const testContent = await harness.readFile(
        path.join(
          getPkgPath(workspace.packages, "pkg-test-failures"),
          "src",
          "__tests__",
          "buggy.test.ts"
        )
      );

      // Should contain comments indicating tests are meant to fail
      expect(testContent).toContain("INTENTIONALLY FAILING TESTS");
      expect(testContent).toContain("WILL FAIL");
    });

    test("pkg-multi-depend imports from pkg-clean", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-multi-depend"],
      });

      const multiIndexContent = await harness.readFile(
        path.join(getPkgPath(workspace.packages, "pkg-multi-depend"), "src", "index.ts")
      );

      // Should import from pkg-clean
      expect(multiIndexContent).toContain("@pietgk/fixture-pkg-clean");
      expect(multiIndexContent).toContain("import");
    });

    test("pkg-multi-depend package.json has dependency on pkg-clean", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-multi-depend"],
      });

      const pkgJsonContent = await harness.readFile(
        path.join(getPkgPath(workspace.packages, "pkg-multi-depend"), "package.json")
      );

      const pkgJson = JSON.parse(pkgJsonContent);
      expect(pkgJson.dependencies).toBeDefined();
      expect(pkgJson.dependencies["@pietgk/fixture-pkg-clean"]).toBeDefined();
    });
  });

  describe("Git Operations with Multiple Packages", () => {
    test("tracks changes across multiple packages", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-ts-errors"],
        initGit: true,
        createInitialCommit: true,
      });

      // Modify files in both packages
      const cleanNewFile = path.join(getPkgPath(workspace.packages, "pkg-clean"), "new-file.ts");
      const errorsNewFile = path.join(
        getPkgPath(workspace.packages, "pkg-ts-errors"),
        "new-file.ts"
      );

      await harness.writeFile(cleanNewFile, "export const a = 1;");
      await harness.writeFile(errorsNewFile, "export const b = 2;");

      const untracked = await workspace.git.getUntrackedFiles();

      expect(untracked.some((f) => f.includes("pkg-clean"))).toBe(true);
      expect(untracked.some((f) => f.includes("pkg-ts-errors"))).toBe(true);
    });

    test("stages files from specific package", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-ts-errors"],
        initGit: true,
        createInitialCommit: true,
      });

      // Add a new file only to pkg-clean
      const newFile = path.join(getPkgPath(workspace.packages, "pkg-clean"), "staged-file.ts");
      await harness.writeFile(newFile, "export const staged = true;");

      // Stage only the new file
      await workspace.git.stageFile(path.relative(workspace.rootDir, newFile));

      const staged = await workspace.git.getStagedFiles();
      expect(staged.some((f) => f.includes("staged-file.ts"))).toBe(true);
      expect(staged.every((f) => f.includes("pkg-clean"))).toBe(true);
    });
  });

  describe("Workspace Structure", () => {
    test("workspace root is parent of all packages", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-ts-errors", "pkg-multi-depend"],
      });

      for (const packagePath of Object.values(workspace.packages)) {
        expect(packagePath.startsWith(workspace.rootDir)).toBe(true);
      }
    });

    test("each package is in its own directory", async () => {
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean", "pkg-ts-errors"],
      });

      const cleanDir = getPkgPath(workspace.packages, "pkg-clean");
      const errorsDir = getPkgPath(workspace.packages, "pkg-ts-errors");

      // They should be siblings, not nested
      expect(cleanDir).not.toContain("pkg-ts-errors");
      expect(errorsDir).not.toContain("pkg-clean");
    });
  });
});
