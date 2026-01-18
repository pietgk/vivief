/**
 * INTENTIONAL LINT ERRORS FOR TESTING
 *
 * This package contains intentional Biome lint violations to test the
 * validation system's lint detection capabilities.
 *
 * DO NOT FIX THESE ERRORS - they are here intentionally.
 */

export * from "./lint-errors.js";

// More lint errors in the main entry point

// biome-ignore-next-line lint/correctness/noUnusedImports: intentional for testing
import { readFileSync } from "node:fs";

// biome-ignore lint/correctness/noUnusedVariables: intentional for testing
const indexUnused = "unused in index";

// biome-ignore lint/style/useConst: intentional for testing
let indexNeverReassigned = 42;

// biome-ignore lint/suspicious/noExplicitAny: intentional for testing
export function unsafeProcess(input: any): string {
  return String(input);
}

// biome-ignore lint/correctness/noUnusedVariables: intentional for testing
function privateUnusedFunction(): void {
  // This function is never called
}

export { indexNeverReassigned };
