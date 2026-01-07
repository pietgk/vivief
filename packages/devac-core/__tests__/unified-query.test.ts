/**
 * Unified Query Tests
 *
 * Tests for the unified query system that provides a single entry point
 * for all DevAC queries regardless of level (package/repo/workspace).
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuckDBPool, executeWithRecovery } from "../src/storage/duckdb-pool.js";
import { getCopyToParquet, initializeSchemas } from "../src/storage/parquet-schemas.js";
import { query } from "../src/storage/unified-query.js";

/**
 * Helper to write seed data directly using DuckDB
 * This bypasses SeedWriter for simpler test setup
 */
async function writeSeedData(
  pool: DuckDBPool,
  pkgPath: string,
  data: {
    nodes?: Array<{
      entity_id: string;
      name: string;
      kind: string;
      file_path: string;
    }>;
    edges?: Array<{
      source_entity_id: string;
      target_entity_id: string;
      edge_type: string;
    }>;
    externalRefs?: Array<{
      source_entity_id: string;
      module_specifier: string;
      imported_symbol: string;
    }>;
  }
) {
  const seedPath = path.join(pkgPath, ".devac", "seed", "base");
  await fs.mkdir(seedPath, { recursive: true });

  await executeWithRecovery(pool, async (conn) => {
    await initializeSchemas(conn);

    // Insert nodes
    if (data.nodes && data.nodes.length > 0) {
      for (const node of data.nodes) {
        await conn.run(
          `INSERT INTO nodes (
            entity_id, name, qualified_name, kind, file_path,
            start_line, end_line, start_column, end_column,
            is_exported, is_default_export, visibility,
            is_async, is_generator, is_static, is_abstract,
            type_signature, documentation, decorators, type_parameters,
            properties, source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          node.entity_id,
          node.name,
          node.name, // qualified_name
          node.kind,
          node.file_path,
          1, // start_line
          5, // end_line
          0, // start_column
          1, // end_column
          false, // is_exported
          false, // is_default_export
          "public", // visibility
          false, // is_async
          false, // is_generator
          false, // is_static
          false, // is_abstract
          null, // type_signature
          null, // documentation
          "[]", // decorators
          "[]", // type_parameters
          "{}", // properties
          "abc123", // source_file_hash
          "base", // branch
          false, // is_deleted
          new Date().toISOString() // updated_at
        );
      }
      await conn.run(getCopyToParquet("nodes", path.join(seedPath, "nodes.parquet")));
    }

    // Insert edges
    if (data.edges && data.edges.length > 0) {
      for (const edge of data.edges) {
        await conn.run(
          `INSERT INTO edges (
            source_entity_id, target_entity_id, edge_type,
            source_file_path, source_line, source_column,
            properties, source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          edge.source_entity_id,
          edge.target_entity_id,
          edge.edge_type,
          "index.ts", // source_file_path
          1, // source_line
          0, // source_column
          "{}", // properties
          "abc123", // source_file_hash
          "base", // branch
          false, // is_deleted
          new Date().toISOString() // updated_at
        );
      }
      await conn.run(getCopyToParquet("edges", path.join(seedPath, "edges.parquet")));
    }

    // Insert external refs
    if (data.externalRefs && data.externalRefs.length > 0) {
      for (const ref of data.externalRefs) {
        await conn.run(
          `INSERT INTO external_refs (
            source_entity_id, module_specifier, imported_symbol,
            local_alias, import_style, is_type_only,
            source_file_path, source_line, source_column,
            target_entity_id, is_resolved, is_reexport, export_alias,
            source_file_hash, branch, is_deleted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ref.source_entity_id,
          ref.module_specifier,
          ref.imported_symbol,
          null, // local_alias
          "named", // import_style
          false, // is_type_only
          "index.ts", // source_file_path
          1, // source_line
          0, // source_column
          null, // target_entity_id
          false, // is_resolved
          false, // is_reexport
          null, // export_alias
          "abc123", // source_file_hash
          "base", // branch
          false, // is_deleted
          new Date().toISOString() // updated_at
        );
      }
      await conn.run(
        getCopyToParquet("external_refs", path.join(seedPath, "external_refs.parquet"))
      );
    }

    // Drop tables to avoid conflict with views when query() runs
    await conn.run("DROP TABLE IF EXISTS nodes");
    await conn.run("DROP TABLE IF EXISTS edges");
    await conn.run("DROP TABLE IF EXISTS external_refs");
    await conn.run("DROP TABLE IF EXISTS effects");
  });
}

describe("Unified Query", () => {
  let pool: DuckDBPool;
  let tempDir: string;

  beforeEach(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-unified-query-test-"));
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("query()", () => {
    it("should return empty result for empty packages array", async () => {
      const result = await query(pool, {
        packages: [],
        sql: "SELECT * FROM nodes",
      });

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.packagesQueried).toEqual([]);
      expect(result.warnings).toContain("No packages provided to query");
    });

    it("should query a single package", async () => {
      // Create a package with seeds
      const pkgPath = path.join(tempDir, "single-pkg");
      await writeSeedData(pool, pkgPath, {
        nodes: [
          {
            entity_id: "test:single-pkg:function:abc123",
            name: "testFunc",
            kind: "function",
            file_path: "src/index.ts",
          },
        ],
      });

      const result = await query(pool, {
        packages: [pkgPath],
        sql: "SELECT * FROM nodes WHERE kind = 'function'",
      });

      expect(result.rows.length).toBe(1);
      expect(result.packagesQueried).toEqual([pkgPath]);
      expect(result.viewsCreated).toContain("nodes");
    });

    it("should query multiple packages and aggregate results", async () => {
      // Create two packages with seeds
      const pkg1Path = path.join(tempDir, "pkg1");
      const pkg2Path = path.join(tempDir, "pkg2");

      await writeSeedData(pool, pkg1Path, {
        nodes: [
          {
            entity_id: "test:pkg1:function:abc123",
            name: "func1",
            kind: "function",
            file_path: "src/index.ts",
          },
        ],
      });

      await writeSeedData(pool, pkg2Path, {
        nodes: [
          {
            entity_id: "test:pkg2:function:def456",
            name: "func2",
            kind: "function",
            file_path: "src/lib.ts",
          },
        ],
      });

      const result = await query(pool, {
        packages: [pkg1Path, pkg2Path],
        sql: "SELECT * FROM nodes ORDER BY name",
      });

      expect(result.rows.length).toBe(2);
      expect(result.packagesQueried).toContain(pkg1Path);
      expect(result.packagesQueried).toContain(pkg2Path);
    });

    it("should skip repo roots with seeds and emit warning", async () => {
      // Create a "repo root" (has .git) with seeds
      const repoPath = path.join(tempDir, "fake-repo");
      await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });

      await writeSeedData(pool, repoPath, {
        nodes: [
          {
            entity_id: "test:fake-repo:function:xyz",
            name: "badFunc",
            kind: "function",
            file_path: "index.ts",
          },
        ],
      });

      const result = await query(pool, {
        packages: [repoPath],
        sql: "SELECT * FROM nodes",
      });

      expect(result.rows).toEqual([]);
      expect(result.packagesQueried).toEqual([]);
      expect(result.warnings.some((w) => w.includes("seeds at repo root"))).toBe(true);
    });

    it("should filter out repo roots but keep valid packages", async () => {
      // Create repo root with seeds (should be skipped)
      const repoPath = path.join(tempDir, "mixed-repo");
      await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });

      await writeSeedData(pool, repoPath, {
        nodes: [
          {
            entity_id: "test:mixed-repo:function:bad",
            name: "badFunc",
            kind: "function",
            file_path: "index.ts",
          },
        ],
      });

      // Create valid package inside (should be queried)
      const validPkgPath = path.join(repoPath, "packages", "valid");
      await writeSeedData(pool, validPkgPath, {
        nodes: [
          {
            entity_id: "test:valid:function:good",
            name: "goodFunc",
            kind: "function",
            file_path: "src/index.ts",
          },
        ],
      });

      const result = await query(pool, {
        packages: [repoPath, validPkgPath],
        sql: "SELECT * FROM nodes",
      });

      // Should only have the valid package's node
      expect(result.rows.length).toBe(1);
      expect(result.packagesQueried).toEqual([validPkgPath]);
      expect(result.warnings.some((w) => w.includes("seeds at repo root"))).toBe(true);
    });

    it("should return timing information", async () => {
      const pkgPath = path.join(tempDir, "timing-test");
      await writeSeedData(pool, pkgPath, {
        nodes: [
          {
            entity_id: "test:timing:function:abc",
            name: "func",
            kind: "function",
            file_path: "index.ts",
          },
        ],
      });

      const result = await query(pool, {
        packages: [pkgPath],
        sql: "SELECT * FROM nodes",
      });

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.timeMs).toBe("number");
    });

    it("should create views for edges and external_refs", async () => {
      const pkgPath = path.join(tempDir, "all-tables");

      await writeSeedData(pool, pkgPath, {
        nodes: [
          {
            entity_id: "test:all-tables:function:abc",
            name: "func",
            kind: "function",
            file_path: "index.ts",
          },
        ],
        edges: [
          {
            source_entity_id: "test:all-tables:function:abc",
            target_entity_id: "test:all-tables:function:def",
            edge_type: "CALLS",
          },
        ],
        externalRefs: [
          {
            source_entity_id: "test:all-tables:function:abc",
            module_specifier: "lodash",
            imported_symbol: "map",
          },
        ],
      });

      const result = await query(pool, {
        packages: [pkgPath],
        sql: "SELECT * FROM nodes",
      });

      // Should have created views for all available tables
      expect(result.viewsCreated).toContain("nodes");
      expect(result.viewsCreated).toContain("edges");
      expect(result.viewsCreated).toContain("external_refs");
    });
  });
});
