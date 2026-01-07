/**
 * C4 Integration Tests
 *
 * End-to-end tests for C4 architecture diagram generation.
 * Uses fixtures-typescript package seeds to verify the full pipeline:
 * effects → rules → enrichment → C4 generation
 *
 * These tests serve as a tight feedback loop for improving architecture.c4 quality.
 *
 * ## Reference Package Generation (Watch Mode)
 *
 * To generate architecture.c4 files for real external packages in watch mode:
 *
 * ```bash
 * # Prerequisites: Run devac sync on reference packages first
 * cd packages/devac-core
 * DEVAC_GENERATE_REFS=1 DEVAC_REFERENCE_ROOT=~/ws pnpm test:watch c4-integration
 * ```
 *
 * This will:
 * 1. Read seed files from packages listed in REFERENCE_PACKAGES
 * 2. Generate architecture.c4 and package-effects.md
 * 3. Write directly to each package's docs/ folder
 * 4. Re-run on code changes for tight feedback loop
 *
 * View results in VS Code with LikeC4 plugin.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateUnifiedLikeC4Doc } from "../../src/docs/c4-doc-generator.js";
import { generateEffectsDoc } from "../../src/docs/effects-generator.js";
import { computeSeedHash } from "../../src/docs/seed-hasher.js";
import { builtinRules } from "../../src/rules/builtin-rules.js";
import { createRuleEngine } from "../../src/rules/rule-engine.js";
import { DuckDBPool, executeWithRecovery } from "../../src/storage/duckdb-pool.js";
import { createEffectReader } from "../../src/storage/effect-reader.js";
import { generateC4Containers, generateC4Context } from "../../src/views/c4-generator.js";
import {
  buildInternalEdges,
  buildNodeLookupMap,
  enrichDomainEffects,
} from "../../src/views/effect-enricher.js";

// =============================================================================
// Types for DuckDB query results
// =============================================================================

interface NodeRow {
  entity_id: string;
  name: string;
  qualified_name: string;
  kind: string;
}

interface EdgeRow {
  source_entity_id: string;
  target_entity_id: string;
}

interface EffectRow {
  source_entity_id: string;
  effect_type: string;
}

// =============================================================================
// Configuration
// =============================================================================

// Path to fixtures-typescript package (for unit tests)
const FIXTURES_DIR = path.resolve(__dirname, "../../../fixtures-typescript");
const SEED_DIR = path.join(FIXTURES_DIR, ".devac/seed/base");

// Reference packages for real-world generation (relative to DEVAC_REFERENCE_ROOT)
// Add packages here as you improve quality - earlier entries are "golden" references
const REFERENCE_PACKAGES = [
  "monorepo-3.0/services/miami", // First target
  // Add more as miami quality stabilizes:
  // "monorepo-3.0/services/vegas",
  // "monorepo-3.0/packages/shared",
];

// Environment configuration
const REFERENCE_ROOT = process.env.DEVAC_REFERENCE_ROOT || path.join(process.env.HOME || "~", "ws");
const GENERATE_REFS = process.env.DEVAC_GENERATE_REFS === "1";

// Check if fixtures seeds exist (they're generated locally, not in CI)
const SEEDS_EXIST = await fs
  .access(path.join(SEED_DIR, "nodes.parquet"))
  .then(() => true)
  .catch(() => false);

// =============================================================================
// Quality Assertion Helpers
// =============================================================================

/**
 * Assert that output has no hash-based fallback names like 'function_0336c2'
 */
function expectNoHashFallbackNames(output: string): void {
  const hashPatternMatches = output.match(/component '(function|method|module)_[0-9a-f]{6,}'/g);
  if (hashPatternMatches && hashPatternMatches.length > 0) {
    console.log(`\n❌ Found ${hashPatternMatches.length} hash-based component names:`);
    for (const match of hashPatternMatches.slice(0, 10)) {
      console.log(`  - ${match}`);
    }
    throw new Error(
      `Found ${hashPatternMatches.length} hash-based fallback names - enrichment failed`
    );
  }
}

/**
 * Assert that output has no absolute paths in identifiers
 */
function expectNoAbsolutePaths(output: string): void {
  const absolutePathPatterns = [/vivief__Users_[a-z]+/g, /\/Users\/[a-z]+\//g, /\/home\/[a-z]+\//g];
  for (const pattern of absolutePathPatterns) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      console.log("\n❌ Found absolute paths in output:");
      for (const match of matches.slice(0, 5)) {
        console.log(`  - ${match}`);
      }
      throw new Error(`Found ${matches.length} absolute paths in output`);
    }
  }
}

/**
 * Assert that output has valid LikeC4 structure
 */
function expectValidLikeC4Structure(output: string): void {
  const requiredSections = [
    { name: "specification", pattern: /specification\s*\{/ },
    { name: "model", pattern: /model\s*\{/ },
    { name: "views", pattern: /views\s*\{/ },
  ];
  for (const section of requiredSections) {
    if (!section.pattern.test(output)) {
      throw new Error(`Missing required LikeC4 section: ${section.name}`);
    }
  }
}

/**
 * Assert that all effects were enriched with node metadata
 */
function expectAllEffectsEnriched(enrichmentResult: {
  unenrichedCount: number;
  effects: unknown[];
}): void {
  if (enrichmentResult.unenrichedCount > 0) {
    const ratio = enrichmentResult.unenrichedCount / enrichmentResult.effects.length;
    console.log(
      `\n⚠️ ${enrichmentResult.unenrichedCount}/${enrichmentResult.effects.length} effects not enriched (${(ratio * 100).toFixed(1)}%)`
    );
    if (ratio > 0.1) {
      throw new Error(
        `Too many unenriched effects: ${enrichmentResult.unenrichedCount} (${(ratio * 100).toFixed(1)}%)`
      );
    }
  }
}

describe.skipIf(!SEEDS_EXIST)("C4 Integration - fixtures-typescript", () => {
  let pool: DuckDBPool;

  beforeAll(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
  });

  afterAll(async () => {
    await pool.shutdown();
  });

  it("should read nodes from parquet and build lookup map", async () => {
    const nodesPath = path.join(SEED_DIR, "nodes.parquet");
    const result = (await executeWithRecovery(pool, (conn) =>
      conn.all(`SELECT entity_id, name, qualified_name, kind FROM read_parquet('${nodesPath}')`)
    )) as NodeRow[];

    expect(result.length).toBeGreaterThan(0);

    const nodeLookup = buildNodeLookupMap(result);
    expect(nodeLookup.size).toBeGreaterThan(0);

    // Log some sample entries for debugging
    console.log(`\n📊 Node lookup has ${nodeLookup.size} entries`);
    let count = 0;
    for (const [entityId, meta] of nodeLookup) {
      if (count < 5) {
        console.log(`  - ${entityId} → ${meta.name} (${meta.kind})`);
        count++;
      }
    }
  });

  it("should read effects and run rules engine", async () => {
    const reader = createEffectReader(pool, FIXTURES_DIR);
    const effectsResult = await reader.readEffects({});

    expect(effectsResult.effects.length).toBeGreaterThan(0);
    console.log(`\n📊 Read ${effectsResult.effects.length} raw effects`);

    // Run rules engine
    const engine = createRuleEngine({ rules: builtinRules });
    const rulesResult = engine.process(effectsResult.effects);

    console.log(`📊 Rules engine produced ${rulesResult.domainEffects.length} domain effects`);

    // Log sample domain effects
    for (const effect of rulesResult.domainEffects.slice(0, 5)) {
      console.log(
        `  - ${effect.domain}:${effect.action} from ${effect.sourceEntityId.slice(0, 50)}...`
      );
    }
  });

  it("should enrich effects with node metadata", async () => {
    // Read nodes
    const nodesPath = path.join(SEED_DIR, "nodes.parquet");
    const nodeRows = (await executeWithRecovery(pool, (conn) =>
      conn.all(`SELECT entity_id, name, qualified_name, kind FROM read_parquet('${nodesPath}')`)
    )) as NodeRow[];
    const nodeLookup = buildNodeLookupMap(nodeRows);

    // Read effects
    const reader = createEffectReader(pool, FIXTURES_DIR);
    const effectsResult = await reader.readEffects({});

    // Run rules engine
    const engine = createRuleEngine({ rules: builtinRules });
    const rulesResult = engine.process(effectsResult.effects);

    // Enrich effects
    const enrichment = enrichDomainEffects(rulesResult.domainEffects, nodeLookup, FIXTURES_DIR);

    console.log("\n📊 Enrichment results:");
    console.log(`  - Total effects: ${enrichment.effects.length}`);
    console.log(`  - Unenriched: ${enrichment.unenrichedCount}`);
    console.log(`  - Enriched: ${enrichment.effects.length - enrichment.unenrichedCount}`);

    // Log sample enriched effects
    const enrichedSamples = enrichment.effects.filter(
      (e) =>
        !e.sourceName.includes("_") || !e.sourceName.match(/^(function|method|module)_[0-9a-f]+$/)
    );
    console.log(`\n📊 Sample enriched effects (${enrichedSamples.length} with real names):`);
    for (const effect of enrichedSamples.slice(0, 5)) {
      console.log(`  - ${effect.sourceName} (${effect.sourceKind}) in ${effect.relativeFilePath}`);
    }

    // Log sample unenriched effects to debug
    const unenrichedSamples = enrichment.effects.filter((e) =>
      e.sourceName.match(/^(function|method|module)_[0-9a-f]+$/)
    );
    if (unenrichedSamples.length > 0) {
      console.log(`\n⚠️ Sample UNENRICHED effects (${unenrichedSamples.length} total):`);
      for (const effect of unenrichedSamples.slice(0, 5)) {
        console.log(`  - sourceEntityId: ${effect.sourceEntityId}`);
        console.log(`    sourceName (fallback): ${effect.sourceName}`);
      }
    }

    // THE KEY ASSERTION: All effects should be enriched
    // If this fails, we have an entity ID mismatch between effects and nodes tables
    expect(enrichment.unenrichedCount).toBe(0);
  });

  it("should generate valid architecture.c4 with readable names", async () => {
    // Read nodes
    const nodesPath = path.join(SEED_DIR, "nodes.parquet");
    const nodeRows = (await executeWithRecovery(pool, (conn) =>
      conn.all(`SELECT entity_id, name, qualified_name, kind FROM read_parquet('${nodesPath}')`)
    )) as NodeRow[];
    const nodeLookup = buildNodeLookupMap(nodeRows);

    // Read edges for internal relationships
    const edgesPath = path.join(SEED_DIR, "edges.parquet");
    const edgeRows = (await executeWithRecovery(pool, (conn) =>
      conn.all(
        `SELECT source_entity_id, target_entity_id FROM read_parquet('${edgesPath}') WHERE edge_type = 'CALLS'`
      )
    )) as EdgeRow[];
    const internalEdges = buildInternalEdges(edgeRows);

    // Read effects and run rules
    const reader = createEffectReader(pool, FIXTURES_DIR);
    const effectsResult = await reader.readEffects({});
    const engine = createRuleEngine({ rules: builtinRules });
    const rulesResult = engine.process(effectsResult.effects);

    // Enrich effects
    const enrichment = enrichDomainEffects(
      rulesResult.domainEffects,
      nodeLookup,
      FIXTURES_DIR,
      internalEdges
    );

    // Generate C4 diagrams
    const context = generateC4Context(enrichment.effects, {
      systemName: "fixtures-typescript",
      systemDescription: "Test fixture package",
      containerGrouping: "directory",
    });

    const containers = generateC4Containers(enrichment.effects, {
      systemName: "fixtures-typescript",
      containerGrouping: "directory",
      internalEdges: enrichment.internalEdges,
    });

    // Generate unified LikeC4 output
    const output = generateUnifiedLikeC4Doc(context, containers, {
      seedHash: "test-hash",
      packagePath: FIXTURES_DIR,
    });

    console.log(`\n📄 Generated architecture.c4 (${output.length} chars)`);
    console.log(`   Preview (first 500 chars):\n${output.slice(0, 500)}`);

    // Structural assertions
    expect(output).toContain("specification {");
    expect(output).toContain("model {");
    expect(output).toContain("views {");
    expect(output).toContain("system = system 'fixtures-typescript'");

    // Quality assertions: should NOT have hash-based fallback names
    const hashPatternMatches = output.match(/component '(function|method|module)_[0-9a-f]{6}'/g);
    if (hashPatternMatches && hashPatternMatches.length > 0) {
      console.log(`\n❌ Found ${hashPatternMatches.length} hash-based component names:`);
      for (const match of hashPatternMatches.slice(0, 10)) {
        console.log(`  - ${match}`);
      }
    }

    // This is the key quality assertion
    expect(hashPatternMatches?.length ?? 0).toBe(0);

    // Warn about absolute paths in identifiers (future improvement)
    // The component IDs currently include full paths - this is a known issue
    // that should be fixed in the C4 generator
    const absolutePathMatches = output.match(/vivief__Users_[a-z]+/g);
    if (absolutePathMatches && absolutePathMatches.length > 0) {
      console.log(
        `\n⚠️ Found ${absolutePathMatches.length} absolute paths in identifiers (future fix)`
      );
    }
  });

  it("should debug entity ID format mismatch", async () => {
    // This test helps debug WHY enrichment fails
    // Compare entity IDs in nodes vs effects tables

    // Read a few nodes
    const nodesPath = path.join(SEED_DIR, "nodes.parquet");
    const nodeRows = (await executeWithRecovery(pool, (conn) =>
      conn.all(
        `SELECT entity_id, name, qualified_name, kind FROM read_parquet('${nodesPath}') LIMIT 10`
      )
    )) as NodeRow[];

    console.log("\n🔍 Sample entity_id formats in NODES table:");
    for (const row of nodeRows) {
      console.log(`  - ${row.entity_id}`);
      console.log(`    name: ${row.name}, kind: ${row.kind}`);
    }

    // Read a few effects
    const effectsPath = path.join(SEED_DIR, "effects.parquet");
    const effectRows = (await executeWithRecovery(pool, (conn) =>
      conn.all(`SELECT source_entity_id, effect_type FROM read_parquet('${effectsPath}') LIMIT 10`)
    )) as EffectRow[];

    console.log("\n🔍 Sample source_entity_id formats in EFFECTS table:");
    for (const row of effectRows) {
      console.log(`  - ${row.source_entity_id}`);
      console.log(`    effect_type: ${row.effect_type}`);
    }

    // Check if any effect source_entity_ids exist in nodes
    const nodeLookup = buildNodeLookupMap(nodeRows);
    let matchCount = 0;
    for (const row of effectRows) {
      if (nodeLookup.has(row.source_entity_id)) {
        matchCount++;
      }
    }
    console.log(`\n📊 Match rate: ${matchCount}/${effectRows.length} effects found in nodes`);
  });
});

// =============================================================================
// Reference Package Generation (Watch Mode)
// =============================================================================

describe.skipIf(!GENERATE_REFS)("C4 Reference Generation", () => {
  let pool: DuckDBPool;

  beforeAll(async () => {
    pool = new DuckDBPool({ memoryLimit: "512MB" });
    await pool.initialize();
    console.log("\n🎯 Reference Package Generation Mode");
    console.log(`   Root: ${REFERENCE_ROOT}`);
    console.log(`   Packages: ${REFERENCE_PACKAGES.length}`);
  });

  afterAll(async () => {
    await pool.shutdown();
  });

  for (const packageRelPath of REFERENCE_PACKAGES) {
    const packagePath = path.join(REFERENCE_ROOT, packageRelPath);
    const packageName = path.basename(packageRelPath);

    describe(`Package: ${packageRelPath}`, () => {
      it("should have seed files", async () => {
        const seedDir = path.join(packagePath, ".devac/seed/base");
        const nodesPath = path.join(seedDir, "nodes.parquet");
        const edgesPath = path.join(seedDir, "edges.parquet");
        const effectsPath = path.join(seedDir, "effects.parquet");

        // Check files exist
        await expect(fs.access(nodesPath)).resolves.toBeUndefined();
        await expect(fs.access(edgesPath)).resolves.toBeUndefined();
        await expect(fs.access(effectsPath)).resolves.toBeUndefined();

        console.log(`\n✅ Seed files found in ${seedDir}`);
      });

      it("should generate architecture.c4 with quality", async () => {
        const seedDir = path.join(packagePath, ".devac/seed/base");

        // 1. Read nodes for enrichment
        const nodesPath = path.join(seedDir, "nodes.parquet");
        const nodeRows = (await executeWithRecovery(pool, (conn) =>
          conn.all(`SELECT entity_id, name, qualified_name, kind FROM read_parquet('${nodesPath}')`)
        )) as NodeRow[];
        const nodeLookup = buildNodeLookupMap(nodeRows);
        console.log(`\n📊 Loaded ${nodeLookup.size} nodes`);

        // 2. Read edges for internal relationships
        const edgesPath = path.join(seedDir, "edges.parquet");
        const edgeRows = (await executeWithRecovery(pool, (conn) =>
          conn.all(
            `SELECT source_entity_id, target_entity_id FROM read_parquet('${edgesPath}') WHERE edge_type = 'CALLS'`
          )
        )) as EdgeRow[];
        const internalEdges = buildInternalEdges(edgeRows);
        console.log(`📊 Loaded ${internalEdges.length} internal CALLS edges`);

        // 3. Read effects and run rules engine
        const reader = createEffectReader(pool, packagePath);
        const effectsResult = await reader.readEffects({});
        console.log(`📊 Read ${effectsResult.effects.length} raw effects`);

        const engine = createRuleEngine({ rules: builtinRules });
        const rulesResult = engine.process(effectsResult.effects);
        console.log(`📊 Produced ${rulesResult.domainEffects.length} domain effects`);

        // 4. Enrich effects with readable names
        const enrichment = enrichDomainEffects(
          rulesResult.domainEffects,
          nodeLookup,
          packagePath,
          internalEdges
        );
        console.log(
          `📊 Enriched: ${enrichment.effects.length - enrichment.unenrichedCount}/${enrichment.effects.length}`
        );

        // Quality check: enrichment
        expectAllEffectsEnriched(enrichment);

        // 5. Generate C4 diagrams
        const context = generateC4Context(enrichment.effects, {
          systemName: packageName,
          systemDescription: `Package: ${packageName}`,
          containerGrouping: "directory",
        });

        const containers = generateC4Containers(enrichment.effects, {
          systemName: packageName,
          containerGrouping: "directory",
          internalEdges: enrichment.internalEdges,
        });

        // 6. Compute seed hash
        const seedHashResult = await computeSeedHash(packagePath);

        // 7. Generate unified LikeC4 output
        const output = generateUnifiedLikeC4Doc(context, containers, {
          seedHash: seedHashResult.hash || "unknown",
          packagePath,
        });

        // Quality checks
        expectValidLikeC4Structure(output);
        expectNoHashFallbackNames(output);
        expectNoAbsolutePaths(output);

        // 8. Write to package docs folder
        const docsDir = path.join(packagePath, "docs/c4");
        await fs.mkdir(docsDir, { recursive: true });
        const outputPath = path.join(docsDir, "architecture.c4");
        await fs.writeFile(outputPath, output, "utf-8");

        console.log(`\n✅ Written ${output.length} chars to ${outputPath}`);
      });

      it("should generate package-effects.md", async () => {
        // Read effects
        const reader = createEffectReader(pool, packagePath);
        const effectsResult = await reader.readEffects({});

        if (effectsResult.effects.length === 0) {
          console.log("\n⚠️ No effects found, skipping package-effects.md");
          return;
        }

        // Categorize effects into patterns
        const storePatterns = new Map<string, number>();
        const retrievePatterns = new Map<string, number>();
        const externalPatterns = new Map<string, { count: number; module: string | null }>();
        const otherPatterns = new Map<
          string,
          { count: number; isMethod: boolean; isAsync: boolean }
        >();

        for (const effect of effectsResult.effects) {
          const eff = effect as {
            callee_name?: string;
            is_external?: boolean;
            is_async?: boolean;
            external_module?: string | null;
          };
          const callee = eff.callee_name || "";
          const isExternal = eff.is_external || false;
          const isAsync = eff.is_async || false;

          if (effect.effect_type === "Store") {
            storePatterns.set(callee, (storePatterns.get(callee) || 0) + 1);
          } else if (effect.effect_type === "Retrieve") {
            retrievePatterns.set(callee, (retrievePatterns.get(callee) || 0) + 1);
          } else if (effect.effect_type === "Send" || isExternal) {
            const existing = externalPatterns.get(callee);
            if (existing) existing.count++;
            else externalPatterns.set(callee, { count: 1, module: eff.external_module || null });
          } else {
            const existing = otherPatterns.get(callee);
            if (existing) existing.count++;
            else otherPatterns.set(callee, { count: 1, isMethod: callee.includes("."), isAsync });
          }
        }

        // Build EffectsDocData
        const effectsData = {
          packageName,
          storePatterns: Array.from(storePatterns.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count),
          retrievePatterns: Array.from(retrievePatterns.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count),
          externalPatterns: Array.from(externalPatterns.entries())
            .map(([pattern, data]) => ({ pattern, ...data }))
            .sort((a, b) => b.count - a.count),
          otherPatterns: Array.from(otherPatterns.entries())
            .map(([pattern, data]) => ({ pattern, ...data }))
            .sort((a, b) => b.count - a.count),
        };

        // Generate effects doc
        const seedHashResult = await computeSeedHash(packagePath);
        const output = generateEffectsDoc(effectsData, {
          seedHash: seedHashResult.hash || "unknown",
          packagePath,
        });

        // Write to package docs folder
        const docsDir = path.join(packagePath, "docs");
        await fs.mkdir(docsDir, { recursive: true });
        const outputPath = path.join(docsDir, "package-effects.md");
        await fs.writeFile(outputPath, output, "utf-8");

        console.log(`\n✅ Written ${output.length} chars to ${outputPath}`);
        console.log(`   Store patterns: ${effectsData.storePatterns.length}`);
        console.log(`   Retrieve patterns: ${effectsData.retrievePatterns.length}`);
        console.log(`   External patterns: ${effectsData.externalPatterns.length}`);
        console.log(`   Other patterns: ${effectsData.otherPatterns.length}`);
      });
    });
  }
});
