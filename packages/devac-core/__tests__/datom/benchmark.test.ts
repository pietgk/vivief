import { describe, expect, it } from "vitest";
import { runBenchmark } from "../../src/datom/benchmark.js";

describe("DatomStore Benchmark", () => {
  describe("small scale (~5K entities)", () => {
    const result = runBenchmark(5_000);

    it("loads all entities", () => {
      expect(result.entityCount).toBe(5_000);
    });

    it("creates expected datom count", () => {
      // ~15-20 datoms per node + 1 per edge (4999 edges)
      expect(result.datomCount).toBeGreaterThan(5_000);
    });

    it("EAVT lookup < 1ms (pass threshold)", () => {
      // 1ms = 1000us
      expect(result.lookupLatency.eavtMedianUs).toBeLessThan(1000);
    });

    it("AVET lookup < 1ms", () => {
      expect(result.lookupLatency.avetMedianUs).toBeLessThan(1000);
    });

    it("VAET lookup < 1ms", () => {
      expect(result.lookupLatency.vaetMedianUs).toBeLessThan(1000);
    });

    it("index build < 5s", () => {
      expect(result.indexBuildTimeMs).toBeLessThan(5000);
    });

    it("logs benchmark results", () => {
      console.log("\n=== 5K Benchmark Results ===");
      console.log(`Entities: ${result.entityCount}`);
      console.log(`Datoms: ${result.datomCount}`);
      console.log(
        `Memory: ${(result.memoryBytes / 1024 / 1024).toFixed(1)} MB (${result.memoryPerEntity.toFixed(0)} bytes/entity)`
      );
      console.log(`Index build: ${result.indexBuildTimeMs.toFixed(1)} ms`);
      console.log(
        `EAVT lookup: median=${result.lookupLatency.eavtMedianUs.toFixed(1)}µs p99=${result.lookupLatency.eavtP99Us.toFixed(1)}µs`
      );
      console.log(
        `AVET lookup: median=${result.lookupLatency.avetMedianUs.toFixed(1)}µs p99=${result.lookupLatency.avetP99Us.toFixed(1)}µs`
      );
      console.log(
        `VAET lookup: median=${result.lookupLatency.vaetMedianUs.toFixed(1)}µs p99=${result.lookupLatency.vaetP99Us.toFixed(1)}µs`
      );
    });
  });

  describe("large scale (~50K entities)", () => {
    const result = runBenchmark(50_000);

    it("loads all entities", () => {
      expect(result.entityCount).toBe(50_000);
    });

    it("EAVT lookup < 1ms (pass threshold)", () => {
      expect(result.lookupLatency.eavtMedianUs).toBeLessThan(1000);
    });

    it("EAVT p99 < 10ms (fail threshold)", () => {
      // 10ms = 10000us
      expect(result.lookupLatency.eavtP99Us).toBeLessThan(10000);
    });

    it("index build < 5s (pass threshold)", () => {
      expect(result.indexBuildTimeMs).toBeLessThan(5000);
    });

    it("index build < 30s (fail threshold)", () => {
      expect(result.indexBuildTimeMs).toBeLessThan(30000);
    });

    it("logs benchmark results", () => {
      console.log("\n=== 50K Benchmark Results ===");
      console.log(`Entities: ${result.entityCount}`);
      console.log(`Datoms: ${result.datomCount}`);
      console.log(
        `Memory: ${(result.memoryBytes / 1024 / 1024).toFixed(1)} MB (${result.memoryPerEntity.toFixed(0)} bytes/entity)`
      );
      console.log(`Index build: ${result.indexBuildTimeMs.toFixed(1)} ms`);
      console.log(
        `EAVT lookup: median=${result.lookupLatency.eavtMedianUs.toFixed(1)}µs p99=${result.lookupLatency.eavtP99Us.toFixed(1)}µs`
      );
      console.log(
        `AVET lookup: median=${result.lookupLatency.avetMedianUs.toFixed(1)}µs p99=${result.lookupLatency.avetP99Us.toFixed(1)}µs`
      );
      console.log(
        `VAET lookup: median=${result.lookupLatency.vaetMedianUs.toFixed(1)}µs p99=${result.lookupLatency.vaetP99Us.toFixed(1)}µs`
      );
    });
  });
});
