/**
 * graphDepsDatom — DatomStore-based port of graphDeps
 *
 * Replaces 3-5 SQL queries + N+1 patterns with direct Map lookups.
 * The original (src/queries/graph.ts:68-140) does:
 *   1. COUNT query for total
 *   2. SELECT * FROM edges (filtered)
 *   3. SELECT * FROM nodes WHERE entity_id IN (...) for names
 *   4. For depth>1: WITH RECURSIVE CTE
 *
 * This version: 1-2 Map lookups, BFS for depth>1.
 */

import type { DatomStore, EdgeDatomValue } from "./types.js";

/** Parameters matching the original GraphDepsParams (subset relevant to the spike) */
export interface GraphDepsDatomParams {
  entity: string;
  edgeType?: string;
  depth?: number;
  limit?: number;
}

/** A dependency result — target entity with edge metadata */
export interface DepResult {
  entityId: string;
  name: string | undefined;
  kind: string | undefined;
  edgeType: string;
  sourceFile: string;
  sourceLine: number;
  depth: number;
}

/**
 * Get what a symbol depends on (outgoing edges) using the DatomStore.
 *
 * For depth=1: single EAVT lookup + target resolution.
 * For depth>1: BFS with visited set (replaces WITH RECURSIVE CTE).
 */
export function graphDepsDatom(store: DatomStore, params: GraphDepsDatomParams): DepResult[] {
  const { entity, edgeType, depth = 1, limit = 100 } = params;
  const results: DepResult[] = [];
  const visited = new Set<string>();
  const queue: { id: string; currentDepth: number }[] = [{ id: entity, currentDepth: 0 }];

  visited.add(entity);

  while (queue.length > 0 && results.length < limit) {
    const { id, currentDepth } = queue.shift()!;

    if (currentDepth >= depth) continue;

    // Get all edge attributes for this entity
    const view = store.get(id);
    if (!view) continue;

    // Collect edges — either filtered by type or all :edge/* attributes
    const edgeEntries: { attr: string; values: EdgeDatomValue[] }[] = [];

    if (edgeType) {
      const attr = `:edge/${edgeType}`;
      const values = view.getAll(attr) as unknown as EdgeDatomValue[];
      if (values.length > 0) edgeEntries.push({ attr, values });
    } else {
      for (const [attr, values] of view.attrs) {
        if (attr.startsWith(":edge/")) {
          edgeEntries.push({
            attr,
            values: values as unknown as EdgeDatomValue[],
          });
        }
      }
    }

    // Process edges → results + BFS queue
    for (const { attr, values } of edgeEntries) {
      const type = attr.slice(":edge/".length);
      for (const edge of values) {
        if (!edge.target || visited.has(edge.target)) continue;
        visited.add(edge.target);

        const targetView = store.get(edge.target);
        results.push({
          entityId: edge.target,
          name: targetView?.get(":node/name") as string | undefined,
          kind: targetView?.get(":node/kind") as string | undefined,
          edgeType: type,
          sourceFile: edge.sourceFile,
          sourceLine: edge.sourceLine,
          depth: currentDepth + 1,
        });

        if (results.length >= limit) break;

        // Enqueue for deeper traversal
        if (currentDepth + 1 < depth) {
          queue.push({ id: edge.target, currentDepth: currentDepth + 1 });
        }
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}
