/**
 * Generate Command
 *
 * Generates reference Storybook stories from axe-core rule metadata and fixtures.
 */

import { resolve } from "node:path";
import type { Command } from "commander";
import {
  extractComponentRules,
  extractRulesByLevel,
  getAxeCoreVersion,
  getExtractionSummary,
} from "../lib/axe-rule-extractor.js";
import { extractFixturesForRules, getBuiltinFixtureRules } from "../lib/fixture-extractor.js";
import { generateAndWriteManifest } from "../lib/manifest-generator.js";
import { generateIndexFile, generateStories } from "../lib/story-generator.js";
import type { CommandRegister, GenerateOptions } from "./types.js";
import { printError, printOutput, printVerbose } from "./types.js";

/**
 * Register the generate command
 */
export const registerGenerateCommand: CommandRegister = (program: Command) => {
  program
    .command("generate")
    .description("Generate reference stories from axe-core rules and fixtures")
    .option(
      "-o, --output <dir>",
      "Output directory for generated stories",
      "src/stories/_generated"
    )
    .option(
      "--wcag-levels <levels>",
      "WCAG levels to include (comma-separated)",
      "wcag2a,wcag2aa,wcag21aa"
    )
    .option("--dry-run", "Show what would be generated without writing files", false)
    .option("-f, --force", "Overwrite existing generated files", false)
    .option("-v, --verbose", "Verbose output", false)
    .option("--json", "Output results as JSON", false)
    .option("--component-only", "Only generate component-level rules (skip page-level)", false)
    .action(async (options: GenerateOptions) => {
      try {
        await runGenerate(options);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};

/**
 * Run the generate command
 */
async function runGenerate(options: GenerateOptions): Promise<void> {
  const startTime = performance.now();

  printVerbose("Starting story generation...", options);
  printVerbose(`axe-core version: ${getAxeCoreVersion()}`, options);

  // Parse WCAG levels from comma-separated string
  const wcagLevels = options.wcagLevels
    ? options.wcagLevels.split(",").map((s) => s.trim())
    : ["wcag2a", "wcag2aa", "wcag21aa"];

  // Resolve output directory
  const outputDir = resolve(options.output ?? "src/stories/_generated");

  printVerbose(`WCAG levels: ${wcagLevels.join(", ")}`, options);
  printVerbose(`Output directory: ${outputDir}`, options);

  if (options.dryRun) {
    console.log("\n📋 DRY RUN MODE - no files will be written\n");
  }

  // Step 1: Extract rules from axe-core
  console.log("📚 Extracting rules from axe-core...");
  const allRules = (options as { componentOnly?: boolean }).componentOnly
    ? extractComponentRules()
    : extractRulesByLevel(wcagLevels);

  const rulesSummary = getExtractionSummary(allRules);
  printVerbose(
    `Found ${allRules.length} rules (${rulesSummary.componentLevel} component, ${rulesSummary.pageLevel} page)`,
    options
  );

  // Step 2: Extract fixtures for rules
  console.log("🔧 Extracting fixtures for rules...");
  const builtinRules = getBuiltinFixtureRules();
  const ruleIds = allRules.map((r) => r.ruleId);
  const rulesWithFixtures = ruleIds.filter((id) => builtinRules.includes(id));

  printVerbose(`Rules with built-in fixtures: ${rulesWithFixtures.length}`, options);

  const fixturesMap = await extractFixturesForRules(ruleIds, {
    fetchFromGitHub: false, // Only use built-in fixtures for now
  });

  let fixtureCount = 0;
  for (const fixtures of fixturesMap.values()) {
    fixtureCount += fixtures.length;
  }
  printVerbose(`Extracted ${fixtureCount} fixtures total`, options);

  // Step 3: Generate story files
  console.log("✍️  Generating story files...");
  const generationResult = generateStories(allRules, fixturesMap, {
    outputDir,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
  });

  printVerbose(
    `Generated ${generationResult.filesWritten} files, skipped ${generationResult.filesSkipped}`,
    options
  );

  if (generationResult.errors.length > 0) {
    console.log("\n⚠️  Errors encountered:");
    for (const error of generationResult.errors) {
      console.log(`  - ${error}`);
    }
  }

  // Step 4: Generate index file
  if (!options.dryRun) {
    console.log("📇 Generating index file...");
    generateIndexFile(generationResult.stories, outputDir, options.dryRun ?? false);
  }

  // Step 5: Generate manifest
  console.log("📄 Generating manifest...");
  if (!options.dryRun) {
    const manifestOutputDir = resolve(".");
    generateAndWriteManifest(allRules, generationResult.stories, manifestOutputDir);
  }

  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Output results
  if (options.json) {
    const jsonResult = {
      success: true,
      duration: `${duration}s`,
      axeCoreVersion: getAxeCoreVersion(),
      rules: {
        total: allRules.length,
        component: rulesSummary.componentLevel,
        page: rulesSummary.pageLevel,
        withFixtures: rulesWithFixtures.length,
      },
      stories: {
        total: generationResult.totalStories,
        filesWritten: generationResult.filesWritten,
        filesSkipped: generationResult.filesSkipped,
      },
      output: outputDir,
      dryRun: options.dryRun ?? false,
      errors: generationResult.errors,
    };
    printOutput(jsonResult, options);
  } else {
    console.log(`\n${"=".repeat(50)}`);
    console.log("✅ Generation Complete");
    console.log("=".repeat(50));
    console.log(`\n⏱  Duration: ${duration}s`);
    console.log(`📦 axe-core version: ${getAxeCoreVersion()}`);
    console.log("\n📚 Rules:");
    console.log(`   Total: ${allRules.length}`);
    console.log(`   Component-level: ${rulesSummary.componentLevel}`);
    console.log(`   Page-level: ${rulesSummary.pageLevel}`);
    console.log(`   With fixtures: ${rulesWithFixtures.length}`);
    console.log("\n✍️  Stories:");
    console.log(`   Total generated: ${generationResult.totalStories}`);
    console.log(`   Files written: ${generationResult.filesWritten}`);
    console.log(`   Files skipped: ${generationResult.filesSkipped}`);
    console.log(`\n📁 Output: ${outputDir}`);

    if (options.dryRun) {
      console.log("\n📋 This was a dry run - no files were written");
    } else {
      console.log("\n📄 Manifest written to: a11y-rule-manifest.json");
    }

    if (generationResult.errors.length > 0) {
      console.log(`\n⚠️  ${generationResult.errors.length} error(s) occurred`);
    }
  }
}

export { runGenerate };
