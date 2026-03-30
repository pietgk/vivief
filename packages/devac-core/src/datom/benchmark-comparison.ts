/**
 * Benchmark Comparison — Side-by-side analysis of Naive vs Compact DatomStore.
 *
 * Orchestrates both stores through benchmark-v2, produces structured results
 * with memory savings, latency deltas, and extrapolation to 250K entities.
 */

import {
  type BenchmarkV2Result,
  type ScalePoint,
  formatScalingTable,
  runBenchmarkV2,
  runScalingCurve,
} from "./benchmark-v2.js";
import { CompactDatomStore } from "./compact-datom-store.js";
import { InMemoryDatomStore } from "./datom-store.js";
import type { DatomStore } from "./types.js";

// ---------------------------------------------------------------------------
// Comparison Result Types
// ---------------------------------------------------------------------------

export interface StoreComparisonAtScale {
  entityCount: number;
  naive: BenchmarkV2Result;
  compact: BenchmarkV2Result;
  memorySavingsPercent: number;
  memorySavingsBytes: number;
}

export interface ComparisonResult {
  comparisons: StoreComparisonAtScale[];
  naiveScaling: ScalePoint[];
  compactScaling: ScalePoint[];
  projection250K: {
    naiveBytes: number;
    compactBytes: number;
    targetBytes: number;
    naiveGb: number;
    compactGb: number;
    targetGb: number;
  };
}

// ---------------------------------------------------------------------------
// Comparison Runner
// ---------------------------------------------------------------------------

const COMPARISON_SCALES = [1_000, 5_000, 10_000, 25_000, 50_000];

/**
 * Run full comparison between naive and compact stores.
 *
 * For each scale: builds both stores with same data (same seed),
 * measures memory and latency, computes deltas.
 */
export async function runComparison(
  scales: number[] = COMPARISON_SCALES
): Promise<ComparisonResult> {
  const comparisons: StoreComparisonAtScale[] = [];

  for (const entityCount of scales) {
    const naive = await runBenchmarkV2(
      () => new InMemoryDatomStore() as unknown as DatomStore,
      entityCount
    );
    const compact = await runBenchmarkV2(() => new CompactDatomStore(), entityCount);

    const memorySavingsBytes = naive.memory.storeBytes - compact.memory.storeBytes;
    const memorySavingsPercent =
      naive.memory.storeBytes > 0 ? (memorySavingsBytes / naive.memory.storeBytes) * 100 : 0;

    comparisons.push({
      entityCount,
      naive,
      compact,
      memorySavingsPercent,
      memorySavingsBytes,
    });
  }

  // Scaling curves
  const naiveScaling = await runScalingCurve(
    () => new InMemoryDatomStore() as unknown as DatomStore,
    scales
  );
  const compactScaling = await runScalingCurve(() => new CompactDatomStore(), scales);

  // Extrapolate to 250K using the largest measured bytes/entity
  const lastNaive = naiveScaling[naiveScaling.length - 1]!;
  const lastCompact = compactScaling[compactScaling.length - 1]!;
  const target250K = 250_000;
  const targetBytesTotal = 1.02 * 1024 * 1024 * 1024; // 1.02 GB from brainstorm

  const projection250K = {
    naiveBytes: lastNaive.bytesPerEntity * target250K,
    compactBytes: lastCompact.bytesPerEntity * target250K,
    targetBytes: targetBytesTotal,
    naiveGb: (lastNaive.bytesPerEntity * target250K) / (1024 * 1024 * 1024),
    compactGb: (lastCompact.bytesPerEntity * target250K) / (1024 * 1024 * 1024),
    targetGb: 1.02,
  };

  return { comparisons, naiveScaling, compactScaling, projection250K };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDelta(naive: number, compact: number): string {
  if (naive === 0) return "N/A";
  const delta = ((compact - naive) / naive) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

/**
 * Format comparison results as a human-readable report.
 */
export function formatComparisonReport(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("=== Naive vs Compact DatomStore Comparison ===");
  lines.push("");

  // Memory comparison
  lines.push("Memory (bytes/entity):");
  lines.push(
    `${"Scale".padStart(8)} | ${"Naive".padStart(10)} | ${"Compact".padStart(10)} | ${"Savings".padStart(10)}`
  );
  lines.push("-".repeat(46));
  for (const c of result.comparisons) {
    lines.push(
      `${c.entityCount.toLocaleString().padStart(8)} | ${c.naive.memory.bytesPerEntity.toFixed(0).padStart(10)} | ${c.compact.memory.bytesPerEntity.toFixed(0).padStart(10)} | ${c.memorySavingsPercent.toFixed(1).padStart(9)}%`
    );
  }
  lines.push("");

  // Latency comparison at largest scale
  const last = result.comparisons[result.comparisons.length - 1];
  if (last) {
    lines.push(`Latency at ${last.entityCount.toLocaleString()} entities (avg nanoseconds):`);
    lines.push(
      `${"Index".padStart(6)} | ${"Naive".padStart(8)} | ${"Compact".padStart(8)} | ${"Delta".padStart(8)}`
    );
    lines.push("-".repeat(38));

    const pairs: [string, number, number][] = [
      ["EAVT", last.naive.latency.eavt.avgNs, last.compact.latency.eavt.avgNs],
      ["AEVT", last.naive.latency.aevt.avgNs, last.compact.latency.aevt.avgNs],
      ["AVET", last.naive.latency.avet.avgNs, last.compact.latency.avet.avgNs],
      ["VAET", last.naive.latency.vaet.avgNs, last.compact.latency.vaet.avgNs],
    ];

    for (const [name, naive, compact] of pairs) {
      lines.push(
        `${name.padStart(6)} | ${naive.toFixed(0).padStart(8)} | ${compact.toFixed(0).padStart(8)} | ${fmtDelta(naive, compact).padStart(8)}`
      );
    }
    lines.push("");
  }

  // Scaling curves
  lines.push("Naive Scaling Curve:");
  lines.push(formatScalingTable(result.naiveScaling));
  lines.push("");
  lines.push("Compact Scaling Curve:");
  lines.push(formatScalingTable(result.compactScaling));
  lines.push("");

  // 250K projection
  const p = result.projection250K;
  lines.push("Projection to 250K entities:");
  lines.push(`  Naive:   ${fmtBytes(p.naiveBytes).padEnd(10)} (${p.naiveGb.toFixed(2)} GB)`);
  lines.push(`  Compact: ${fmtBytes(p.compactBytes).padEnd(10)} (${p.compactGb.toFixed(2)} GB)`);
  lines.push(`  Target:  ${fmtBytes(p.targetBytes).padEnd(10)} (${p.targetGb.toFixed(2)} GB)`);
  lines.push("");

  const gcAvail = result.comparisons[0]?.naive.memory.gcAvailable;
  if (!gcAvail) {
    lines.push("⚠ GC not available. Memory numbers are approximate.");
    lines.push(`  For accurate numbers: NODE_OPTIONS="--expose-gc" pnpm test ...`);
  }

  return lines.join("\n");
}
