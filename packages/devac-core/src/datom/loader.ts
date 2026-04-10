/**
 * Datom Loader — Translates existing DevAC data (Nodes, Edges, ExternalRefs) into datoms
 *
 * Two modes:
 *   loadFromArrays()  — for tests, accepts raw row arrays
 *   loadFromSeeds()   — for benchmarks, reads from SeedReader (Phase 6)
 */

import type { Edge } from "../storage/schemas/edge.schema.js";
import type { ExternalRef } from "../storage/schemas/external-ref.schema.js";
import type { Node } from "../storage/schemas/node.schema.js";
import type {
  Attribute,
  Datom,
  DatomStore,
  DatomValue,
  EdgeDatomValue,
  ExternalRefDatomValue,
  LoadResult,
  TxId,
} from "./types.js";

/** Metadata columns to skip when translating nodes to datoms */
const NODE_SKIP_COLUMNS = new Set([
  "entity_id", // becomes the E
  "source_file_hash",
  "branch",
  "is_deleted",
  "updated_at",
]);

export interface LoadableData {
  nodes?: Node[];
  edges?: Edge[];
  externalRefs?: ExternalRef[];
}

/**
 * Load pre-materialized arrays of Nodes/Edges/ExternalRefs into a DatomStore.
 * Each row is translated to datoms and asserted.
 */
export function loadFromArrays(store: DatomStore, data: LoadableData, tx?: TxId): LoadResult {
  const startTime = performance.now();
  const txId = tx ?? 1;
  let nodesDatomCount = 0;
  let edgesDatomCount = 0;
  let externalRefsDatomCount = 0;

  // Nodes -> :node/* datoms
  if (data.nodes) {
    for (const node of data.nodes) {
      const datoms = nodeToDataoms(node, txId);
      store.assertDatoms(datoms);
      nodesDatomCount += datoms.length;
    }
  }

  // Edges -> :edge/* datoms (structured values)
  if (data.edges) {
    for (const edge of data.edges) {
      const datom = edgeToDatom(edge, txId);
      store.assertDatom(datom);
      edgesDatomCount++;
    }
  }

  // ExternalRefs -> :external-ref/import datoms
  if (data.externalRefs) {
    for (const ref of data.externalRefs) {
      const datom = externalRefToDatom(ref, txId);
      store.assertDatom(datom);
      externalRefsDatomCount++;
    }
  }

  return {
    entityCount: store.entityCount(),
    datomCount: store.datomCount(),
    loadTimeMs: performance.now() - startTime,
    nodesDatomCount,
    edgesDatomCount,
    effectsDatomCount: 0,
    externalRefsDatomCount,
  };
}

/** Translate a Node row into datoms — one datom per column (skipping metadata + nulls) */
function nodeToDataoms(node: Node, tx: TxId): Datom[] {
  const entity = node.entity_id;
  const datoms: Datom[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (NODE_SKIP_COLUMNS.has(key)) continue;
    if (value === null || value === undefined) continue;

    const attr: Attribute = `:node/${key}`;
    datoms.push({
      e: entity,
      a: attr,
      v: value as DatomValue,
      tx,
      op: "assert",
    });
  }

  return datoms;
}

/** Translate an Edge row into a single datom with structured value */
function edgeToDatom(edge: Edge, tx: TxId): Datom {
  const value: EdgeDatomValue = {
    target: edge.target_entity_id,
    sourceFile: edge.source_file_path,
    sourceLine: edge.source_line,
    sourceColumn: edge.source_column,
    properties: edge.properties,
  };

  return {
    e: edge.source_entity_id,
    a: `:edge/${edge.edge_type}`,
    v: value as unknown as DatomValue,
    tx,
    op: "assert",
  };
}

/** Translate an ExternalRef row into a single datom with structured value */
function externalRefToDatom(ref: ExternalRef, tx: TxId): Datom {
  const value: ExternalRefDatomValue = {
    moduleSpecifier: ref.module_specifier,
    importedSymbol: ref.imported_symbol,
    localAlias: ref.local_alias,
    importStyle: ref.import_style,
    isTypeOnly: ref.is_type_only,
    targetEntityId: ref.target_entity_id,
    isResolved: ref.is_resolved,
    isReexport: ref.is_reexport,
    exportAlias: ref.export_alias,
    sourceFile: ref.source_file_path,
    sourceLine: ref.source_line,
    sourceColumn: ref.source_column,
  };

  return {
    e: ref.source_entity_id,
    a: ":external-ref/import",
    v: value as unknown as DatomValue,
    tx,
    op: "assert",
  };
}
