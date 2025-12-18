/**
 * TypeScript test fixtures for DevAC parsers
 *
 * This package contains sample TypeScript/TSX files used for testing
 * the TypeScript parser implementation.
 *
 * Usage in tests:
 *   import { getFixturePath, FIXTURES_DIR } from "@pietgk/devac-fixtures-typescript";
 *   const filePath = getFixturePath("sample-class.ts");
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Directory containing all TypeScript fixtures */
export const FIXTURES_DIR = __dirname;

/** Get the absolute path to a fixture file */
export function getFixturePath(filename: string): string {
  return path.join(FIXTURES_DIR, filename);
}

/** Available fixture files */
export const fixtures = {
  // Sample files for comprehensive parsing tests
  "sample-class": "sample-class.ts",
  "sample-functions": "sample-functions.ts",
  "sample-jsx": "sample-jsx.tsx",
  "sample-decorators": "sample-decorators.ts",
  "sample-generics": "sample-generics.ts",
  "sample-advanced-types": "sample-advanced-types.ts",
  "sample-modules": "sample-modules.ts",
  "sample-edge-cases": "sample-edge-cases.ts",

  // Simple files for basic tests
  "hello": "hello.ts",
  "valid": "valid.ts",
  "pending": "pending.ts",
  "new-file": "new-file.ts",

  // Performance test files
  "perf-test": "perf-test.ts",
  "perf-test-warm": "perf-test-warm.ts",
  "watch-perf-test": "watch-perf-test.ts",
  "rapid-0": "rapid-0.ts",
  "rapid-1": "rapid-1.ts",
  "rapid-2": "rapid-2.ts",

  // Intentionally broken files (renamed to .txt to avoid IDE errors)
  "error": "error.ts.txt",
  "invalid": "invalid.ts.txt",
} as const;

export type FixtureName = keyof typeof fixtures;
