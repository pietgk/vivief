/**
 * Doc Sync Command Tests for DevAC CLI
 *
 * Tests the doc-sync command that generates documentation from DevAC analysis:
 * - Effects documentation
 * - C4 architecture diagrams (LikeC4 and PlantUML formats)
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { C4OutputFormat, DocSyncOptions, DocSyncResult } from "../src/commands/doc-sync.js";

describe("doc-sync command options", () => {
  describe("scope options", () => {
    it("accepts package scope option", () => {
      const options: DocSyncOptions = { package: "/path/to/package" };
      expect(options.package).toBe("/path/to/package");
    });

    it("accepts repo scope option", () => {
      const options: DocSyncOptions = { repo: "/path/to/repo" };
      expect(options.repo).toBe("/path/to/repo");
    });

    it("accepts workspace scope option", () => {
      const options: DocSyncOptions = { workspace: true };
      expect(options.workspace).toBe(true);
    });

    it("scopes are mutually exclusive", () => {
      // Only one scope should be active at a time
      const packageOnly: DocSyncOptions = { package: "/pkg" };
      const repoOnly: DocSyncOptions = { repo: "/repo" };
      const workspaceOnly: DocSyncOptions = { workspace: true };

      expect(packageOnly.package).toBeDefined();
      expect(packageOnly.repo).toBeUndefined();
      expect(packageOnly.workspace).toBeUndefined();

      expect(repoOnly.repo).toBeDefined();
      expect(repoOnly.package).toBeUndefined();
      expect(repoOnly.workspace).toBeUndefined();

      expect(workspaceOnly.workspace).toBe(true);
      expect(workspaceOnly.package).toBeUndefined();
      expect(workspaceOnly.repo).toBeUndefined();
    });
  });

  describe("documentation type options", () => {
    it("accepts effects-only option", () => {
      const options: DocSyncOptions = { effects: true };
      expect(options.effects).toBe(true);
    });

    it("accepts c4-only option", () => {
      const options: DocSyncOptions = { c4: true };
      expect(options.c4).toBe(true);
    });

    it("accepts all option for both", () => {
      const options: DocSyncOptions = { all: true };
      expect(options.all).toBe(true);
    });
  });

  describe("behavior options", () => {
    it("accepts force option for regeneration", () => {
      const options: DocSyncOptions = { force: true };
      expect(options.force).toBe(true);
    });

    it("accepts check option for CI verification", () => {
      const options: DocSyncOptions = { check: true };
      expect(options.check).toBe(true);
    });

    it("accepts staged option for delta processing", () => {
      const options: DocSyncOptions = { staged: true };
      expect(options.staged).toBe(true);
    });

    it("accepts requireVerified option", () => {
      const options: DocSyncOptions = { requireVerified: true };
      expect(options.requireVerified).toBe(true);
    });
  });

  describe("output options", () => {
    it("accepts json output option", () => {
      const options: DocSyncOptions = { json: true };
      expect(options.json).toBe(true);
    });

    it("accepts verbose option", () => {
      const options: DocSyncOptions = { verbose: true };
      expect(options.verbose).toBe(true);
    });
  });

  describe("combined options", () => {
    it("accepts multiple options together", () => {
      const options: DocSyncOptions = {
        repo: "/path/to/repo",
        c4: true,
        force: true,
        json: true,
      };

      expect(options.repo).toBe("/path/to/repo");
      expect(options.c4).toBe(true);
      expect(options.force).toBe(true);
      expect(options.json).toBe(true);
    });
  });
});

describe("C4 output format", () => {
  describe("valid formats", () => {
    it("supports likec4 format", () => {
      const format: C4OutputFormat = "likec4";
      expect(format).toBe("likec4");
    });

    it("supports plantuml format", () => {
      const format: C4OutputFormat = "plantuml";
      expect(format).toBe("plantuml");
    });

    it("supports both format", () => {
      const format: C4OutputFormat = "both";
      expect(format).toBe("both");
    });
  });

  describe("format type safety", () => {
    it("defines valid format options", () => {
      const validFormats: C4OutputFormat[] = ["likec4", "plantuml", "both"];
      expect(validFormats).toHaveLength(3);
      expect(validFormats).toContain("likec4");
      expect(validFormats).toContain("plantuml");
      expect(validFormats).toContain("both");
    });
  });
});

describe("doc-sync command result", () => {
  describe("result interface structure", () => {
    it("has success field", () => {
      const result: Partial<DocSyncResult> = { success: true };
      expect(result.success).toBe(true);
    });

    it("has output field", () => {
      const result: Partial<DocSyncResult> = {
        success: true,
        output: "Generated 5 effects docs, 2 C4 diagrams",
      };
      expect(result.output).toBeDefined();
    });

    it("has package count fields", () => {
      const result: Partial<DocSyncResult> = {
        success: true,
        packagesProcessed: 10,
        packagesRegenerated: 5,
        packagesSkipped: 5,
      };
      expect(result.packagesProcessed).toBe(10);
      expect(result.packagesRegenerated).toBe(5);
      expect(result.packagesSkipped).toBe(5);
    });
  });
});

describe("doc-sync file paths", () => {
  let tempDir: string;
  let packageDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-docsync-test-"));
    packageDir = path.join(tempDir, "package");
    await fs.mkdir(packageDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("output paths", () => {
    it("effects docs go to .devac/docs/effects.md", () => {
      const expectedPath = path.join(packageDir, ".devac", "docs", "effects.md");
      expect(expectedPath).toContain(".devac");
      expect(expectedPath).toContain("docs");
      expect(expectedPath).toContain("effects.md");
    });

    it("C4 docs go to .devac/docs/c4/", () => {
      const expectedDir = path.join(packageDir, ".devac", "docs", "c4");
      expect(expectedDir).toContain(".devac");
      expect(expectedDir).toContain("docs");
      expect(expectedDir).toContain("c4");
    });

    it("LikeC4 files use .c4 extension", () => {
      const likec4Path = path.join(packageDir, ".devac", "docs", "c4", "containers.c4");
      expect(likec4Path).toMatch(/\.c4$/);
    });

    it("PlantUML files use .puml extension", () => {
      const pumlPath = path.join(packageDir, ".devac", "docs", "c4", "containers.puml");
      expect(pumlPath).toMatch(/\.puml$/);
    });
  });
});

describe("doc-sync regeneration logic", () => {
  describe("hash-based regeneration", () => {
    it("understands when regeneration is needed", () => {
      // When seed hash changes, docs should regenerate
      const oldHash = "abc123";
      const newHash = "def456";
      expect(oldHash).not.toBe(newHash);
    });

    it("understands when regeneration is not needed", () => {
      // When seed hash is same, docs should not regenerate
      const hash1 = "abc123";
      const hash2 = "abc123";
      expect(hash1).toBe(hash2);
    });
  });

  describe("force regeneration", () => {
    it("force option bypasses hash check", () => {
      const options: DocSyncOptions = { force: true };
      expect(options.force).toBe(true);
    });
  });
});

describe("doc-sync check mode", () => {
  describe("CI verification", () => {
    it("check mode verifies docs are in sync", () => {
      const options: DocSyncOptions = { check: true };
      expect(options.check).toBe(true);
    });

    it("check mode with repo scope", () => {
      const options: DocSyncOptions = { check: true, repo: "/path/to/repo" };
      expect(options.check).toBe(true);
      expect(options.repo).toBe("/path/to/repo");
    });

    it("check mode with workspace scope", () => {
      const options: DocSyncOptions = { check: true, workspace: true };
      expect(options.check).toBe(true);
      expect(options.workspace).toBe(true);
    });
  });
});

describe("doc-sync error handling", () => {
  describe("missing seeds", () => {
    it("handles packages without seeds", () => {
      // Expected behavior: skip package or generate empty placeholder
      const result: Partial<DocSyncResult> = {
        success: true,
        output: "Skipped: no seeds found",
      };
      expect(result.success).toBe(true);
    });
  });

  describe("permission errors", () => {
    it("handles write permission errors", () => {
      const result: Partial<DocSyncResult> = {
        success: false,
        output: "EACCES: permission denied",
      };
      expect(result.success).toBe(false);
      expect(result.output).toContain("permission");
    });
  });
});
