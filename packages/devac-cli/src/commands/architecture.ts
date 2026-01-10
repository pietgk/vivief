/**
 * Architecture Command Implementation
 *
 * Commands for managing architecture documentation and computing gap metrics.
 * Part of the Architecture Documentation Improvement Loop.
 *
 * @see docs/plans/gap-metrics.md
 * @see plugins/devac/skills/validate-architecture/SKILL.md
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DEFAULT_GAP_TARGETS,
  type GapAnalysis,
  type GapAnalysisOptions,
  analyzeGap,
  builtinGroupingRules,
  builtinSignificanceRules,
  formatGapAnalysis,
  parsePackageC4Files,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput } from "./output-formatter.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for architecture commands
 */
export interface ArchitectureOptions {
  /** Package path */
  packagePath: string;
  /** Output as JSON */
  json?: boolean;
  /** Show verbose output */
  verbose?: boolean;
  /** Include rule analysis in output */
  withRules?: boolean;
  /** Show target comparisons */
  showTargets?: boolean;
}

/**
 * Result from architecture status command
 */
export interface ArchitectureStatusResult {
  success: boolean;
  output: string;
  status: "fresh" | "stale" | "missing";
  details?: {
    hasValidated: boolean;
    hasGenerated: boolean;
    validatedModified?: string;
    generatedModified?: string;
    seedHash?: string;
  };
  error?: string;
}

/**
 * Result from architecture score command
 */
export interface ArchitectureScoreResult {
  success: boolean;
  output: string;
  analysis?: GapAnalysis;
  error?: string;
}

/**
 * Result from architecture diff command
 */
export interface ArchitectureDiffResult {
  success: boolean;
  output: string;
  diff?: {
    addedContainers: string[];
    removedContainers: string[];
    addedRelationships: string[];
    removedRelationships: string[];
    addedExternals: string[];
    removedExternals: string[];
  };
  error?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get paths to architecture files in a package
 */
function getArchitecturePaths(packagePath: string) {
  const c4Dir = path.join(packagePath, "docs", "c4");
  return {
    c4Dir,
    validatedMd: path.join(c4Dir, "architecture-validated.md"),
    validatedC4: path.join(c4Dir, "architecture-validated.c4"),
    generatedC4: path.join(c4Dir, "architecture.c4"),
    reasoningMd: path.join(c4Dir, "architecture.reasoning.md"),
    // Legacy files
    legacyMd: path.join(c4Dir, "architecture.md"),
  };
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file modification time
 */
async function getModTime(filePath: string): Promise<Date | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

/**
 * Read seed hash from .devac directory
 */
async function getSeedHash(packagePath: string): Promise<string | null> {
  const hashFile = path.join(packagePath, ".devac", "seed", "base", "content-hash.txt");
  try {
    const content = await fs.readFile(hashFile, "utf-8");
    return content.trim();
  } catch {
    return null;
  }
}

// =============================================================================
// Status Command
// =============================================================================

/**
 * Check architecture documentation status
 *
 * Determines if architecture docs are fresh, stale, or missing.
 */
export async function architectureStatusCommand(
  options: ArchitectureOptions
): Promise<ArchitectureStatusResult> {
  const pkgPath = path.resolve(options.packagePath);
  const paths = getArchitecturePaths(pkgPath);

  try {
    const hasValidated = await fileExists(paths.validatedC4);
    const hasGenerated = await fileExists(paths.generatedC4);
    const hasLegacy = await fileExists(paths.legacyMd);
    const validatedModTime = await getModTime(paths.validatedC4);
    const generatedModTime = await getModTime(paths.generatedC4);
    const seedHash = await getSeedHash(pkgPath);

    // Determine status
    let status: "fresh" | "stale" | "missing";
    let statusExplanation: string;

    if (!hasValidated && !hasLegacy) {
      status = "missing";
      statusExplanation = "No architecture documentation found";
    } else if (!hasValidated && hasLegacy) {
      status = "stale";
      statusExplanation = "Legacy architecture.md exists but no validated files";
    } else if (hasValidated && hasGenerated) {
      // Compare modification times - if generated is newer, validated may be stale
      if (validatedModTime && generatedModTime && generatedModTime > validatedModTime) {
        status = "stale";
        statusExplanation = "Generated file is newer than validated - regeneration needed";
      } else {
        status = "fresh";
        statusExplanation = "Architecture documentation is up to date";
      }
    } else if (hasValidated && !hasGenerated) {
      status = "fresh";
      statusExplanation = "Validated exists, no generated file to compare";
    } else {
      status = "missing";
      statusExplanation = "Architecture documentation incomplete";
    }

    const details = {
      hasValidated,
      hasGenerated,
      validatedModified: validatedModTime?.toISOString(),
      generatedModified: generatedModTime?.toISOString(),
      seedHash: seedHash ?? undefined,
    };

    // Format output
    let output: string;
    if (options.json) {
      output = formatOutput({ status, details, explanation: statusExplanation }, { json: true });
    } else {
      const statusIcon = status === "fresh" ? "✓" : status === "stale" ? "⚠️" : "✗";
      const lines = [
        `${statusIcon} Architecture Status: ${status.toUpperCase()}`,
        `   ${statusExplanation}`,
        "",
        "Files:",
        `   architecture-validated.c4: ${hasValidated ? "✓" : "✗"}`,
        `   architecture.c4 (generated): ${hasGenerated ? "✓" : "✗"}`,
      ];

      if (validatedModTime) {
        lines.push(`   Last validated: ${validatedModTime.toLocaleString()}`);
      }
      if (seedHash) {
        lines.push(`   Seed hash: ${seedHash.substring(0, 8)}...`);
      }

      output = lines.join("\n");
    }

    return {
      success: true,
      output,
      status,
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ success: false, error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
      status: "missing",
      error: errorMessage,
    };
  }
}

// =============================================================================
// Score Command
// =============================================================================

/**
 * Calculate gap metrics between validated and generated architecture
 */
export async function architectureScoreCommand(
  options: ArchitectureOptions
): Promise<ArchitectureScoreResult> {
  const pkgPath = path.resolve(options.packagePath);
  const paths = getArchitecturePaths(pkgPath);

  try {
    // Check both files exist
    const hasValidated = await fileExists(paths.validatedC4);
    const hasGenerated = await fileExists(paths.generatedC4);

    if (!hasValidated) {
      return {
        success: false,
        output: options.json
          ? formatOutput(
              { success: false, error: "No architecture-validated.c4 found" },
              { json: true }
            )
          : "Error: No architecture-validated.c4 found. Run /validate-architecture first.",
        error: "No architecture-validated.c4 found",
      };
    }

    if (!hasGenerated) {
      return {
        success: false,
        output: options.json
          ? formatOutput({ success: false, error: "No architecture.c4 found" }, { json: true })
          : "Error: No architecture.c4 found. Run `devac c4` to generate.",
        error: "No architecture.c4 found",
      };
    }

    // Parse both files using temp directory isolation
    const { validated, generated } = await parsePackageC4Files(pkgPath);

    if (!validated) {
      return {
        success: false,
        output: options.json
          ? formatOutput(
              { success: false, error: "Failed to parse architecture-validated.c4" },
              { json: true }
            )
          : "Error: Failed to parse architecture-validated.c4",
        error: "Failed to parse architecture-validated.c4",
      };
    }

    if (!generated) {
      return {
        success: false,
        output: options.json
          ? formatOutput(
              { success: false, error: "Failed to parse architecture.c4" },
              { json: true }
            )
          : "Error: Failed to parse architecture.c4",
        error: "Failed to parse architecture.c4",
      };
    }

    // Build analysis options
    const analysisOptions: GapAnalysisOptions = {
      verbose: options.verbose,
    };

    // Include builtin rules if requested
    if (options.withRules) {
      analysisOptions.groupingRules = builtinGroupingRules;
      analysisOptions.significanceRules = builtinSignificanceRules;
    }

    // Calculate gap metrics
    const analysis = analyzeGap(validated, generated, analysisOptions);

    // Format output
    const output = options.json
      ? formatOutput(
          {
            compositeScore: analysis.compositeScore,
            targets: DEFAULT_GAP_TARGETS,
            containerF1: analysis.containerF1.score,
            signalToNoise: analysis.signalToNoise.score,
            relationshipF1: analysis.relationshipF1.score,
            externalF1: analysis.externalF1.score,
            details: {
              container: analysis.containerF1.details,
              relationship: analysis.relationshipF1.details,
              external: analysis.externalF1.details,
            },
            ruleAnalysis: analysis.ruleAnalysis
              ? {
                  grouping: {
                    containersIdentified: analysis.ruleAnalysis.grouping.containersIdentified,
                    unmatched: analysis.ruleAnalysis.grouping.unmatched,
                    matchedRules: analysis.ruleAnalysis.grouping.matchedRules,
                    layerCoverage: Object.fromEntries(analysis.ruleAnalysis.grouping.layerCoverage),
                  },
                  significance: analysis.ruleAnalysis.significance,
                }
              : undefined,
          },
          { json: true }
        )
      : formatGapAnalysis(analysis, { verbose: options.verbose });

    return {
      success: true,
      output,
      analysis,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ success: false, error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Diff Command
// =============================================================================

/**
 * Show structural differences between validated and generated architecture
 */
export async function architectureDiffCommand(
  options: ArchitectureOptions
): Promise<ArchitectureDiffResult> {
  const pkgPath = path.resolve(options.packagePath);
  const paths = getArchitecturePaths(pkgPath);

  try {
    // Check both files exist
    const hasValidated = await fileExists(paths.validatedC4);
    const hasGenerated = await fileExists(paths.generatedC4);

    if (!hasValidated || !hasGenerated) {
      const missing = !hasValidated ? "architecture-validated.c4" : "architecture.c4";
      return {
        success: false,
        output: options.json
          ? formatOutput({ success: false, error: `Missing ${missing}` }, { json: true })
          : `Error: Missing ${missing}`,
        error: `Missing ${missing}`,
      };
    }

    // Parse both files using temp directory isolation
    const { validated, generated } = await parsePackageC4Files(pkgPath);

    if (!validated || !generated) {
      return {
        success: false,
        output: options.json
          ? formatOutput(
              { success: false, error: "Failed to parse architecture files" },
              { json: true }
            )
          : "Error: Failed to parse architecture files",
        error: "Failed to parse architecture files",
      };
    }

    // Calculate differences
    const validatedContainers = new Set([...validated.containers.keys()]);
    const generatedContainers = new Set([...generated.containers.keys()]);

    const addedContainers = [...generatedContainers].filter((c) => !validatedContainers.has(c));
    const removedContainers = [...validatedContainers].filter((c) => !generatedContainers.has(c));

    // Relationship diffs
    const getRelKey = (source: string, target: string) => `${source}->${target}`;
    const validatedRels = new Set<string>();
    const generatedRels = new Set<string>();

    for (const rels of validated.relationshipsBySource.values()) {
      for (const rel of rels) {
        validatedRels.add(getRelKey(rel.source, rel.target));
      }
    }
    for (const rels of generated.relationshipsBySource.values()) {
      for (const rel of rels) {
        generatedRels.add(getRelKey(rel.source, rel.target));
      }
    }

    const addedRelationships = [...generatedRels].filter((r) => !validatedRels.has(r));
    const removedRelationships = [...validatedRels].filter((r) => !generatedRels.has(r));

    // External diffs
    const validatedExternals = new Set([...validated.externals.keys()]);
    const generatedExternals = new Set([...generated.externals.keys()]);

    const addedExternals = [...generatedExternals].filter((e) => !validatedExternals.has(e));
    const removedExternals = [...validatedExternals].filter((e) => !generatedExternals.has(e));

    const diff = {
      addedContainers,
      removedContainers,
      addedRelationships,
      removedRelationships,
      addedExternals,
      removedExternals,
    };

    // Format output
    let output: string;
    if (options.json) {
      output = formatOutput(diff, { json: true });
    } else {
      const lines = [
        "═══════════════════════════════════════════════════════════",
        "                  ARCHITECTURE DIFF                        ",
        "═══════════════════════════════════════════════════════════",
        "",
      ];

      if (removedContainers.length > 0) {
        lines.push("MISSING CONTAINERS (in validated, not in generated):");
        for (const c of removedContainers) {
          lines.push(`  - ${c}`);
        }
        lines.push("");
      }

      if (addedContainers.length > 0) {
        lines.push("EXTRA CONTAINERS (in generated, not in validated):");
        for (const c of addedContainers.slice(0, 10)) {
          lines.push(`  + ${c}`);
        }
        if (addedContainers.length > 10) {
          lines.push(`  ... and ${addedContainers.length - 10} more`);
        }
        lines.push("");
      }

      if (removedRelationships.length > 0) {
        lines.push("MISSING RELATIONSHIPS:");
        for (const r of removedRelationships.slice(0, 10)) {
          lines.push(`  - ${r}`);
        }
        if (removedRelationships.length > 10) {
          lines.push(`  ... and ${removedRelationships.length - 10} more`);
        }
        lines.push("");
      }

      if (addedRelationships.length > 0) {
        lines.push("EXTRA RELATIONSHIPS:");
        for (const r of addedRelationships.slice(0, 10)) {
          lines.push(`  + ${r}`);
        }
        if (addedRelationships.length > 10) {
          lines.push(`  ... and ${addedRelationships.length - 10} more`);
        }
        lines.push("");
      }

      if (
        removedContainers.length === 0 &&
        addedContainers.length === 0 &&
        removedRelationships.length === 0 &&
        addedRelationships.length === 0
      ) {
        lines.push("✓ No structural differences found");
      }

      output = lines.join("\n");
    }

    return {
      success: true,
      output,
      diff,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? formatOutput({ success: false, error: errorMessage }, { json: true })
        : `Error: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the architecture command with the CLI program
 */
export function registerArchitectureCommand(program: Command): void {
  const archCmd = program
    .command("architecture")
    .alias("arch")
    .description("Manage architecture documentation and compute gap metrics");

  // architecture status subcommand
  archCmd
    .command("status")
    .description("Check if architecture documentation needs updating")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await architectureStatusCommand({
        packagePath: options.package,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // architecture score subcommand
  archCmd
    .command("score")
    .description("Calculate gap metrics between validated and generated architecture")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Show detailed breakdown")
    .option("--with-rules", "Include grouping/significance rule analysis")
    .option("--show-targets", "Show target comparisons for each metric")
    .action(async (options) => {
      const result = await architectureScoreCommand({
        packagePath: options.package,
        json: options.json,
        verbose: options.verbose,
        withRules: options.withRules,
        showTargets: options.showTargets,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // architecture diff subcommand
  archCmd
    .command("diff")
    .description("Show structural differences between validated and generated")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await architectureDiffCommand({
        packagePath: options.package,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
