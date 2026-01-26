/**
 * Seed Factory - Create Test Seeds Using Zod Schemas
 *
 * This module provides utilities for creating test seed data that is
 * guaranteed to match the production schema (since both are derived from Zod).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Connection } from "duckdb-async";
import { DuckDBPool, executeWithRecovery } from "../storage/duckdb-pool.js";
import { getCopyToParquet, initializeSchemas } from "../storage/parquet-schemas.js";
import { zodToColumnNames, zodToValuesRow } from "../storage/schema-generators.js";
import {
  type Edge,
  EdgeSchema,
  type ExternalRef,
  ExternalRefSchema,
  type Node,
  NodeSchema,
  type TestEdge,
  type TestExternalRef,
  type TestNode,
  createEdgeFromTestData,
  createExternalRefFromTestData,
  createNodeFromTestData,
} from "../storage/schemas/index.js";

/**
 * Test fixture data structure
 */
export interface TestFixture {
  nodes?: TestNode[];
  edges?: TestEdge[];
  externalRefs?: TestExternalRef[];
}

/**
 * Result of creating test seeds
 */
export interface CreateSeedsResult {
  nodesCreated: number;
  edgesCreated: number;
  externalRefsCreated: number;
  seedPath: string;
}

/**
 * Options for creating test seeds
 */
export interface CreateSeedsOptions {
  /** Prefix for entity IDs (default: "test:pkg") */
  entityIdPrefix?: string;
  /** Branch name (default: "base") */
  branch?: string;
}

/**
 * Create test seeds from fixture data using Zod schemas
 *
 * This function creates Parquet seed files from test data, ensuring
 * that the data matches the production schema exactly.
 *
 * @param pool - DuckDB connection pool
 * @param pkgPath - Path to the package directory
 * @param fixture - Test fixture data
 * @param options - Optional configuration
 * @returns Result with counts of created entities
 */
export async function createTestSeeds(
  pool: DuckDBPool,
  pkgPath: string,
  fixture: TestFixture,
  options: CreateSeedsOptions = {}
): Promise<CreateSeedsResult> {
  const { entityIdPrefix = "test:pkg", branch = "base" } = options;
  const seedPath = path.join(pkgPath, ".devac", "seed", branch);

  // Create seed directory
  await fs.mkdir(seedPath, { recursive: true });

  let nodesCreated = 0;
  let edgesCreated = 0;
  let externalRefsCreated = 0;

  await executeWithRecovery(pool, async (conn) => {
    // Initialize schemas (creates temp tables)
    await initializeSchemas(conn);

    // Write nodes
    if (fixture.nodes && fixture.nodes.length > 0) {
      const fullNodes = fixture.nodes.map((n) => createNodeFromTestData(n, { entityIdPrefix }));
      await writeNodesTable(conn, fullNodes);
      await conn.run(getCopyToParquet("nodes", path.join(seedPath, "nodes.parquet")));
      nodesCreated = fullNodes.length;
    }

    // Write edges
    if (fixture.edges && fixture.edges.length > 0) {
      const fullEdges = fixture.edges.map(createEdgeFromTestData);
      await writeEdgesTable(conn, fullEdges);
      await conn.run(getCopyToParquet("edges", path.join(seedPath, "edges.parquet")));
      edgesCreated = fullEdges.length;
    }

    // Write external refs
    if (fixture.externalRefs && fixture.externalRefs.length > 0) {
      const fullRefs = fixture.externalRefs.map(createExternalRefFromTestData);
      await writeExternalRefsTable(conn, fullRefs);
      await conn.run(
        getCopyToParquet("external_refs", path.join(seedPath, "external_refs.parquet"))
      );
      externalRefsCreated = fullRefs.length;
    }

    // Clean up temp tables to avoid conflicts with views
    await conn.run("DROP TABLE IF EXISTS nodes");
    await conn.run("DROP TABLE IF EXISTS edges");
    await conn.run("DROP TABLE IF EXISTS external_refs");
    await conn.run("DROP TABLE IF EXISTS effects");
  });

  return {
    nodesCreated,
    edgesCreated,
    externalRefsCreated,
    seedPath,
  };
}

/**
 * Write nodes to the temp table using Zod schema for column order
 */
async function writeNodesTable(conn: Connection, nodes: Node[]): Promise<void> {
  if (nodes.length === 0) return;

  const columns = zodToColumnNames(NodeSchema);
  const values = nodes
    .map((n) => zodToValuesRow(NodeSchema, n as unknown as Record<string, unknown>))
    .join(",\n  ");

  await conn.run(`INSERT INTO nodes (${columns.join(", ")}) VALUES\n  ${values}`);
}

/**
 * Write edges to the temp table using Zod schema for column order
 */
async function writeEdgesTable(conn: Connection, edges: Edge[]): Promise<void> {
  if (edges.length === 0) return;

  const columns = zodToColumnNames(EdgeSchema);
  const values = edges
    .map((e) => zodToValuesRow(EdgeSchema, e as unknown as Record<string, unknown>))
    .join(",\n  ");

  await conn.run(`INSERT INTO edges (${columns.join(", ")}) VALUES\n  ${values}`);
}

/**
 * Write external refs to the temp table using Zod schema for column order
 */
async function writeExternalRefsTable(conn: Connection, refs: ExternalRef[]): Promise<void> {
  if (refs.length === 0) return;

  const columns = zodToColumnNames(ExternalRefSchema);
  const values = refs
    .map((r) => zodToValuesRow(ExternalRefSchema, r as unknown as Record<string, unknown>))
    .join(",\n  ");

  await conn.run(`INSERT INTO external_refs (${columns.join(", ")}) VALUES\n  ${values}`);
}

/**
 * Clean up test seeds
 */
export async function cleanupTestSeeds(pkgPath: string): Promise<void> {
  const seedPath = path.join(pkgPath, ".devac");
  try {
    await fs.rm(seedPath, { recursive: true, force: true });
  } catch {
    // Ignore errors - directory might not exist
  }
}

/**
 * Create a test DuckDB pool for testing
 */
export function createTestPool(): DuckDBPool {
  return new DuckDBPool({
    maxConnections: 1,
    memoryLimit: "256MB",
  });
}
