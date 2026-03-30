/**
 * Benchmark V2 — Precise performance and memory measurement.
 *
 * Fixes V1 methodology issues:
 * 1. Batch timing with process.hrtime.bigint() (nanosecond resolution)
 * 2. JIT warmup (5000 iterations before measurement)
 * 3. GC-aware memory snapshots (triple gc() + v8.getHeapStatistics())
 * 4. Realistic data generation (seeded PRNG, varied kinds/edges)
 * 5. Store-agnostic via factory function
 */

import * as v8 from "node:v8";
import type { Edge } from "../storage/schemas/edge.schema.js";
import type { Node } from "../storage/schemas/node.schema.js";
import { loadFromArrays } from "./loader.js";
import type { DatomStore } from "./types.js";

// ---------------------------------------------------------------------------
// Seeded PRNG — deterministic data generation
// ---------------------------------------------------------------------------

/** Simple xoshiro128** PRNG for deterministic benchmarks */
class SeededRng {
  private s: Uint32Array;

  constructor(seed: number) {
    // SplitMix32 to initialize state from a single seed
    this.s = new Uint32Array(4);
    let s = seed;
    for (let i = 0; i < 4; i++) {
      s += 0x9e3779b9;
      let z = s;
      z = (z ^ (z >>> 16)) * 0x85ebca6b;
      z = (z ^ (z >>> 13)) * 0xc2b2ae35;
      z = z ^ (z >>> 16);
      this.s[i] = z >>> 0;
    }
  }

  /** Returns a float in [0, 1) */
  next(): number {
    const s = this.s;
    const result = Math.imul(s[1]! * 5, 7) >>> 0;
    const t = s[1]! << 9;

    s[2] = s[2]! ^ s[0]!;
    s[3] = s[3]! ^ s[1]!;
    s[1] = s[1]! ^ s[2]!;
    s[0] = s[0]! ^ s[3]!;
    s[2] = s[2]! ^ t;
    s[3] = (s[3]! << 11) | (s[3]! >>> 21);

    return (result >>> 0) / 0x100000000;
  }

  /** Returns an integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Pick a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)]!;
  }

  /** Pick an element using weighted probabilities */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }
}

// ---------------------------------------------------------------------------
// Realistic Data Generator
// ---------------------------------------------------------------------------

const NODE_KINDS = ["function", "class", "method", "variable", "interface"] as const;
const KIND_WEIGHTS = [60, 10, 15, 10, 5]; // Percentages

const EDGE_TYPES = ["CALLS", "IMPORTS", "EXTENDS", "CONTAINS"] as const;
const EDGE_TYPE_WEIGHTS = [70, 15, 10, 5];

/**
 * Generate realistic code graph data with deterministic PRNG.
 *
 * Properties:
 * - 5 node kinds with realistic distribution
 * - ~20 nodes per file, varied attribute density
 * - Branching edges (1-3 targets per node, not just linear chain)
 * - Multiple edge types
 */
export function generateRealisticData(count: number, seed = 42): { nodes: Node[]; edges: Edge[] } {
  const rng = new SeededRng(seed);
  const now = new Date().toISOString();
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodesPerFile = 20;

  for (let i = 0; i < count; i++) {
    const kind = rng.weightedPick(NODE_KINDS, KIND_WEIGHTS);
    const fileIdx = Math.floor(i / nodesPerFile);
    const filePath = `src/gen/module${fileIdx}.ts`;

    nodes.push({
      entity_id: `bench:pkg:${kind}:entity${i}`,
      name: `${kind}${i}`,
      qualified_name: `bench.${kind}${i}`,
      kind,
      file_path: filePath,
      start_line: (i % nodesPerFile) * 15 + 1,
      end_line: (i % nodesPerFile) * 15 + 12,
      start_column: 0,
      end_column: 50,
      is_exported: rng.next() < 0.2,
      is_default_export: false,
      visibility: rng.pick(["public", "private", "protected"]),
      is_async: rng.next() < 0.3,
      is_generator: false,
      is_static: rng.next() < 0.1,
      is_abstract: kind === "class" && rng.next() < 0.15,
      type_signature: rng.next() < 0.6 ? "() => void" : null,
      documentation: rng.next() < 0.3 ? `Documentation for ${kind}${i}` : null,
      decorators: [],
      type_parameters: [],
      properties: {},
      source_file_hash: `hash${fileIdx}`,
      branch: "main",
      is_deleted: false,
      updated_at: now,
    });
  }

  // Generate edges — 1-3 outgoing edges per node (branching graph)
  for (let i = 0; i < count; i++) {
    const numEdges = 1 + rng.nextInt(3); // 1-3 edges
    for (let e = 0; e < numEdges; e++) {
      const targetIdx = rng.nextInt(count);
      if (targetIdx === i) continue; // no self-edges

      const edgeType = rng.weightedPick(EDGE_TYPES, EDGE_TYPE_WEIGHTS);
      edges.push({
        source_entity_id: nodes[i]!.entity_id,
        target_entity_id: nodes[targetIdx]!.entity_id,
        edge_type: edgeType,
        source_file_path: nodes[i]!.file_path,
        source_line: nodes[i]!.start_line + 3,
        source_column: 4,
        properties: {},
        source_file_hash: `hash${Math.floor(i / nodesPerFile)}`,
        branch: "main",
        is_deleted: false,
        updated_at: now,
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Memory Snapshots
// ---------------------------------------------------------------------------

export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  v8HeapUsed: number;
  v8HeapTotal: number;
  gcAvailable: boolean;
}

/**
 * Take a memory snapshot with best-effort GC.
 *
 * If global.gc is available (--expose-gc), runs 3 GC passes with
 * short delays to ensure both minor and major collections complete.
 * Without GC, readings are noisier but still useful for relative comparison.
 */
export async function takeMemorySnapshot(): Promise<MemorySnapshot> {
  const gcAvailable = typeof global.gc === "function";

  if (gcAvailable) {
    // V8 needs multiple passes: minor GC, major GC, finalization
    for (let i = 0; i < 3; i++) {
      global.gc?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const mem = process.memoryUsage();
  const heap = v8.getHeapStatistics();

  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    v8HeapUsed: heap.used_heap_size,
    v8HeapTotal: heap.total_heap_size,
    gcAvailable,
  };
}

// ---------------------------------------------------------------------------
// Batch Timing
// ---------------------------------------------------------------------------

export interface BatchTimingResult {
  avgNs: number;
  totalMs: number;
  iterations: number;
}

/**
 * JIT warmup — ensure V8 TurboFan has optimized the code path.
 *
 * V8's Ignition interpreter runs first ~1000 invocations, then TurboFan
 * compiles hot code. 5000 warmup iterations ensures we measure optimized code.
 */
export function warmup(fn: (i: number) => void, iterations = 5_000): void {
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
}

/**
 * Measure average latency in nanoseconds using batch timing.
 *
 * Single operations at sub-microsecond scale cannot be measured reliably
 * (timer resolution is ~1µs for performance.now()). Instead, we time N
 * operations in a batch and divide.
 *
 * Uses process.hrtime.bigint() for nanosecond resolution.
 */
export function batchTimingNs(fn: (i: number) => void, iterations = 10_000): BatchTimingResult {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
  const elapsed = process.hrtime.bigint() - start;

  const totalNs = Number(elapsed);
  return {
    avgNs: totalNs / iterations,
    totalMs: totalNs / 1_000_000,
    iterations,
  };
}

// ---------------------------------------------------------------------------
// V2 Benchmark Result Types
// ---------------------------------------------------------------------------

export interface IndexLatency {
  avgNs: number;
  totalMs: number;
  iterations: number;
}

export interface BenchmarkV2Result {
  entityCount: number;
  datomCount: number;
  edgeCount: number;
  memory: {
    before: MemorySnapshot;
    afterData: MemorySnapshot;
    afterStore: MemorySnapshot;
    dataBytes: number;
    storeBytes: number;
    bytesPerEntity: number;
    gcAvailable: boolean;
  };
  buildTimeMs: number;
  latency: {
    eavt: IndexLatency;
    aevt: IndexLatency;
    avet: IndexLatency;
    vaet: IndexLatency;
  };
}

export interface ScalePoint {
  entityCount: number;
  datomCount: number;
  bytesPerEntity: number;
  buildTimeMs: number;
  eavtAvgNs: number;
  avetAvgNs: number;
  vaetAvgNs: number;
  gcAvailable: boolean;
}

// ---------------------------------------------------------------------------
// V2 Benchmark Runner
// ---------------------------------------------------------------------------

/**
 * Run a full benchmark at a given entity scale.
 *
 * Store-agnostic via factory function — same code tests both naive and compact.
 */
export async function runBenchmarkV2(
  createStore: () => DatomStore,
  entityCount: number,
  seed = 42
): Promise<BenchmarkV2Result> {
  // 1. Baseline memory
  const memBefore = await takeMemorySnapshot();

  // 2. Generate data
  const data = generateRealisticData(entityCount, seed);

  const memAfterData = await takeMemorySnapshot();
  const dataBytes = memAfterData.heapUsed - memBefore.heapUsed;

  // 3. Build store
  const store = createStore();
  const buildStart = performance.now();
  loadFromArrays(store, data);
  const buildTimeMs = performance.now() - buildStart;

  // 4. Memory after store build
  // Release data arrays to measure only store memory
  // @ts-expect-error intentionally clearing reference
  data.nodes = null;
  // @ts-expect-error intentionally clearing reference
  data.edges = null;
  const memAfterStore = await takeMemorySnapshot();
  const storeBytes = memAfterStore.heapUsed - memAfterData.heapUsed;

  // 5. Warmup all lookup paths
  const lookupIterations = 10_000;
  warmup((i) => store.get(`bench:pkg:function:entity${i % entityCount}`), 5_000);
  // AEVT: unfiltered (attribute existence) — O(1) Set return, not O(N) value scan
  warmup((_i) => store.findByAttribute(":node/kind"), 5_000);
  warmup((i) => store.findByValue(":node/name", `function${i % entityCount}`), 5_000);
  warmup(
    (i) => store.reverseRefs(`bench:pkg:function:entity${i % entityCount}`, ":edge/CALLS"),
    5_000
  );

  // 6. Batch-timed latency measurements
  const eavt = batchTimingNs(
    (i) => store.get(`bench:pkg:function:entity${i % entityCount}`),
    lookupIterations
  );

  // AEVT: measures attribute index lookup (not value filtering, which is O(N))
  const aevt = batchTimingNs((_i) => store.findByAttribute(":node/kind"), lookupIterations);

  const avet = batchTimingNs(
    (i) => store.findByValue(":node/name", `function${i % entityCount}`),
    lookupIterations
  );

  const vaet = batchTimingNs(
    (i) => store.reverseRefs(`bench:pkg:function:entity${i % entityCount}`, ":edge/CALLS"),
    lookupIterations
  );

  return {
    entityCount: store.entityCount(),
    datomCount: store.datomCount(),
    edgeCount: store.datomCount() - store.entityCount(), // approximate
    memory: {
      before: memBefore,
      afterData: memAfterData,
      afterStore: memAfterStore,
      dataBytes: Math.max(0, dataBytes),
      storeBytes: Math.max(0, storeBytes),
      bytesPerEntity: entityCount > 0 ? Math.max(0, storeBytes) / entityCount : 0,
      gcAvailable: memBefore.gcAvailable,
    },
    buildTimeMs,
    latency: { eavt, aevt, avet, vaet },
  };
}

// ---------------------------------------------------------------------------
// Scaling Curve
// ---------------------------------------------------------------------------

const DEFAULT_SCALES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];

/**
 * Run benchmarks at multiple scales to check for superlinear growth.
 */
export async function runScalingCurve(
  createStore: () => DatomStore,
  scales: number[] = DEFAULT_SCALES
): Promise<ScalePoint[]> {
  const results: ScalePoint[] = [];

  for (const entityCount of scales) {
    const r = await runBenchmarkV2(createStore, entityCount);
    results.push({
      entityCount,
      datomCount: r.datomCount,
      bytesPerEntity: r.memory.bytesPerEntity,
      buildTimeMs: r.buildTimeMs,
      eavtAvgNs: r.latency.eavt.avgNs,
      avetAvgNs: r.latency.avet.avgNs,
      vaetAvgNs: r.latency.vaet.avgNs,
      gcAvailable: r.memory.gcAvailable,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a scaling curve as a human-readable table.
 */
export function formatScalingTable(points: ScalePoint[]): string {
  const lines: string[] = [];

  lines.push(
    `${"Scale".padStart(8)} | ${"Datoms".padStart(8)} | ${"B/Entity".padStart(10)} | ${"Build ms".padStart(10)} | ${"EAVT ns".padStart(9)} | ${"AVET ns".padStart(9)} | ${"VAET ns".padStart(9)} | GC`
  );
  lines.push("-".repeat(88));

  for (const p of points) {
    lines.push(
      `${p.entityCount.toLocaleString().padStart(8)} | ${p.datomCount.toLocaleString().padStart(8)} | ${p.bytesPerEntity.toFixed(0).padStart(10)} | ${p.buildTimeMs.toFixed(1).padStart(10)} | ${p.eavtAvgNs.toFixed(0).padStart(9)} | ${p.avetAvgNs.toFixed(0).padStart(9)} | ${p.vaetAvgNs.toFixed(0).padStart(9)} | ${p.gcAvailable ? "yes" : "no"}`
    );
  }

  return lines.join("\n");
}

/**
 * Format a full V2 benchmark result for console output.
 */
export function formatBenchmarkV2(r: BenchmarkV2Result): string {
  const lines: string[] = [];

  lines.push("=== Benchmark V2 Results ===");
  lines.push(`Entities: ${r.entityCount.toLocaleString()}`);
  lines.push(`Datoms: ${r.datomCount.toLocaleString()}`);
  lines.push("");
  lines.push("Memory:");
  lines.push(
    `  Store: ${(r.memory.storeBytes / 1024 / 1024).toFixed(2)} MB (${r.memory.bytesPerEntity.toFixed(0)} B/entity)`
  );
  lines.push(`  GC available: ${r.memory.gcAvailable ? "yes (accurate)" : "no (approximate)"}`);
  lines.push("");
  lines.push(`Build: ${r.buildTimeMs.toFixed(1)} ms`);
  lines.push("");
  lines.push(
    `Latency (avg ns, ${r.latency.eavt.iterations.toLocaleString()} iterations after 5K warmup):`
  );
  lines.push(`  EAVT: ${r.latency.eavt.avgNs.toFixed(0)} ns`);
  lines.push(`  AEVT: ${r.latency.aevt.avgNs.toFixed(0)} ns`);
  lines.push(`  AVET: ${r.latency.avet.avgNs.toFixed(0)} ns`);
  lines.push(`  VAET: ${r.latency.vaet.avgNs.toFixed(0)} ns`);

  return lines.join("\n");
}
