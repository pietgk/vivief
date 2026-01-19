/**
 * Hub Query Command Tests for DevAC v2.0
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DuckDBPool, executeWithRecovery } from "@pietgk/devac-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hubInit } from "../src/commands/hub-init.js";
import { hubQueryCommand } from "../src/commands/hub-query.js";
import { hubRegister } from "../src/commands/hub-register.js";

describe("hub query command", () => {
  let tempDir: string;
  let hubDir: string;
  let pool: DuckDBPool;

  beforeAll(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
  });

  afterAll(async () => {
    await pool.shutdown();
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-query-test-"));
    hubDir = path.join(tempDir, ".devac");
    await hubInit({ hubDir, skipValidation: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createMockRepoWithSeeds(
    name: string,
    nodes: Array<{ entity_id: string; name: string; kind: string }>,
    edges: Array<{ source_entity_id: string; target_entity_id: string; edge_type: string }> = []
  ): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const seedPath = path.join(repoPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    // Create git config for repo ID
    await fs.mkdir(path.join(repoPath, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, ".git", "config"),
      `[remote "origin"]\n  url = git@github.com:org/${name}.git\n`
    );

    // Create package.json
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name }));

    // Create real parquet files using DuckDB
    await executeWithRecovery(pool, async (conn) => {
      // Create nodes parquet
      if (nodes.length > 0) {
        const nodeValues = nodes
          .map(
            (n) =>
              `('${n.entity_id}', '${n.name}', '${n.kind}', 'src/test.ts', 1, 10, 0, 50, false, false, 'public', false, false, false, false, NULL, NULL, '[]'::JSON, '[]'::JSON, '{}'::JSON, 'hash123', 'base', false, current_timestamp)`
          )
          .join(", ");

        await conn.run(`
          CREATE TABLE temp_nodes AS
          SELECT * FROM (VALUES ${nodeValues}) AS t(
            entity_id, name, kind, file_path, start_line, end_line, start_column, end_column,
            is_exported, is_default_export, visibility, is_async, is_generator, is_static, is_abstract,
            type_signature, documentation, decorators, type_parameters, properties,
            source_file_hash, branch, is_deleted, updated_at
          )
        `);
        await conn.run(`COPY temp_nodes TO '${seedPath}/nodes.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_nodes");
      }

      // Create edges parquet
      if (edges.length > 0) {
        const edgeValues = edges
          .map(
            (e) =>
              `('${e.source_entity_id}', '${e.target_entity_id}', '${e.edge_type}', 'src/test.ts', 1, 0, '{}'::JSON, 'hash123', 'base', false, current_timestamp)`
          )
          .join(", ");

        await conn.run(`
          CREATE TABLE temp_edges AS
          SELECT * FROM (VALUES ${edgeValues}) AS t(
            source_entity_id, target_entity_id, edge_type, source_file_path, source_line, source_column,
            properties, source_file_hash, branch, is_deleted, updated_at
          )
        `);
        await conn.run(`COPY temp_edges TO '${seedPath}/edges.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_edges");
      } else {
        // Create empty edges parquet
        await conn.run(`
          CREATE TABLE temp_edges AS
          SELECT 'x' as source_entity_id, 'y' as target_entity_id, 'CALLS' as edge_type,
                 'test.ts' as source_file_path, 1 as source_line, 0 as source_column,
                 '{}'::JSON as properties, 'hash' as source_file_hash, 'base' as branch,
                 false as is_deleted, current_timestamp as updated_at
          WHERE false
        `);
        await conn.run(`COPY temp_edges TO '${seedPath}/edges.parquet' (FORMAT PARQUET)`);
        await conn.run("DROP TABLE temp_edges");
      }

      // Create empty external_refs parquet
      await conn.run(`
        CREATE TABLE temp_refs AS
        SELECT 'x' as source_entity_id, 'test.ts' as source_file_path, 1 as source_line, 0 as source_column,
               'lodash' as module_specifier, 'map' as imported_symbol, NULL as local_alias,
               'named' as import_style, false as is_type_only, NULL as target_entity_id, false as is_resolved,
               false as is_reexport, NULL as export_alias, 'hash' as source_file_hash, 'base' as branch,
               false as is_deleted, current_timestamp as updated_at
        WHERE false
      `);
      await conn.run(`COPY temp_refs TO '${seedPath}/external_refs.parquet' (FORMAT PARQUET)`);
      await conn.run("DROP TABLE temp_refs");
    });

    // Create stats.json
    await fs.writeFile(
      path.join(seedPath, "stats.json"),
      JSON.stringify({
        nodeCount: nodes.length,
        edgeCount: edges.length,
        refCount: 0,
        fileCount: 1,
      })
    );

    return repoPath;
  }

  it("queries nodes across multiple registered repos", async () => {
    const repo1 = await createMockRepoWithSeeds("repo1", [
      { entity_id: "repo1:pkg:function:abc", name: "funcA", kind: "function" },
      { entity_id: "repo1:pkg:class:def", name: "ClassB", kind: "class" },
    ]);
    const repo2 = await createMockRepoWithSeeds("repo2", [
      { entity_id: "repo2:pkg:function:ghi", name: "funcC", kind: "function" },
    ]);

    await hubRegister({ hubDir, repoPath: repo1 });
    await hubRegister({ hubDir, repoPath: repo2 });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT name, kind FROM nodes ORDER BY name",
    });

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.rows).toContainEqual(
      expect.objectContaining({ name: "funcA", kind: "function" })
    );
    expect(result.rows).toContainEqual(expect.objectContaining({ name: "ClassB", kind: "class" }));
    expect(result.rows).toContainEqual(
      expect.objectContaining({ name: "funcC", kind: "function" })
    );
  });

  it("queries edges across repositories", async () => {
    const repo1 = await createMockRepoWithSeeds(
      "repo1",
      [
        { entity_id: "repo1:pkg:function:abc", name: "caller", kind: "function" },
        { entity_id: "repo1:pkg:function:def", name: "callee", kind: "function" },
      ],
      [
        {
          source_entity_id: "repo1:pkg:function:abc",
          target_entity_id: "repo1:pkg:function:def",
          edge_type: "CALLS",
        },
      ]
    );

    await hubRegister({ hubDir, repoPath: repo1 });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT edge_type, source_entity_id FROM edges",
    });

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(1);
    expect(result.rows?.[0]).toMatchObject({
      edge_type: "CALLS",
      source_entity_id: "repo1:pkg:function:abc",
    });
  });

  it("supports filtering with WHERE clause", async () => {
    const repo = await createMockRepoWithSeeds("repo1", [
      { entity_id: "repo1:pkg:function:abc", name: "funcA", kind: "function" },
      { entity_id: "repo1:pkg:class:def", name: "ClassB", kind: "class" },
      { entity_id: "repo1:pkg:function:ghi", name: "funcC", kind: "function" },
    ]);

    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT name FROM nodes WHERE kind = 'function' ORDER BY name",
    });

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([{ name: "funcA" }, { name: "funcC" }]);
  });

  it("supports aggregation queries", async () => {
    const repo = await createMockRepoWithSeeds("repo1", [
      { entity_id: "repo1:pkg:function:abc", name: "funcA", kind: "function" },
      { entity_id: "repo1:pkg:class:def", name: "ClassB", kind: "class" },
      { entity_id: "repo1:pkg:function:ghi", name: "funcC", kind: "function" },
    ]);

    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind ORDER BY kind",
    });

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toContainEqual({ kind: "class", count: 1n });
    expect(result.rows).toContainEqual({ kind: "function", count: 2n });
  });

  it("returns JSON output when requested", async () => {
    const repo = await createMockRepoWithSeeds("repo1", [
      { entity_id: "repo1:pkg:function:abc", name: "funcA", kind: "function" },
    ]);

    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT name FROM nodes",
      json: true,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('"name"');
    expect(result.output).toContain('"funcA"');
  });

  it("fails if no repos with seeds are found", async () => {
    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT * FROM nodes",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No repositories with seed data found");
  });

  it("fails if hub not initialized", async () => {
    const result = await hubQueryCommand({
      hubDir: path.join(tempDir, "nonexistent"),
      sql: "SELECT * FROM nodes",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails on invalid SQL", async () => {
    const repo = await createMockRepoWithSeeds("repo1", [
      { entity_id: "repo1:pkg:function:abc", name: "funcA", kind: "function" },
    ]);

    await hubRegister({ hubDir, repoPath: repo });

    const result = await hubQueryCommand({
      hubDir,
      sql: "SELECT * FROM nonexistent_table",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
