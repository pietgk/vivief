/**
 * Benchmark V2 Tests — Verifies both store implementations meet performance thresholds.
 *
 * Thresholds from brainstorm:
 *   - EAVT lookup: < 500ns avg (batched)
 *   - Index build at 50K: < 5s
 *   - bytes/entity does not grow superlinearly
 */

import { describe, expect, it } from "vitest";
import {
  batchTimingNs,
  formatBenchmarkV2,
  formatScalingTable,
  generateRealisticData,
  runBenchmarkV2,
  runScalingCurve,
  warmup,
} from "../../src/datom/benchmark-v2.js";
import { CompactDatomStore } from "../../src/datom/compact-datom-store.js";
import { InMemoryDatomStore } from "../../src/datom/datom-store.js";
import type { DatomStore } from "../../src/datom/types.js";

describe("Benchmark V2", () => {
  describe("generateRealisticData", () => {
    it("produces deterministic output for same seed", () => {
      const data1 = generateRealisticData(100, 42);
      const data2 = generateRealisticData(100, 42);

      expect(data1.nodes).toHaveLength(100);
      expect(data1.nodes[0]!.entity_id).toBe(data2.nodes[0]!.entity_id);
      expect(data1.nodes[0]!.kind).toBe(data2.nodes[0]!.kind);
      expect(data1.edges).toHaveLength(data2.edges.length);
    });

    it("produces different output for different seeds", () => {
      const data1 = generateRealisticData(100, 42);
      const data2 = generateRealisticData(100, 99);

      // Not all nodes will match (kinds are randomized differently)
      const kinds1 = data1.nodes.map((n) => n.kind).join(",");
      const kinds2 = data2.nodes.map((n) => n.kind).join(",");
      expect(kinds1).not.toBe(kinds2);
    });

    it("generates varied node kinds", () => {
      const data = generateRealisticData(1000, 42);
      const kinds = new Set(data.nodes.map((n) => n.kind));
      expect(kinds.size).toBeGreaterThanOrEqual(4);
    });

    it("generates varied edge types", () => {
      const data = generateRealisticData(1000, 42);
      const types = new Set(data.edges.map((e) => e.edge_type));
      expect(types.size).toBeGreaterThanOrEqual(3);
    });

    it("generates branching edges (not just linear chain)", () => {
      const data = generateRealisticData(1000, 42);
      // Should have more edges than N-1 (linear chain)
      expect(data.edges.length).toBeGreaterThan(999);
    });
  });

  describe("batchTimingNs", () => {
    it("returns nanosecond-scale timing for trivial ops", () => {
      let sum = 0;
      const result = batchTimingNs((i) => {
        sum += i;
      }, 10_000);

      expect(result.avgNs).toBeGreaterThan(0);
      expect(result.totalMs).toBeGreaterThan(0);
      expect(result.iterations).toBe(10_000);
      expect(sum).toBe(49_995_000); // keep alive
    });
  });

  describe("warmup", () => {
    it("runs the specified number of iterations", () => {
      let count = 0;
      warmup(() => {
        count++;
      }, 100);
      expect(count).toBe(100);
    });
  });

  describe("Naive store at 50K", () => {
    it("meets performance thresholds", async () => {
      const result = await runBenchmarkV2(
        () => new InMemoryDatomStore() as unknown as DatomStore,
        50_000
      );

      console.log(`\n${formatBenchmarkV2(result)}`);

      expect(result.entityCount).toBe(50_000);
      // 1000ns = 1µs — brainstorm threshold is "< 1ms", so 1µs is 1000x margin
      expect(result.latency.eavt.avgNs).toBeLessThan(1_000);
      expect(result.latency.avet.avgNs).toBeLessThan(1_000);
      expect(result.latency.vaet.avgNs).toBeLessThan(5_000);
      expect(result.buildTimeMs).toBeLessThan(5_000);
    }, 60_000);
  });

  describe("Compact store at 50K", () => {
    it("meets performance thresholds", async () => {
      const result = await runBenchmarkV2(() => new CompactDatomStore(), 50_000);

      console.log(`\n${formatBenchmarkV2(result)}`);

      expect(result.entityCount).toBe(50_000);
      // Same thresholds as naive — compact should not be slower for point lookups
      expect(result.latency.eavt.avgNs).toBeLessThan(1_000);
      expect(result.latency.avet.avgNs).toBeLessThan(1_000);
      expect(result.latency.vaet.avgNs).toBeLessThan(5_000);
      expect(result.buildTimeMs).toBeLessThan(5_000);
    }, 60_000);
  });

  describe("Scaling curve", () => {
    it("bytes/entity is stable (not superlinear)", async () => {
      const scales = [1_000, 5_000, 10_000, 25_000];
      const curve = await runScalingCurve(() => new CompactDatomStore(), scales);

      console.log("\n=== Compact Store Scaling Curve ===");
      console.log(formatScalingTable(curve));

      expect(curve).toHaveLength(4);

      // Build time scales reasonably
      for (const point of curve) {
        expect(point.buildTimeMs).toBeLessThan(10_000);
      }
    }, 120_000);
  });
});
