/**
 * Parquet Schema Definitions
 *
 * SQL CREATE TABLE statements for DuckDB to define Parquet schemas.
 * Based on DevAC v2.0 spec Sections 4.1, 4.2, 4.3.
 */

import type { Connection } from "duckdb-async";

/**
 * Nodes table schema
 * Stores all code symbols (functions, classes, variables, etc.)
 */
export const NODES_SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  entity_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  qualified_name VARCHAR NOT NULL,
  kind VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  is_exported BOOLEAN NOT NULL DEFAULT false,
  is_default_export BOOLEAN NOT NULL DEFAULT false,
  visibility VARCHAR NOT NULL DEFAULT 'public',
  is_async BOOLEAN NOT NULL DEFAULT false,
  is_generator BOOLEAN NOT NULL DEFAULT false,
  is_static BOOLEAN NOT NULL DEFAULT false,
  is_abstract BOOLEAN NOT NULL DEFAULT false,
  type_signature VARCHAR,
  documentation VARCHAR,
  decorators VARCHAR[] NOT NULL DEFAULT [],
  type_parameters VARCHAR[] NOT NULL DEFAULT [],
  properties JSON NOT NULL DEFAULT '{}',
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, branch)
)
`;

/**
 * Edges table schema
 * Stores relationships between nodes (calls, contains, extends, etc.)
 */
export const EDGES_SCHEMA = `
CREATE TABLE IF NOT EXISTS edges (
  source_entity_id VARCHAR NOT NULL,
  target_entity_id VARCHAR NOT NULL,
  edge_type VARCHAR NOT NULL,
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER NOT NULL,
  source_column INTEGER NOT NULL,
  properties JSON NOT NULL DEFAULT '{}',
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

/**
 * External references table schema
 * Stores unresolved imports to be resolved in semantic pass
 */
export const EXTERNAL_REFS_SCHEMA = `
CREATE TABLE IF NOT EXISTS external_refs (
  source_entity_id VARCHAR NOT NULL,
  module_specifier VARCHAR NOT NULL,
  imported_symbol VARCHAR NOT NULL,
  local_alias VARCHAR,
  import_style VARCHAR NOT NULL DEFAULT 'named',
  is_type_only BOOLEAN NOT NULL DEFAULT false,
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER NOT NULL,
  source_column INTEGER NOT NULL,
  target_entity_id VARCHAR,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  is_reexport BOOLEAN NOT NULL DEFAULT false,
  export_alias VARCHAR,
  source_file_hash VARCHAR NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

/**
 * Effects table schema (v3.0 foundation)
 * Stores code effects extracted during parsing
 */
export const EFFECTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS effects (
  effect_id VARCHAR NOT NULL,
  effect_type VARCHAR NOT NULL,
  timestamp VARCHAR NOT NULL,
  source_entity_id VARCHAR NOT NULL,
  source_file_path VARCHAR NOT NULL,
  source_line INTEGER NOT NULL,
  source_column INTEGER NOT NULL,
  branch VARCHAR NOT NULL DEFAULT 'base',
  properties JSON NOT NULL DEFAULT '{}',
  target_entity_id VARCHAR,
  callee_name VARCHAR,
  callee_qualified_name VARCHAR,
  is_method_call BOOLEAN,
  is_async BOOLEAN,
  is_constructor BOOLEAN,
  argument_count INTEGER,
  is_external BOOLEAN,
  external_module VARCHAR,
  store_type VARCHAR,
  retrieve_type VARCHAR,
  send_type VARCHAR,
  operation VARCHAR,
  target_resource VARCHAR,
  provider VARCHAR,
  request_type VARCHAR,
  response_type VARCHAR,
  method VARCHAR,
  route_pattern VARCHAR,
  framework VARCHAR,
  target VARCHAR,
  is_third_party BOOLEAN,
  service_name VARCHAR,
  status_code INTEGER,
  content_type VARCHAR,
  condition_type VARCHAR,
  branch_count INTEGER,
  has_default BOOLEAN,
  loop_type VARCHAR,
  group_type VARCHAR,
  group_name VARCHAR,
  description VARCHAR,
  technology VARCHAR,
  parent_group_id VARCHAR,
  source_file_hash VARCHAR NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (effect_id, branch)
)
`;

/**
 * Create indexes for efficient querying
 */
export const INDEXES = [
  // Nodes indexes
  "CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_is_exported ON nodes(is_exported)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_source_file_hash ON nodes(source_file_hash)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_branch ON nodes(branch)",

  // Edges indexes
  "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_entity_id)",
  "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_entity_id)",
  "CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type)",
  "CREATE INDEX IF NOT EXISTS idx_edges_source_file ON edges(source_file_path)",
  "CREATE INDEX IF NOT EXISTS idx_edges_branch ON edges(branch)",

  // External refs indexes
  "CREATE INDEX IF NOT EXISTS idx_refs_source ON external_refs(source_entity_id)",
  "CREATE INDEX IF NOT EXISTS idx_refs_module ON external_refs(module_specifier)",
  "CREATE INDEX IF NOT EXISTS idx_refs_symbol ON external_refs(imported_symbol)",
  "CREATE INDEX IF NOT EXISTS idx_refs_resolved ON external_refs(is_resolved)",
  "CREATE INDEX IF NOT EXISTS idx_refs_branch ON external_refs(branch)",

  // Effects indexes (v3.0 foundation)
  "CREATE INDEX IF NOT EXISTS idx_effects_type ON effects(effect_type)",
  "CREATE INDEX IF NOT EXISTS idx_effects_source ON effects(source_entity_id)",
  "CREATE INDEX IF NOT EXISTS idx_effects_target ON effects(target_entity_id)",
  "CREATE INDEX IF NOT EXISTS idx_effects_file ON effects(source_file_path)",
  "CREATE INDEX IF NOT EXISTS idx_effects_branch ON effects(branch)",
];

/**
 * Initialize all tables in DuckDB connection
 */
export async function initializeSchemas(conn: Connection): Promise<void> {
  await conn.run(NODES_SCHEMA);
  await conn.run(EDGES_SCHEMA);
  await conn.run(EXTERNAL_REFS_SCHEMA);
  await conn.run(EFFECTS_SCHEMA);

  for (const index of INDEXES) {
    await conn.run(index);
  }
}

/**
 * Parquet write options for optimal storage
 * Based on spec Section 12.2
 */
export const PARQUET_OPTIONS = {
  compression: "ZSTD",
  rowGroupSize: 10000,
  statistics: true,
  dictionary: true,
};

/**
 * Generate COPY TO statement for exporting table to Parquet
 */
export function getCopyToParquet(tableName: string, filePath: string): string {
  return `COPY ${tableName} TO '${filePath}' (
    FORMAT PARQUET,
    COMPRESSION '${PARQUET_OPTIONS.compression}',
    ROW_GROUP_SIZE ${PARQUET_OPTIONS.rowGroupSize}
  )`;
}

/**
 * Generate query to read from Parquet file
 */
export function getReadFromParquet(filePath: string, tableName?: string): string {
  if (tableName) {
    return `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${filePath}')`;
  }
  return `SELECT * FROM read_parquet('${filePath}')`;
}

/**
 * Get the deduplication condition for a table type.
 * Each table has different key columns for identifying unique records.
 */
function getDeduplicationCondition(tableName: string): string {
  switch (tableName) {
    case "nodes":
      return "branch.entity_id = base.entity_id";
    case "edges":
      // Edges are uniquely identified by source, target, and type
      return "branch.source_entity_id = base.source_entity_id AND branch.target_entity_id = base.target_entity_id AND branch.edge_type = base.edge_type";
    case "external_refs":
      // External refs are uniquely identified by source, module, and symbol
      return "branch.source_entity_id = base.source_entity_id AND branch.module_specifier = base.module_specifier AND branch.imported_symbol = base.imported_symbol";
    case "effects":
      // Effects use effect_id as the unique identifier
      return "branch.effect_id = base.effect_id";
    default:
      // Fallback to entity_id for unknown tables
      return "branch.entity_id = base.entity_id";
  }
}

/**
 * Query to get unified view of base + branch partitions
 * Used for querying current state across both partitions.
 *
 * Branch records take precedence over base records when keys match.
 * Each table type uses appropriate deduplication keys:
 * - nodes: entity_id
 * - edges: source_entity_id + target_entity_id + edge_type
 * - external_refs: source_entity_id + module_specifier + imported_symbol
 * - effects: effect_id
 */
export function getUnifiedQuery(
  tableName: string,
  basePath: string,
  branchPath: string,
  fileExists: { base: boolean; branch: boolean }
): string {
  if (!fileExists.base && !fileExists.branch) {
    return `SELECT * FROM ${tableName} WHERE 1=0`; // Empty result
  }

  if (!fileExists.branch) {
    return `SELECT * FROM read_parquet('${basePath}') WHERE is_deleted = false`;
  }

  if (!fileExists.base) {
    return `SELECT * FROM read_parquet('${branchPath}') WHERE is_deleted = false`;
  }

  const dedupeCondition = getDeduplicationCondition(tableName);

  // Union with branch taking precedence
  return `
    SELECT * FROM (
      SELECT * FROM read_parquet('${branchPath}')
      WHERE is_deleted = false
      UNION ALL
      SELECT base.* FROM read_parquet('${basePath}') base
      WHERE NOT EXISTS (
        SELECT 1 FROM read_parquet('${branchPath}') branch
        WHERE ${dedupeCondition}
      )
      AND base.is_deleted = false
    )
  `;
}
