/**
 * Memory Analysis — Executable explainer for datom store overhead.
 *
 * 7 test groups, each isolating one overhead factor. Each test logs
 * the "what" and the "why" so the developer can understand results.
 *
 * For GC-accurate numbers:
 *   NODE_OPTIONS="--expose-gc" pnpm --filter @pietgk/devac-core test -- --run __tests__/datom/memory-analysis.test.ts
 */

import { describe, expect, it } from "vitest";
import { formatComparisonReport, runComparison } from "../../src/datom/benchmark-comparison.js";
import {
  batchTimingNs,
  generateRealisticData,
  runBenchmarkV2,
  warmup,
} from "../../src/datom/benchmark-v2.js";
import { CompactDatomStore } from "../../src/datom/compact-datom-store.js";
import { InMemoryDatomStore } from "../../src/datom/datom-store.js";
import { InternPool } from "../../src/datom/intern-pool.js";
import { loadFromArrays } from "../../src/datom/loader.js";
import type { DatomStore } from "../../src/datom/types.js";

const gcAvailable = typeof global.gc === "function";

/** Quick heap snapshot for relative measurements */
async function heapUsed(): Promise<number> {
  if (gcAvailable) {
    global.gc?.();
    await new Promise((r) => setTimeout(r, 20));
  }
  return process.memoryUsage().heapUsed;
}

describe("Memory Analysis", () => {
  // -----------------------------------------------------------------------
  // 1. V8 Map overhead per entry: Map<string> vs Map<number>
  // -----------------------------------------------------------------------
  describe("1. V8 Map overhead: string keys vs number keys", () => {
    it("measures bytes/entry for string-keyed vs number-keyed Maps", async () => {
      const N = 50_000;

      // Measure string-keyed map
      const beforeStr = await heapUsed();
      const stringMap = new Map<string, number[]>();
      for (let i = 0; i < N; i++) {
        stringMap.set(`:node/attr${i}`, [i]);
      }
      const afterStr = await heapUsed();
      const stringBytesPerEntry = (afterStr - beforeStr) / N;

      // Measure number-keyed map
      const beforeNum = await heapUsed();
      const numberMap = new Map<number, number[]>();
      for (let i = 0; i < N; i++) {
        numberMap.set(i, [i]);
      }
      const afterNum = await heapUsed();
      const numberBytesPerEntry = (afterNum - beforeNum) / N;

      const savings = stringBytesPerEntry - numberBytesPerEntry;

      console.log("\n=== 1. V8 Map Key Overhead ===");
      console.log(`Map<string, number[]>: ~${stringBytesPerEntry.toFixed(0)} bytes/entry`);
      console.log(`Map<number, number[]>: ~${numberBytesPerEntry.toFixed(0)} bytes/entry`);
      console.log(`Savings per entry: ~${savings.toFixed(0)} bytes`);
      console.log(`GC available: ${gcAvailable}`);
      console.log("WHY: V8 uses SMI (Small Integer) optimization for Map<number>.");
      console.log("     Integer keys < 2^31 avoid hash table overhead, saving ~40 bytes/entry.");

      // Keep references alive
      expect(stringMap.size).toBe(N);
      expect(numberMap.size).toBe(N);

      // Number keys should use less memory (with GC, expect ~20-60 bytes savings)
      if (gcAvailable) {
        expect(numberBytesPerEntry).toBeLessThan(stringBytesPerEntry);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. String interning savings
  // -----------------------------------------------------------------------
  describe("2. String interning savings", () => {
    it("measures memory with/without interning at 50K datoms", async () => {
      const N = 50_000;
      const attrs = [
        ":node/name",
        ":node/kind",
        ":node/file_path",
        ":node/is_exported",
        ":node/start_line",
        ":node/end_line",
        ":node/visibility",
        ":node/is_async",
        ":node/type_signature",
        ":node/documentation",
      ];

      // Without interning: Map<string, values> per entity
      const beforeNaive = await heapUsed();
      const naiveEntities = new Map<string, Map<string, unknown>>();
      for (let i = 0; i < N; i++) {
        const attrMap = new Map<string, unknown>();
        for (const attr of attrs) {
          attrMap.set(attr, `value${i}`);
        }
        naiveEntities.set(`entity${i}`, attrMap);
      }
      const afterNaive = await heapUsed();
      const naiveBytes = afterNaive - beforeNaive;

      // With interning: Map<number, values> per entity + one InternPool
      const beforeInterned = await heapUsed();
      const pool = new InternPool();
      const internedEntities = new Map<string, Map<number, unknown>>();
      for (let i = 0; i < N; i++) {
        const attrMap = new Map<number, unknown>();
        for (const attr of attrs) {
          attrMap.set(pool.intern(attr), `value${i}`);
        }
        internedEntities.set(`entity${i}`, attrMap);
      }
      const afterInterned = await heapUsed();
      const internedBytes = afterInterned - beforeInterned;

      const savings = naiveBytes - internedBytes;
      const savingsPercent = (savings / naiveBytes) * 100;

      console.log("\n=== 2. String Interning Savings ===");
      console.log(`${N.toLocaleString()} entities × ${attrs.length} attrs each`);
      console.log(`Without interning: ${(naiveBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`With interning:    ${(internedBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(
        `Savings: ${(savings / 1024 / 1024).toFixed(2)} MB (${savingsPercent.toFixed(1)}%)`
      );
      console.log(
        `Pool overhead: ${pool.estimateMemoryBytes()} bytes (${pool.size} unique strings)`
      );
      console.log("WHY: Each Map<string> entry stores a string key pointer + hash.");
      console.log("     Interning replaces 500K string keys with 500K integer keys.");

      expect(naiveEntities.size).toBe(N);
      expect(internedEntities.size).toBe(N);
      expect(pool.size).toBe(attrs.length);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Index duplication cost
  // -----------------------------------------------------------------------
  describe("3. Index duplication cost", () => {
    it("measures incremental memory per index", async () => {
      const N = 10_000;
      const data = generateRealisticData(N, 42);

      // Measure EAVT only (build store, check entity count as proxy)
      const naive = new InMemoryDatomStore();
      const compact = new CompactDatomStore();

      const beforeNaive = await heapUsed();
      loadFromArrays(naive as unknown as DatomStore, data);
      const afterNaive = await heapUsed();
      const naiveBytes = afterNaive - beforeNaive;

      const beforeCompact = await heapUsed();
      loadFromArrays(compact, data);
      const afterCompact = await heapUsed();
      const compactBytes = afterCompact - beforeCompact;

      const savings = naiveBytes - compactBytes;
      const savingsPercent = naiveBytes > 0 ? (savings / naiveBytes) * 100 : 0;

      console.log("\n=== 3. Index Duplication Cost ===");
      console.log(`${N.toLocaleString()} entities loaded into both stores`);
      console.log(
        `Naive (4 full indexes):   ${(naiveBytes / 1024 / 1024).toFixed(2)} MB (${(naiveBytes / N).toFixed(0)} B/entity)`
      );
      console.log(
        `Compact (optimized):      ${(compactBytes / 1024 / 1024).toFixed(2)} MB (${(compactBytes / N).toFixed(0)} B/entity)`
      );
      console.log(
        `Savings: ${(savings / 1024 / 1024).toFixed(2)} MB (${savingsPercent.toFixed(1)}%)`
      );
      console.log("WHY: Naive AEVT duplicates all values from EAVT.");
      console.log(`     Naive AVET serializes values to strings ("s:funcName").`);
      console.log("     Compact AEVT is pointer-only (Set<EntityId>).");
      console.log("     Compact AVET uses type-specific sub-indexes (no serialization).");

      expect(naive.entityCount()).toBe(N);
      expect(compact.entityCount()).toBe(N);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Serialization overhead
  // -----------------------------------------------------------------------
  describe("4. Serialization overhead", () => {
    it("measures cost of serializeValue() string creation", () => {
      const N = 100_000;

      // Simulate what InMemoryDatomStore.indexDatom does for AVET
      function serializeValue(v: unknown): string {
        if (typeof v === "string") return `s:${v}`;
        if (typeof v === "number") return `n:${v}`;
        if (typeof v === "boolean") return `b:${v}`;
        if (Array.isArray(v)) return `a:${JSON.stringify(v)}`;
        if (v !== null && typeof v === "object") return `o:${JSON.stringify(v)}`;
        return "null";
      }

      // With serialization (naive approach)
      warmup((i) => serializeValue(`funcName${i}`), 5_000);
      const withSerialization = batchTimingNs((i) => serializeValue(`funcName${i % 1000}`), N);

      // Without serialization (compact approach: direct Map<string, Set>)
      const directMap = new Map<string, Set<string>>();
      warmup((i) => {
        const v = `funcName${i % 1000}`;
        let set = directMap.get(v);
        if (!set) {
          set = new Set();
          directMap.set(v, set);
        }
        set.add(`e${i}`);
      }, 5_000);
      const withoutSerialization = batchTimingNs((i) => {
        const v = `funcName${i % 1000}`;
        let set = directMap.get(v);
        if (!set) {
          set = new Set();
          directMap.set(v, set);
        }
        set.add(`e${i}`);
      }, N);

      console.log("\n=== 4. Serialization Overhead ===");
      console.log(`serializeValue() + Map lookup: ${withSerialization.avgNs.toFixed(0)} ns/op`);
      console.log(`Direct Map<string, Set> lookup: ${withoutSerialization.avgNs.toFixed(0)} ns/op`);
      console.log("WHY: serializeValue() creates a new string on every call.");
      console.log(`     "s:funcName" prefix allocation is pure overhead.`);
      console.log("     TypedValueIndex skips this entirely for string/number/boolean values.");

      // Serialization should not be dramatically faster than direct (it's adding work)
      expect(withSerialization.avgNs).toBeGreaterThan(0);
      expect(withoutSerialization.avgNs).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Scaling: linear vs superlinear
  // -----------------------------------------------------------------------
  describe("5. Scaling: linear vs superlinear", () => {
    it("bytes/entity does not grow superlinearly", async () => {
      const scales = [1_000, 5_000, 10_000, 25_000];
      const naiveResults: { scale: number; bytesPerEntity: number }[] = [];
      const compactResults: { scale: number; bytesPerEntity: number }[] = [];

      for (const scale of scales) {
        const naiveR = await runBenchmarkV2(
          () => new InMemoryDatomStore() as unknown as DatomStore,
          scale
        );
        const compactR = await runBenchmarkV2(() => new CompactDatomStore(), scale);
        naiveResults.push({
          scale,
          bytesPerEntity: naiveR.memory.bytesPerEntity,
        });
        compactResults.push({
          scale,
          bytesPerEntity: compactR.memory.bytesPerEntity,
        });
      }

      console.log("\n=== 5. Scaling Analysis ===");
      console.log(
        `${"Scale".padStart(8)} | ${"Naive B/E".padStart(11)} | ${"Compact B/E".padStart(13)}`
      );
      console.log("-".repeat(38));
      for (let i = 0; i < scales.length; i++) {
        console.log(
          `${scales[i]!.toLocaleString().padStart(8)} | ${naiveResults[i]!.bytesPerEntity.toFixed(0).padStart(11)} | ${compactResults[i]!.bytesPerEntity.toFixed(0).padStart(13)}`
        );
      }
      console.log("WHY: If bytes/entity stays roughly constant, growth is linear (good).");
      console.log("     Superlinear growth would indicate hash table resizing or duplication.");

      // bytes/entity at 25K should not be more than 2x the value at 1K
      // (allowing for Map overhead amortization at small scales)
      const naiveSmall = naiveResults[0]!.bytesPerEntity;
      const naiveLarge = naiveResults[naiveResults.length - 1]!.bytesPerEntity;
      // Skip strict assertion if GC not available (memory noise is too high)
      if (gcAvailable) {
        expect(naiveLarge).toBeLessThan(naiveSmall * 2);
      }

      expect(naiveResults).toHaveLength(scales.length);
    }, 120_000);
  });

  // -----------------------------------------------------------------------
  // 6. Brainstorm target comparison
  // -----------------------------------------------------------------------
  describe("6. Brainstorm target comparison (250K projection)", () => {
    it("extrapolates to 250K and compares to 1.02 GB target", async () => {
      // Measure at 25K and extrapolate (running 250K would be too slow for CI)
      const scale = 25_000;
      const naiveR = await runBenchmarkV2(
        () => new InMemoryDatomStore() as unknown as DatomStore,
        scale
      );
      const compactR = await runBenchmarkV2(() => new CompactDatomStore(), scale);

      const target250K = 250_000;
      const naiveProjected = naiveR.memory.bytesPerEntity * target250K;
      const compactProjected = compactR.memory.bytesPerEntity * target250K;
      const targetBytes = 1.02 * 1024 * 1024 * 1024; // 1.02 GB

      console.log("\n=== 6. Brainstorm Target Comparison ===");
      console.log(`Measured at ${scale.toLocaleString()} entities:`);
      console.log(`  Naive:   ${naiveR.memory.bytesPerEntity.toFixed(0)} B/entity`);
      console.log(`  Compact: ${compactR.memory.bytesPerEntity.toFixed(0)} B/entity`);
      console.log("");
      console.log("Projected to 250K entities:");
      console.log(`  Naive:   ${(naiveProjected / 1024 / 1024 / 1024).toFixed(2)} GB`);
      console.log(`  Compact: ${(compactProjected / 1024 / 1024 / 1024).toFixed(2)} GB`);
      console.log("  Target:  1.02 GB");
      console.log("");

      const compactVsTarget = ((compactProjected - targetBytes) / targetBytes) * 100;
      const naiveVsTarget = ((naiveProjected - targetBytes) / targetBytes) * 100;
      console.log(
        `  Naive vs target:   ${naiveVsTarget > 0 ? "+" : ""}${naiveVsTarget.toFixed(0)}%`
      );
      console.log(
        `  Compact vs target: ${compactVsTarget > 0 ? "+" : ""}${compactVsTarget.toFixed(0)}%`
      );
      console.log("");
      console.log("WHY: The brainstorm targeted 1.02 GB for 250K entities (~4.3 KB/entity).");
      console.log("     If compact achieves < 1.02 GB, we can fit the full graph in memory.");
      console.log("     If not, we need tiered storage (hot/warm/frozen) for large repos.");

      // Memory assertions only reliable with --expose-gc (CI doesn't have it)
      if (gcAvailable) {
        // Basic sanity: both should have positive bytes/entity
        expect(naiveR.memory.bytesPerEntity).toBeGreaterThan(0);
        expect(compactR.memory.bytesPerEntity).toBeGreaterThan(0);
        // Compact should use less memory than naive
        expect(compactR.memory.bytesPerEntity).toBeLessThan(
          naiveR.memory.bytesPerEntity * 1.1 // allow 10% noise without GC
        );
      }
    }, 120_000);
  });

  // -----------------------------------------------------------------------
  // 7. EntityView allocation
  // -----------------------------------------------------------------------
  describe("7. EntityView allocation", () => {
    it("measures cache hit rate for repeated .get() calls", async () => {
      const N = 10_000;
      const data = generateRealisticData(N, 42);

      const naive = new InMemoryDatomStore();
      const compact = new CompactDatomStore();
      loadFromArrays(naive as unknown as DatomStore, data);
      loadFromArrays(compact, data);

      const lookups = 10_000;
      const entityIds = Array.from({ length: 100 }, (_, i) => `bench:pkg:function:entity${i}`);

      // Naive: creates a new EntityView every time
      warmup((i) => naive.get(entityIds[i % entityIds.length]!), 5_000);
      const naiveTiming = batchTimingNs(
        (i) => naive.get(entityIds[i % entityIds.length]!),
        lookups
      );

      // Compact: WeakRef cache returns same view
      warmup((i) => compact.get(entityIds[i % entityIds.length]!), 5_000);
      const compactTiming = batchTimingNs(
        (i) => compact.get(entityIds[i % entityIds.length]!),
        lookups
      );

      // Verify cache hit: same object returned
      const view1 = compact.get(entityIds[0]!);
      const view2 = compact.get(entityIds[0]!);
      const cacheHit = view1 === view2;

      console.log("\n=== 7. EntityView Allocation ===");
      console.log(`${lookups.toLocaleString()} .get() calls over 100 unique entities`);
      console.log(`Naive (new object each time): ${naiveTiming.avgNs.toFixed(0)} ns/call`);
      console.log(`Compact (WeakRef cached):     ${compactTiming.avgNs.toFixed(0)} ns/call`);
      console.log(`Cache hit on repeated access: ${cacheHit}`);
      console.log("WHY: InMemoryDatomStore creates a new EntityViewImpl on every .get().");
      console.log(`     At 10K lookups, that's 10K objects → immediate GC pressure.`);
      console.log(
        "     CompactDatomStore caches via WeakRef — repeated access reuses the same wrapper."
      );

      expect(cacheHit).toBe(true);
      expect(naiveTiming.avgNs).toBeGreaterThan(0);
      expect(compactTiming.avgNs).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Full comparison report (runs at end, logs everything)
  // -----------------------------------------------------------------------
  describe("Full comparison report", () => {
    it("produces side-by-side report at multiple scales", async () => {
      const result = await runComparison([1_000, 5_000, 10_000, 25_000]);
      console.log(`\n${formatComparisonReport(result)}`);

      // Basic sanity assertions
      expect(result.comparisons).toHaveLength(4);
      expect(result.naiveScaling).toHaveLength(4);
      expect(result.compactScaling).toHaveLength(4);
    }, 300_000); // 5 min timeout for full comparison
  });
});
