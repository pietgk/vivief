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
  computeSeedHash,
  docNeedsRegeneration,
  generateDocMetadata,
  generateDocMetadataForMarkdown,
  generateDocMetadataForPlantUML,
  generateEffectsDoc,
  generateEmptyEffectsDoc,
  getSeedPath,
  hasSeed,
  parseDocMetadata,
} from "../src/docs/index.js";
import type { EffectsDocData } from "../src/docs/index.js";

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
});
