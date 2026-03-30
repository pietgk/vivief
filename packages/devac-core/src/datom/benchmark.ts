/**
 * Datom Store Benchmark — Memory + Latency measurements
 *
 * Two scales:
 *   Small: ~5K entities (typical repo)
 *   Large: ~50K entities (generated)
 *
 * Pass/Fail thresholds from brainstorm:
 *   Entity lookup (EAVT): < 1ms pass, > 10ms fail
 *   Index build (50K): < 5s pass, > 30s fail
 */

import type { Edge } from "../storage/schemas/edge.schema.js";
import type { Node } from "../storage/schemas/node.schema.js";
import { InMemoryDatomStore } from "./datom-store.js";
import { loadFromArrays } from "./loader.js";
import type { BenchmarkResult } from "./types.js";

/** Generate N nodes + (N-1) edges as full schema objects */
function generateData(count: number): { nodes: Node[]; edges: Edge[] } {
  const now = new Date().toISOString();
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (let i = 0; i < count; i++) {
    nodes.push({
      entity_id: `bench:pkg:function:fn${i}`,
      name: `func${i}`,
      qualified_name: `bench.func${i}`,
      kind: "function",
      file_path: `src/gen/file${Math.floor(i / 10)}.ts`,
      start_line: (i % 100) * 10 + 1,
      end_line: (i % 100) * 10 + 9,
      start_column: 0,
      end_column: 50,
      is_exported: i % 5 === 0,
      is_default_export: false,
      visibility: "public",
      is_async: i % 3 === 0,
      is_generator: false,
      is_static: false,
      is_abstract: false,
      type_signature: i % 2 === 0 ? "() => void" : null,
      documentation: null,
      decorators: [],
      type_parameters: [],
      properties: {},
      source_file_hash: "benchhash",
      branch: "base",
      is_deleted: false,
      updated_at: now,
    });

    if (i > 0) {
      edges.push({
        source_entity_id: `bench:pkg:function:fn${i}`,
        target_entity_id: `bench:pkg:function:fn${i - 1}`,
        edge_type: "CALLS",
        source_file_path: `src/gen/file${Math.floor(i / 10)}.ts`,
        source_line: (i % 100) * 10 + 5,
        source_column: 4,
        properties: {},
        source_file_hash: "benchhash",
        branch: "base",
        is_deleted: false,
        updated_at: now,
      });
    }
  }

  return { nodes, edges };
}

/** Measure microseconds for a single operation (high-res) */
function measureUs(fn: () => void): number {
  const start = performance.now();
  fn();
  return (performance.now() - start) * 1000;
}

/** Run N random lookups, return median and p99 latencies in microseconds */
function benchmarkLookups(
  count: number,
  fn: (i: number) => void,
  entityCount: number
): { medianUs: number; p99Us: number } {
  const latencies: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * entityCount);
    latencies.push(measureUs(() => fn(idx)));
  }
  latencies.sort((a, b) => a - b);
  if (count === 0) return { medianUs: 0, p99Us: 0 };
  return {
    medianUs: latencies[Math.floor(latencies.length / 2)] as number,
    p99Us: latencies[Math.floor(latencies.length * 0.99)] as number,
  };
}

/**
 * Run the full benchmark at a given entity scale.
 * Returns structured results for assertions.
 */
export function runBenchmark(entityCount: number): BenchmarkResult {
  // Force GC if available for more accurate memory measurement
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const data = generateData(entityCount);
  const store = new InMemoryDatomStore();

  const buildStart = performance.now();
  loadFromArrays(store, data);
  const indexBuildTimeMs = performance.now() - buildStart;

  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  const memoryBytes = Math.max(0, memAfter - memBefore);

  const lookupCount = Math.min(1000, entityCount);

  // EAVT lookups (entity by ID)
  const eavt = benchmarkLookups(
    lookupCount,
    (i) => store.get(`bench:pkg:function:fn${i}`),
    entityCount
  );

  // AVET lookups (find by value)
  const avet = benchmarkLookups(
    lookupCount,
    (i) => store.findByValue(":node/name", `func${i}`),
    entityCount
  );

  // VAET lookups (reverse refs)
  const vaet = benchmarkLookups(
    lookupCount,
    (i) => store.reverseRefs(`bench:pkg:function:fn${i}`, ":edge/CALLS"),
    entityCount
  );

  return {
    entityCount: store.entityCount(),
    datomCount: store.datomCount(),
    memoryBytes,
    memoryPerEntity: entityCount > 0 ? memoryBytes / entityCount : 0,
    indexBuildTimeMs,
    lookupLatency: {
      eavtMedianUs: eavt.medianUs,
      eavtP99Us: eavt.p99Us,
      avetMedianUs: avet.medianUs,
      avetP99Us: avet.p99Us,
      vaetMedianUs: vaet.medianUs,
      vaetP99Us: vaet.p99Us,
    },
  };
}
