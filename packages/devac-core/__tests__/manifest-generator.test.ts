/**
 * Manifest Generator Tests for DevAC v2.0
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on spec Phase 4: Federation.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ManifestGenerator,
  type RepositoryManifest,
  createManifestGenerator,
} from "../src/hub/manifest-generator.js";

describe("ManifestGenerator", () => {
  let tempDir: string;
  let generator: ManifestGenerator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-manifest-test-"));
    generator = createManifestGenerator();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a mock seed directory structure
   */
  async function createMockSeeds(
    packagePath: string,
    options: {
      nodeCount?: number;
      edgeCount?: number;
      refCount?: number;
      fileCount?: number;
      packageName?: string;
    } = {}
  ): Promise<void> {
    const {
      nodeCount = 10,
      edgeCount = 5,
      refCount = 3,
      fileCount = 2,
      packageName = "@test/package",
    } = options;

    const seedPath = path.join(packagePath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    // Create meta.json
    await fs.writeFile(
      path.join(packagePath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    // Create mock package.json
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify({ name: packageName, version: "1.0.0" })
    );

    // Create mock parquet files (as JSON for testing - actual impl will read parquet)
    // We'll create a stats.json file that the generator can read
    await fs.writeFile(
      path.join(seedPath, "stats.json"),
      JSON.stringify({
        nodeCount,
        edgeCount,
        refCount,
        fileCount,
      })
    );

    // Create placeholder parquet files
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "mock");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "mock");
  }

  describe("generate", () => {
    it("generates manifest.json at repo/.devac/manifest.json", async () => {
      // Create a repo with one package
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      const manifest = await generator.generate(tempDir);

      // Check manifest was created
      const manifestPath = path.join(tempDir, ".devac", "manifest.json");
      const exists = await fs
        .access(manifestPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Check manifest structure
      expect(manifest.version).toBe("2.0");
      expect(manifest.generated_at).toBeDefined();
      expect(manifest.packages).toBeDefined();
    });

    it("includes all packages found in .devac/seed/base/", async () => {
      // Create multiple packages
      const pkg1 = path.join(tempDir, "packages", "api");
      const pkg2 = path.join(tempDir, "packages", "shared");
      const pkg3 = path.join(tempDir, "packages", "utils");

      await createMockSeeds(pkg1, { packageName: "@test/api" });
      await createMockSeeds(pkg2, { packageName: "@test/shared" });
      await createMockSeeds(pkg3, { packageName: "@test/utils" });

      const manifest = await generator.generate(tempDir);

      expect(manifest.packages.length).toBe(3);
      const names = manifest.packages.map((p) => p.name);
      expect(names).toContain("@test/api");
      expect(names).toContain("@test/shared");
      expect(names).toContain("@test/utils");
    });

    it("extracts package name from package.json if present", async () => {
      const pkgPath = path.join(tempDir, "packages", "my-lib");
      await createMockSeeds(pkgPath, { packageName: "@org/my-library" });

      const manifest = await generator.generate(tempDir);

      const pkg = manifest.packages.find((p) => p.name === "@org/my-library");
      expect(pkg).toBeDefined();
    });

    it("uses directory name if package.json is missing", async () => {
      const pkgPath = path.join(tempDir, "packages", "unnamed-pkg");
      await createMockSeeds(pkgPath);
      // Remove package.json
      await fs.unlink(path.join(pkgPath, "package.json"));

      const manifest = await generator.generate(tempDir);

      const pkg = manifest.packages.find((p) => p.path === "packages/unnamed-pkg");
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe("unnamed-pkg");
    });

    it("calculates correct file_count, node_count, edge_count", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath, {
        nodeCount: 50,
        edgeCount: 30,
        refCount: 10,
        fileCount: 5,
      });

      const manifest = await generator.generate(tempDir);

      const pkg = manifest.packages[0];
      expect(pkg.node_count).toBe(50);
      expect(pkg.edge_count).toBe(30);
      expect(pkg.file_count).toBe(5);
    });

    it("detects external dependencies from externalRefs", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Add external refs info
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.writeFile(
        path.join(seedPath, "external_deps.json"),
        JSON.stringify([
          { package: "react", version: "^18.0.0" },
          { package: "@org/shared", repo_id: "github.com/org/shared", version: "^2.0.0" },
        ])
      );

      const manifest = await generator.generate(tempDir);

      expect(manifest.external_dependencies.length).toBeGreaterThan(0);
      const reactDep = manifest.external_dependencies.find((d) => d.package === "react");
      expect(reactDep).toBeDefined();
    });

    it("generates repo_id from git remote or path", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Create a .git/config with remote
      await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, ".git", "config"),
        `[remote "origin"]
  url = git@github.com:myorg/myrepo.git
  fetch = +refs/heads/*:refs/remotes/origin/*`
      );

      const manifest = await generator.generate(tempDir);

      expect(manifest.repo_id).toBe("github.com/myorg/myrepo");
    });

    it("uses local path as repo_id if no git remote", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      const manifest = await generator.generate(tempDir);

      // Should use directory name or a local identifier
      expect(manifest.repo_id).toBeDefined();
      expect(manifest.repo_id.length).toBeGreaterThan(0);
    });

    it("sets correct seed_path for each package", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      const manifest = await generator.generate(tempDir);

      const pkg = manifest.packages[0];
      expect(pkg.seed_path).toBe(".devac/seed/base/packages-api/");
    });

    it("sets last_analyzed timestamp", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      const manifest = await generator.generate(tempDir);

      const pkg = manifest.packages[0];
      expect(pkg.last_analyzed).toBeDefined();
      // Should be a valid ISO date
      expect(new Date(pkg.last_analyzed).toISOString()).toBe(pkg.last_analyzed);
    });
  });

  describe("update", () => {
    it("updates manifest for single changed package", async () => {
      // Create initial manifest with two packages
      const pkg1 = path.join(tempDir, "packages", "api");
      const pkg2 = path.join(tempDir, "packages", "shared");
      await createMockSeeds(pkg1, { nodeCount: 10 });
      await createMockSeeds(pkg2, { nodeCount: 20 });

      const initialManifest = await generator.generate(tempDir);
      const initialPkg1Nodes = initialManifest.packages.find(
        (p) => p.path === "packages/api"
      )?.node_count;

      // Update pkg1 seeds
      const seedPath = path.join(pkg1, ".devac", "seed", "base");
      await fs.writeFile(
        path.join(seedPath, "stats.json"),
        JSON.stringify({ nodeCount: 50, edgeCount: 5, refCount: 3, fileCount: 2 })
      );

      // Update only pkg1
      const updatedManifest = await generator.update(tempDir, ["packages/api"]);

      const updatedPkg1 = updatedManifest.packages.find((p) => p.path === "packages/api");
      expect(updatedPkg1?.node_count).toBe(50);
      expect(updatedPkg1?.node_count).not.toBe(initialPkg1Nodes);

      // pkg2 should remain unchanged
      const pkg2Info = updatedManifest.packages.find((p) => p.path === "packages/shared");
      expect(pkg2Info?.node_count).toBe(20);
    });

    it("preserves unchanged packages", async () => {
      const pkg1 = path.join(tempDir, "packages", "api");
      const pkg2 = path.join(tempDir, "packages", "shared");
      await createMockSeeds(pkg1, { packageName: "@test/api" });
      await createMockSeeds(pkg2, { packageName: "@test/shared" });

      await generator.generate(tempDir);

      // Update only pkg1, pkg2 should be preserved
      const updatedManifest = await generator.update(tempDir, ["packages/api"]);

      expect(updatedManifest.packages.length).toBe(2);
      expect(updatedManifest.packages.find((p) => p.name === "@test/shared")).toBeDefined();
    });

    it("adds new packages not in previous manifest", async () => {
      const pkg1 = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkg1, { packageName: "@test/api" });

      await generator.generate(tempDir);

      // Add a new package
      const pkg2 = path.join(tempDir, "packages", "new-pkg");
      await createMockSeeds(pkg2, { packageName: "@test/new-pkg" });

      const updatedManifest = await generator.update(tempDir, ["packages/new-pkg"]);

      expect(updatedManifest.packages.length).toBe(2);
      expect(updatedManifest.packages.find((p) => p.name === "@test/new-pkg")).toBeDefined();
    });

    it("removes packages that no longer have seeds", async () => {
      const pkg1 = path.join(tempDir, "packages", "api");
      const pkg2 = path.join(tempDir, "packages", "to-remove");
      await createMockSeeds(pkg1);
      await createMockSeeds(pkg2);

      await generator.generate(tempDir);

      // Remove pkg2's seed directory
      await fs.rm(path.join(pkg2, ".devac"), { recursive: true, force: true });

      // Force full regeneration by passing empty array or specific flag
      const updatedManifest = await generator.generate(tempDir);

      expect(updatedManifest.packages.length).toBe(1);
      expect(updatedManifest.packages.find((p) => p.path === "packages/to-remove")).toBeUndefined();
    });
  });

  describe("validate", () => {
    it("validates manifest schema", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      const manifest = await generator.generate(tempDir);
      const result = generator.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports missing required fields", () => {
      const invalidManifest = {
        version: "2.0",
        // Missing repo_id, generated_at, packages
      } as unknown as RepositoryManifest;

      const result = generator.validate(invalidManifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("repo_id"))).toBe(true);
    });

    it("reports invalid version", () => {
      const invalidManifest: RepositoryManifest = {
        version: "1.0" as "2.0", // Wrong version
        repo_id: "test",
        generated_at: new Date().toISOString(),
        packages: [],
        external_dependencies: [],
      };

      const result = generator.validate(invalidManifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("version"))).toBe(true);
    });

    it("reports invalid package entries", () => {
      const invalidManifest: RepositoryManifest = {
        version: "2.0",
        repo_id: "test",
        generated_at: new Date().toISOString(),
        packages: [
          {
            path: "packages/api",
            name: "@test/api",
            seed_path: ".devac/seed/base/packages-api/",
            last_analyzed: "invalid-date", // Invalid date
            file_count: -1, // Invalid count
            node_count: 10,
            edge_count: 5,
          },
        ],
        external_dependencies: [],
      };

      const result = generator.validate(invalidManifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("validates external dependency entries", () => {
      const invalidManifest: RepositoryManifest = {
        version: "2.0",
        repo_id: "test",
        generated_at: new Date().toISOString(),
        packages: [],
        external_dependencies: [
          {
            package: "", // Empty package name
          },
        ],
      };

      const result = generator.validate(invalidManifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("package"))).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles repos with no packages gracefully", async () => {
      // Empty repo with no seed directories
      const manifest = await generator.generate(tempDir);

      expect(manifest.packages).toHaveLength(0);
      expect(manifest.external_dependencies).toHaveLength(0);
      expect(manifest.version).toBe("2.0");
    });

    it("handles deeply nested package structures", async () => {
      const deepPkg = path.join(tempDir, "packages", "scope", "nested", "deep", "package");
      await createMockSeeds(deepPkg, { packageName: "@scope/deep-package" });

      const manifest = await generator.generate(tempDir);

      expect(manifest.packages.length).toBe(1);
      expect(manifest.packages[0].path).toBe("packages/scope/nested/deep/package");
    });

    it("handles packages at repo root", async () => {
      // Package seeds directly in repo root
      await createMockSeeds(tempDir, { packageName: "root-package" });

      const manifest = await generator.generate(tempDir);

      expect(manifest.packages.length).toBe(1);
      expect(manifest.packages[0].path).toBe(".");
    });

    it("ignores .devac directories in node_modules", async () => {
      // Create a legitimate package
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Create a node_modules package with seeds (should be ignored)
      const nmPkg = path.join(tempDir, "node_modules", "some-dep");
      await createMockSeeds(nmPkg, { packageName: "some-dep" });

      const manifest = await generator.generate(tempDir);

      expect(manifest.packages.length).toBe(1);
      expect(manifest.packages[0].path).toBe("packages/api");
    });

    it("handles corrupted seed files gracefully", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Corrupt the stats file
      const statsPath = path.join(pkgPath, ".devac", "seed", "base", "stats.json");
      await fs.writeFile(statsPath, "not valid json{{{");

      // Should not throw, but may report warnings
      const manifest = await generator.generate(tempDir);

      expect(manifest.packages.length).toBe(1);
      // Counts may be 0 or default values for corrupted data
      expect(manifest.packages[0].node_count).toBeDefined();
    });

    it("handles concurrent generate calls", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Call generate multiple times concurrently
      const results = await Promise.all([
        generator.generate(tempDir),
        generator.generate(tempDir),
        generator.generate(tempDir),
      ]);

      // All should succeed and return consistent results
      expect(results[0].packages.length).toBe(1);
      expect(results[1].packages.length).toBe(1);
      expect(results[2].packages.length).toBe(1);
    });
  });

  describe("manifest persistence", () => {
    it("reads existing manifest for update operations", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      // Generate initial manifest
      const initial = await generator.generate(tempDir);

      // Read it back
      const manifestPath = path.join(tempDir, ".devac", "manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content) as RepositoryManifest;

      expect(parsed.version).toBe(initial.version);
      expect(parsed.repo_id).toBe(initial.repo_id);
      expect(parsed.packages.length).toBe(initial.packages.length);
    });

    it("writes manifest atomically", async () => {
      const pkgPath = path.join(tempDir, "packages", "api");
      await createMockSeeds(pkgPath);

      await generator.generate(tempDir);

      const manifestPath = path.join(tempDir, ".devac", "manifest.json");

      // File should be valid JSON (not partially written)
      const content = await fs.readFile(manifestPath, "utf-8");
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });
});
