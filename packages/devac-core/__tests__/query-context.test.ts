/**
 * Tests for Query Context Implementation
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  DuckDBPool,
  buildPackageMap,
  discoverPackagesInRepo,
  executeWithRecovery,
  preprocessSql,
  setupQueryContext,
} from "../src/index.js";

describe("Query Context", () => {
  let pool: DuckDBPool;
  let testDir: string;

  beforeAll(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
  });

  afterAll(async () => {
    await pool.shutdown();
  });

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), `.test-query-context-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("setupQueryContext", () => {
    test("creates views when seed files exist", async () => {
      // Create seed directory structure
      const seedPath = path.join(testDir, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      // Create minimal parquet files using DuckDB
      await executeWithRecovery(pool, async (conn) => {
        // Create nodes parquet - use native arrays (not JSON casts)
        await conn.run(`
          CREATE TABLE temp_nodes AS
          SELECT 'test:pkg:function:abc123' as entity_id,
                 'testFunc' as name,
                 'testFunc' as qualified_name,
                 'function' as kind,
                 'test.ts' as file_path,
                 1 as start_line,
                 10 as end_line,
                 0 as start_column,
                 50 as end_column,
                 false as is_exported,
                 false as is_default_export,
                 'public' as visibility,
                 false as is_async,
                 false as is_generator,
                 false as is_static,
                 false as is_abstract,
                 NULL as type_signature,
                 NULL as documentation,
                 []::VARCHAR[] as decorators,
                 []::VARCHAR[] as type_parameters,
                 '{}'::JSON as properties,
                 'hash123' as source_file_hash,
                 'base' as branch,
                 false as is_deleted,
                 current_timestamp as updated_at
        `);
        await conn.run(`COPY temp_nodes TO '${seedPath}/nodes.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_nodes");

        // Create edges parquet
        await conn.run(`
          CREATE TABLE temp_edges AS
          SELECT 'test:pkg:function:abc123' as source_entity_id,
                 'test:pkg:function:def456' as target_entity_id,
                 'CALLS' as edge_type,
                 'test.ts' as source_file_path,
                 5 as source_line,
                 10 as source_column,
                 '{}'::JSON as properties,
                 'hash123' as source_file_hash,
                 'base' as branch,
                 false as is_deleted,
                 current_timestamp as updated_at
        `);
        await conn.run(`COPY temp_edges TO '${seedPath}/edges.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_edges");

        // Create external_refs parquet
        await conn.run(`
          CREATE TABLE temp_refs AS
          SELECT 'test:pkg:function:abc123' as source_entity_id,
                 'test.ts' as source_file_path,
                 1 as source_line,
                 0 as source_column,
                 'lodash' as module_specifier,
                 'map' as imported_symbol,
                 NULL as local_alias,
                 'named' as import_style,
                 false as is_type_only,
                 NULL as target_entity_id,
                 false as is_resolved,
                 false as is_reexport,
                 NULL as export_alias,
                 'hash123' as source_file_hash,
                 'base' as branch,
                 false as is_deleted,
                 current_timestamp as updated_at
        `);
        await conn.run(`COPY temp_refs TO '${seedPath}/external_refs.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_refs");
      });

      // Set up query context
      const result = await setupQueryContext(pool, { packagePath: testDir });

      expect(result.success).toBe(true);
      expect(result.viewsCreated).toContain("nodes");
      expect(result.viewsCreated).toContain("edges");
      expect(result.viewsCreated).toContain("external_refs");
      expect(result.warnings).toHaveLength(0);

      // Verify views work
      const nodes = await executeWithRecovery(pool, async (conn) => {
        return await conn.all("SELECT * FROM nodes");
      });
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toHaveProperty("name", "testFunc");

      const edges = await executeWithRecovery(pool, async (conn) => {
        return await conn.all("SELECT * FROM edges");
      });
      expect(edges).toHaveLength(1);
      expect(edges[0]).toHaveProperty("edge_type", "CALLS");
    });

    test("reports warnings when seed files are missing", async () => {
      // Don't create any seed files
      const result = await setupQueryContext(pool, { packagePath: testDir });

      expect(result.success).toBe(true);
      expect(result.viewsCreated).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test("creates package-specific views when packages are provided", async () => {
      // Create seed files for two packages
      const pkg1Path = path.join(testDir, "packages", "pkg1");
      const pkg2Path = path.join(testDir, "packages", "pkg2");
      const pkg1SeedPath = path.join(pkg1Path, ".devac", "seed", "base");
      const pkg2SeedPath = path.join(pkg2Path, ".devac", "seed", "base");

      await fs.mkdir(pkg1SeedPath, { recursive: true });
      await fs.mkdir(pkg2SeedPath, { recursive: true });

      // Create minimal nodes parquet for each package
      await executeWithRecovery(pool, async (conn) => {
        await conn.run(`
          CREATE TABLE temp AS SELECT 'pkg1:fn:abc' as entity_id, 'func1' as name
        `);
        await conn.run(`COPY temp TO '${pkg1SeedPath}/nodes.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp");

        await conn.run(`
          CREATE TABLE temp AS SELECT 'pkg2:fn:def' as entity_id, 'func2' as name
        `);
        await conn.run(`COPY temp TO '${pkg2SeedPath}/nodes.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp");
      });

      const packages = new Map([
        ["pkg1", pkg1Path],
        ["pkg2", pkg2Path],
      ]);

      const result = await setupQueryContext(pool, {
        packagePath: pkg1Path,
        packages,
      });

      expect(result.success).toBe(true);
      expect(result.viewsCreated).toContain("nodes");
      expect(result.viewsCreated).toContain("nodes_pkg1");
      expect(result.viewsCreated).toContain("nodes_pkg2");
    });
  });

  describe("preprocessSql", () => {
    test("expands nodes@package to read_parquet", () => {
      const packages = new Map([
        ["core", "/path/to/core"],
        ["cli", "/path/to/cli"],
      ]);

      const { sql, errors } = preprocessSql(
        "SELECT * FROM nodes@core WHERE kind = 'function'",
        packages
      );

      expect(errors).toHaveLength(0);
      expect(sql).toContain("read_parquet(");
      expect(sql).toContain("/path/to/core/.devac/seed/base/nodes.parquet");
      expect(sql).not.toContain("nodes@core");
    });

    test("expands edges@package to read_parquet", () => {
      const packages = new Map([["core", "/path/to/core"]]);

      const { sql, errors } = preprocessSql("SELECT * FROM edges@core", packages);

      expect(errors).toHaveLength(0);
      expect(sql).toContain("edges.parquet");
    });

    test("expands external_refs@package to read_parquet", () => {
      const packages = new Map([["core", "/path/to/core"]]);

      const { sql, errors } = preprocessSql("SELECT * FROM external_refs@core", packages);

      expect(errors).toHaveLength(0);
      expect(sql).toContain("external_refs.parquet");
    });

    test("expands nodes@* to union of all packages", () => {
      const packages = new Map([
        ["core", "/path/to/core"],
        ["cli", "/path/to/cli"],
      ]);

      const { sql, errors } = preprocessSql("SELECT * FROM nodes@*", packages);

      expect(errors).toHaveLength(0);
      expect(sql).toContain("read_parquet([");
      expect(sql).toContain("/path/to/core/.devac/seed/base/nodes.parquet");
      expect(sql).toContain("/path/to/cli/.devac/seed/base/nodes.parquet");
    });

    test("reports error for unknown package", () => {
      const packages = new Map([["core", "/path/to/core"]]);

      const { sql, errors } = preprocessSql("SELECT * FROM nodes@unknown", packages);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unknown package: unknown");
      // Original SQL unchanged when error
      expect(sql).toContain("nodes@unknown");
    });

    test("reports error for @* with no packages", () => {
      const packages = new Map<string, string>();

      const { errors } = preprocessSql("SELECT * FROM nodes@*", packages);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("No packages available");
    });

    test("handles multiple @package references in same query", () => {
      const packages = new Map([
        ["core", "/path/to/core"],
        ["cli", "/path/to/cli"],
      ]);

      const { sql, errors } = preprocessSql(
        "SELECT n.* FROM nodes@core n JOIN edges@cli e ON n.entity_id = e.source_entity_id",
        packages
      );

      expect(errors).toHaveLength(0);
      expect(sql).toContain("/path/to/core/.devac/seed/base/nodes.parquet");
      expect(sql).toContain("/path/to/cli/.devac/seed/base/edges.parquet");
    });

    test("leaves regular SQL unchanged", () => {
      const packages = new Map([["core", "/path/to/core"]]);

      const { sql, errors } = preprocessSql(
        "SELECT * FROM nodes WHERE kind = 'function'",
        packages
      );

      expect(errors).toHaveLength(0);
      expect(sql).toBe("SELECT * FROM nodes WHERE kind = 'function'");
    });
  });

  describe("discoverPackagesInRepo", () => {
    test("discovers packages with seed directories", async () => {
      // Create a mock repo structure
      const pkg1Path = path.join(testDir, "packages", "core");
      const pkg2Path = path.join(testDir, "packages", "cli");
      const pkg1SeedPath = path.join(pkg1Path, ".devac", "seed", "base");
      const pkg2SeedPath = path.join(pkg2Path, ".devac", "seed", "base");

      await fs.mkdir(pkg1SeedPath, { recursive: true });
      await fs.mkdir(pkg2SeedPath, { recursive: true });

      // Create package.json files
      await fs.writeFile(
        path.join(pkg1Path, "package.json"),
        JSON.stringify({ name: "@myorg/core" })
      );
      await fs.writeFile(
        path.join(pkg2Path, "package.json"),
        JSON.stringify({ name: "@myorg/cli" })
      );

      const packages = await discoverPackagesInRepo(testDir);

      expect(packages).toHaveLength(2);
      expect(packages.map((p) => p.name).sort()).toEqual(["cli", "core"]);
      expect(packages.every((p) => p.hasSeeds)).toBe(true);
    });

    test("extracts short name from scoped packages", async () => {
      const pkgPath = path.join(testDir, "packages", "mypackage");
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      await fs.writeFile(
        path.join(pkgPath, "package.json"),
        JSON.stringify({ name: "@pietgk/devac-core" })
      );

      const packages = await discoverPackagesInRepo(testDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("devac-core");
    });

    test("uses directory name when no package.json", async () => {
      const pkgPath = path.join(testDir, "packages", "my-lib");
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      const packages = await discoverPackagesInRepo(testDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("my-lib");
    });

    test("skips node_modules and other excluded directories", async () => {
      // Create seeds in node_modules (should be ignored)
      const nodeModulesPath = path.join(
        testDir,
        "node_modules",
        "some-pkg",
        ".devac",
        "seed",
        "base"
      );
      await fs.mkdir(nodeModulesPath, { recursive: true });

      // Create seeds in a valid package
      const pkgPath = path.join(testDir, "packages", "valid");
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      const packages = await discoverPackagesInRepo(testDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("valid");
    });

    test("discovers root package if it has seeds", async () => {
      // Create seeds at repo root
      const seedPath = path.join(testDir, ".devac", "seed", "base");
      await fs.mkdir(seedPath, { recursive: true });

      await fs.writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "my-monorepo" })
      );

      const packages = await discoverPackagesInRepo(testDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("my-monorepo");
    });
  });

  describe("buildPackageMap", () => {
    test("builds map from discovered packages", () => {
      const packages = [
        { name: "core", path: "/path/to/core", hasSeeds: true },
        { name: "cli", path: "/path/to/cli", hasSeeds: true },
        { name: "docs", path: "/path/to/docs", hasSeeds: false },
      ];

      const map = buildPackageMap(packages);

      expect(map.size).toBe(2);
      expect(map.get("core")).toBe("/path/to/core");
      expect(map.get("cli")).toBe("/path/to/cli");
      expect(map.has("docs")).toBe(false);
    });
  });
});
