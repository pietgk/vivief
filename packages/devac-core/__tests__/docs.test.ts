/**
 * Tests for the docs module
 *
 * Tests seed hashing, doc metadata, and documentation generation.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aggregatePackageEffects,
  computeSeedHash,
  docNeedsRegeneration,
  generateAllRepoC4Docs,
  generateDocMetadata,
  generateDocMetadataForMarkdown,
  generateDocMetadataForPlantUML,
  generateEffectsDoc,
  generateEmptyEffectsDoc,
  generateEmptyRepoEffectsDoc,
  generateEmptyWorkspaceEffectsDoc,
  generateRepoEffectsDoc,
  generateWorkspaceC4ContainersDoc,
  generateWorkspaceC4ContextDoc,
  generateWorkspaceEffectsDoc,
  getSeedPath,
  hasSeed,
  parseDocMetadata,
} from "../src/docs/index.js";
import type {
  EffectsDocData,
  PackageEffectsInput,
  WorkspaceEffectsData,
} from "../src/docs/index.js";

describe("Docs Module", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(
      tmpdir(),
      `devac-docs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Seed Hasher", () => {
    it("should return null hash for non-existent seed directory", async () => {
      const result = await computeSeedHash(testDir);
      expect(result.hash).toBeNull();
      expect(result.files).toHaveLength(0);
      expect(result.hasEffects).toBe(false);
    });

    it("should detect seed path correctly", () => {
      const seedPath = getSeedPath(testDir);
      expect(seedPath).toContain(".devac/seed/base");
    });

    it("should return false for hasSeed when no seeds exist", async () => {
      const result = await hasSeed(testDir);
      expect(result).toBe(false);
    });

    it("should return true for hasSeed when seeds exist", async () => {
      // Create seed directory and nodes.parquet
      const seedDir = path.join(testDir, ".devac", "seed", "base");
      await mkdir(seedDir, { recursive: true });
      await writeFile(path.join(seedDir, "nodes.parquet"), "dummy content");

      const result = await hasSeed(testDir);
      expect(result).toBe(true);
    });

    it("should compute hash when seed files exist", async () => {
      // Create seed directory with files
      const seedDir = path.join(testDir, ".devac", "seed", "base");
      await mkdir(seedDir, { recursive: true });
      await writeFile(path.join(seedDir, "nodes.parquet"), "nodes content");
      await writeFile(path.join(seedDir, "edges.parquet"), "edges content");

      const result = await computeSeedHash(testDir);
      expect(result.hash).not.toBeNull();
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
    });

    it("should detect effects.parquet", async () => {
      // Create seed directory with effects
      const seedDir = path.join(testDir, ".devac", "seed", "base");
      await mkdir(seedDir, { recursive: true });
      await writeFile(path.join(seedDir, "nodes.parquet"), "nodes content");
      await writeFile(path.join(seedDir, "effects.parquet"), "effects content");

      const result = await computeSeedHash(testDir);
      expect(result.hasEffects).toBe(true);
    });
  });

  describe("Doc Metadata", () => {
    it("should generate valid metadata", () => {
      const metadata = generateDocMetadata({
        seedHash: "sha256:abc123",
        verified: true,
        verifiedAt: "2025-01-15T10:00:00Z",
        packagePath: "/path/to/package",
      });

      expect(metadata).toContain("devac:seed-hash: sha256:abc123");
      expect(metadata).toContain("devac:verified: true");
      expect(metadata).toContain("devac:verified-at: 2025-01-15T10:00:00Z");
      expect(metadata).toContain("devac:package-path: /path/to/package");
    });

    it("should generate markdown metadata with trailing newlines", () => {
      const metadata = generateDocMetadataForMarkdown({
        seedHash: "sha256:xyz789",
      });

      expect(metadata.endsWith("\n\n")).toBe(true);
    });

    it("should generate PlantUML metadata with single-quote comments", () => {
      const metadata = generateDocMetadataForPlantUML({
        seedHash: "sha256:def456",
      });

      expect(metadata).toContain("' devac:seed-hash:");
      expect(metadata).toContain("' devac:verified:");
    });

    it("should parse metadata from content", () => {
      const content = `<!--
  devac:seed-hash: sha256:test123
  devac:generated-at: 2025-01-15T10:00:00Z
  devac:generator: doc-sync@1.0.0
  devac:verified: true
  devac:verified-at: 2025-01-14T09:00:00Z
-->

# Document Content`;

      const metadata = parseDocMetadata(content);
      expect(metadata).not.toBeNull();
      expect(metadata?.seedHash).toBe("sha256:test123");
      expect(metadata?.verified).toBe(true);
      expect(metadata?.verifiedAt).toBe("2025-01-14T09:00:00Z");
    });

    it("should return null for content without metadata", () => {
      const content = `# No Metadata Here

Just regular content.`;

      const metadata = parseDocMetadata(content);
      expect(metadata).toBeNull();
    });

    it("should return null for incomplete metadata", () => {
      const content = `<!--
  devac:seed-hash: sha256:test123
-->

# Missing required fields`;

      const metadata = parseDocMetadata(content);
      expect(metadata).toBeNull();
    });
  });

  describe("Doc Regeneration Check", () => {
    it("should need regeneration for non-existent file", async () => {
      const result = await docNeedsRegeneration(
        path.join(testDir, "non-existent.md"),
        "sha256:abc123"
      );
      expect(result.needsRegeneration).toBe(true);
      expect(result.reason).toBe("Document does not exist");
    });

    it("should need regeneration for file without metadata", async () => {
      const filePath = path.join(testDir, "no-metadata.md");
      await writeFile(filePath, "# No Metadata\n\nContent without metadata.");

      const result = await docNeedsRegeneration(filePath, "sha256:abc123");
      expect(result.needsRegeneration).toBe(true);
      expect(result.reason).toBe("Document has no metadata");
    });

    it("should need regeneration when hash changes", async () => {
      const content = `<!--
  devac:seed-hash: sha256:old-hash
  devac:generated-at: 2025-01-15T10:00:00Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
-->

# Document`;

      const filePath = path.join(testDir, "with-metadata.md");
      await writeFile(filePath, content);

      const result = await docNeedsRegeneration(filePath, "sha256:new-hash");
      expect(result.needsRegeneration).toBe(true);
      expect(result.reason).toBe("Seed hash changed");
    });

    it("should not need regeneration when hash matches", async () => {
      const content = `<!--
  devac:seed-hash: sha256:same-hash
  devac:generated-at: 2025-01-15T10:00:00Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
-->

# Document`;

      const filePath = path.join(testDir, "matching.md");
      await writeFile(filePath, content);

      const result = await docNeedsRegeneration(filePath, "sha256:same-hash");
      expect(result.needsRegeneration).toBe(false);
    });
  });

  describe("Effects Generator", () => {
    it("should generate effects documentation", () => {
      const data: EffectsDocData = {
        packageName: "test-package",
        storePatterns: [
          { pattern: "db.insert", count: 5 },
          { pattern: "cache.set", count: 3 },
        ],
        retrievePatterns: [{ pattern: "db.query", count: 10 }],
        externalPatterns: [{ pattern: "axios.get", count: 8, module: "axios" }],
        otherPatterns: [{ pattern: "console.log", count: 20, isMethod: true, isAsync: false }],
      };

      const doc = generateEffectsDoc(data, {
        seedHash: "sha256:test",
        verified: false,
        packagePath: "/path/to/test-package",
      });

      // Check header
      expect(doc).toContain("# Package Effects: test-package");
      expect(doc).toContain("devac:seed-hash: sha256:test");

      // Check store patterns
      expect(doc).toContain("## Store Operations");
      expect(doc).toContain("`db.insert`");
      expect(doc).toContain("`cache.set`");

      // Check retrieve patterns
      expect(doc).toContain("## Retrieve Operations");
      expect(doc).toContain("`db.query`");

      // Check external patterns
      expect(doc).toContain("## External Calls");
      expect(doc).toContain("`axios.get`");

      // Check other patterns
      expect(doc).toContain("## Other Patterns");
      expect(doc).toContain("`console.log`");
    });

    it("should generate empty effects documentation", () => {
      const doc = generateEmptyEffectsDoc("empty-package", {
        seedHash: "sha256:empty",
        packagePath: "/path/to/empty",
      });

      expect(doc).toContain("# Package Effects: empty-package");
      expect(doc).toContain("devac:seed-hash: sha256:empty");
      expect(doc).toContain("No effects detected");
    });
  });

  describe("Repo Effects Generator", () => {
    it("should aggregate package effects into repo data", () => {
      const packageInputs: PackageEffectsInput[] = [
        {
          packageName: "pkg-a",
          packagePath: "/repo/packages/pkg-a",
          seedHash: "sha256:pkg-a",
          data: {
            packageName: "pkg-a",
            storePatterns: [{ pattern: "db.insert", count: 5 }],
            retrievePatterns: [{ pattern: "db.query", count: 10 }],
            externalPatterns: [{ pattern: "axios.get", count: 3, module: "axios" }],
            otherPatterns: [],
          },
        },
        {
          packageName: "pkg-b",
          packagePath: "/repo/packages/pkg-b",
          seedHash: "sha256:pkg-b",
          data: {
            packageName: "pkg-b",
            storePatterns: [{ pattern: "db.insert", count: 2 }],
            retrievePatterns: [],
            externalPatterns: [{ pattern: "axios.get", count: 5, module: "axios" }],
            otherPatterns: [],
          },
        },
      ];

      const result = aggregatePackageEffects(packageInputs);

      // Check aggregated totals
      expect(result.totalCounts.packages).toBe(2);
      expect(result.totalCounts.store).toBe(7); // 5 + 2
      expect(result.totalCounts.retrieve).toBe(10);
      expect(result.totalCounts.external).toBe(8); // 3 + 5

      // Check cross-package patterns (db.insert and axios.get appear in both)
      expect(result.aggregatedPatterns.crossPackagePatterns.length).toBeGreaterThan(0);
      const dbInsertCross = result.aggregatedPatterns.crossPackagePatterns.find(
        (p) => p.pattern === "db.insert"
      );
      expect(dbInsertCross).toBeDefined();
      expect(dbInsertCross?.totalCount).toBe(7);
      expect(dbInsertCross?.packages.length).toBe(2);
    });

    it("should generate repo effects documentation", () => {
      const packageInputs: PackageEffectsInput[] = [
        {
          packageName: "pkg-a",
          packagePath: "/repo/packages/pkg-a",
          seedHash: "sha256:pkg-a",
          data: {
            packageName: "pkg-a",
            storePatterns: [{ pattern: "db.insert", count: 5 }],
            retrievePatterns: [],
            externalPatterns: [],
            otherPatterns: [],
          },
        },
      ];

      const data = aggregatePackageEffects(packageInputs);
      const doc = generateRepoEffectsDoc(data, {
        seedHash: "sha256:repo-hash",
        repoPath: "/repo",
      });

      expect(doc).toContain("# Repository Effects:");
      expect(doc).toContain("devac:seed-hash: sha256:repo-hash");
      expect(doc).toContain("## Packages");
      expect(doc).toContain("pkg-a");
    });

    it("should generate empty repo effects documentation", () => {
      const doc = generateEmptyRepoEffectsDoc("my-repo", {
        seedHash: "sha256:empty-repo",
        repoPath: "/repo",
      });

      expect(doc).toContain("# Repository Effects: my-repo");
      expect(doc).toContain("devac:seed-hash: sha256:empty-repo");
      expect(doc).toContain("No effects detected");
    });
  });

  describe("Repo C4 Generator", () => {
    it("should generate repo-level C4 diagrams", () => {
      const packageInputs: PackageEffectsInput[] = [
        {
          packageName: "api-service",
          packagePath: "/repo/packages/api",
          seedHash: "sha256:api",
          data: {
            packageName: "api-service",
            storePatterns: [{ pattern: "db.insert", count: 5 }],
            retrievePatterns: [{ pattern: "db.query", count: 10 }],
            externalPatterns: [{ pattern: "stripe.charge", count: 2, module: "stripe" }],
            otherPatterns: [],
          },
        },
        {
          packageName: "web-app",
          packagePath: "/repo/packages/web",
          seedHash: "sha256:web",
          data: {
            packageName: "web-app",
            storePatterns: [],
            retrievePatterns: [],
            externalPatterns: [{ pattern: "axios.get", count: 8, module: "axios" }],
            otherPatterns: [],
          },
        },
      ];

      const data = aggregatePackageEffects(packageInputs);
      const result = generateAllRepoC4Docs(data, {
        seedHash: "sha256:c4-hash",
        repoPath: "/repo",
      });

      // Check context diagram
      expect(result.context).toContain("@startuml C4_Context");
      expect(result.context).toContain("devac:seed-hash: sha256:c4-hash");
      expect(result.context).toContain("System("); // Main system
      expect(result.context).toContain("System_Ext("); // External systems

      // Check containers diagram
      expect(result.containers).toContain("@startuml C4_Container");
      expect(result.containers).toContain("System_Boundary");
      expect(result.containers).toContain("Container");
      expect(result.containers).toContain("api-service");
      expect(result.containers).toContain("web-app");
    });
  });

  describe("Workspace Effects Generator", () => {
    it("should generate workspace effects documentation", () => {
      const data: WorkspaceEffectsData = {
        workspacePath: "/workspace",
        repos: [
          {
            repoId: "github.com/org/repo-a",
            repoPath: "/workspace/repo-a",
            packageCount: 3,
            effectCounts: { store: 10, retrieve: 15, external: 5, other: 2 },
            hasEffects: true,
          },
          {
            repoId: "github.com/org/repo-b",
            repoPath: "/workspace/repo-b",
            packageCount: 2,
            effectCounts: { store: 5, retrieve: 8, external: 12, other: 0 },
            hasEffects: true,
          },
        ],
        crossRepoPatterns: [
          {
            pattern: "axios.get",
            totalCount: 20,
            repos: [
              { repoId: "github.com/org/repo-a", count: 8 },
              { repoId: "github.com/org/repo-b", count: 12 },
            ],
          },
        ],
        totalCounts: {
          repos: 2,
          packages: 5,
          store: 15,
          retrieve: 23,
          external: 17,
          other: 2,
        },
      };

      const doc = generateWorkspaceEffectsDoc(data, {
        seedHash: "sha256:workspace-hash",
        workspacePath: "/workspace",
      });

      expect(doc).toContain("# Workspace Effects Overview");
      expect(doc).toContain("devac:seed-hash: sha256:workspace-hash");
      expect(doc).toContain("## Summary");
      expect(doc).toContain("**Repositories:** 2");
      expect(doc).toContain("**Total Packages:** 5");
      expect(doc).toContain("## Repositories");
      expect(doc).toContain("github.com/org/repo-a");
      expect(doc).toContain("## Cross-Repository Patterns");
      expect(doc).toContain("`axios.get`");
    });

    it("should generate empty workspace effects documentation", () => {
      const doc = generateEmptyWorkspaceEffectsDoc({
        seedHash: "sha256:empty-workspace",
        workspacePath: "/workspace",
      });

      expect(doc).toContain("# Workspace Effects Overview");
      expect(doc).toContain("devac:seed-hash: sha256:empty-workspace");
      expect(doc).toContain("No repositories registered");
    });

    it("should generate workspace C4 context diagram", () => {
      const data: WorkspaceEffectsData = {
        workspacePath: "/workspace",
        repos: [
          {
            repoId: "github.com/org/api",
            repoPath: "/workspace/api",
            packageCount: 2,
            effectCounts: { store: 10, retrieve: 15, external: 5, other: 0 },
            hasEffects: true,
          },
        ],
        crossRepoPatterns: [],
        totalCounts: {
          repos: 1,
          packages: 2,
          store: 10,
          retrieve: 15,
          external: 5,
          other: 0,
        },
      };

      const doc = generateWorkspaceC4ContextDoc(data, {
        seedHash: "sha256:ws-c4",
        workspacePath: "/workspace",
      });

      expect(doc).toContain("@startuml C4_Context");
      expect(doc).toContain("devac:seed-hash: sha256:ws-c4");
      expect(doc).toContain("title Workspace - System Context Diagram");
      expect(doc).toContain("System(");
    });

    it("should generate workspace C4 containers diagram", () => {
      const data: WorkspaceEffectsData = {
        workspacePath: "/workspace",
        repos: [
          {
            repoId: "github.com/org/api",
            repoPath: "/workspace/api",
            packageCount: 2,
            effectCounts: { store: 10, retrieve: 15, external: 5, other: 0 },
            hasEffects: true,
          },
        ],
        crossRepoPatterns: [],
        totalCounts: {
          repos: 1,
          packages: 2,
          store: 10,
          retrieve: 15,
          external: 5,
          other: 0,
        },
      };

      const doc = generateWorkspaceC4ContainersDoc(data, {
        seedHash: "sha256:ws-c4-containers",
        workspacePath: "/workspace",
      });

      expect(doc).toContain("@startuml C4_Container");
      expect(doc).toContain("devac:seed-hash: sha256:ws-c4-containers");
      expect(doc).toContain("title Workspace - Container Diagram");
      expect(doc).toContain("System_Boundary");
    });
  });
});
