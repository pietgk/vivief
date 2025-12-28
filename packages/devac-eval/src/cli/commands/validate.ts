/**
 * Validate command - validates benchmark question files
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ValidationResult, validateBenchmark } from "../../benchmark/question-validator.js";

export interface ValidateCommandOptions {
  format: string;
}

export async function validateCommand(
  path: string,
  options: ValidateCommandOptions
): Promise<void> {
  const filePath = resolve(path);

  // Load file
  let content: unknown;
  try {
    const raw = await readFile(filePath, "utf-8");
    content = JSON.parse(raw);
  } catch (error) {
    console.error(`Error: Could not read or parse '${filePath}'`);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Validate
  const result = validateBenchmark(content);

  // Output
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    outputTextResult(filePath, result);
  }

  // Exit code
  if (!result.valid) {
    process.exit(1);
  }
}

function outputTextResult(path: string, result: ValidationResult): void {
  console.log(`\nValidating: ${path}\n`);

  if (result.valid) {
    console.log("✓ Benchmark is valid\n");
  } else {
    console.log("✗ Benchmark has validation errors\n");
  }

  if (result.errors.length > 0) {
    console.log("Errors:");
    for (const error of result.errors) {
      console.log(`  ✗ ${error.path}: ${error.message}`);
    }
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`  ⚠ ${warning.path}: ${warning.message}`);
    }
    console.log();
  }

  // Summary
  const summary = [];
  if (result.errors.length > 0) {
    summary.push(`${result.errors.length} error(s)`);
  }
  if (result.warnings.length > 0) {
    summary.push(`${result.warnings.length} warning(s)`);
  }
  if (summary.length > 0) {
    console.log(`Summary: ${summary.join(", ")}`);
  }
}
