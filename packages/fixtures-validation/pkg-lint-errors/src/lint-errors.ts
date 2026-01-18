/**
 * INTENTIONAL LINT ERRORS FOR TESTING
 *
 * This file contains intentional Biome lint violations to test
 * the validation system's ability to detect and report them.
 *
 * Expected errors/warnings:
 * - noUnusedVariables (error): unusedVariable is never read
 * - noUnusedImports (error): path is imported but never used
 * - useConst (error): using let for variables that are never reassigned
 * - noExplicitAny (warn): explicit any type
 * - noNonNullAssertion (warn): non-null assertion operator
 * - noAssignInExpressions (warn): assignment in expression
 * - noForEach (warn): using forEach instead of for...of
 */

// biome-ignore-next-line lint/correctness/noUnusedImports: intentional for testing
import * as path from "node:path";

// Error: noUnusedVariables - this variable is never read
// biome-ignore lint/correctness/noUnusedVariables: intentional for testing
const unusedVariable = "I am never used";

// Error: useConst - should use const instead of let
// biome-ignore lint/style/useConst: intentional for testing
let neverReassigned = "I am never reassigned but declared with let";

// Warning: noExplicitAny - explicit any type
// biome-ignore lint/suspicious/noExplicitAny: intentional for testing
function processData(data: any): void {
  console.log(data);
}

// Warning: noNonNullAssertion - using non-null assertion
function getLength(value: string | null): number {
  // biome-ignore lint/style/noNonNullAssertion: intentional for testing
  return value!.length;
}

// Warning: noAssignInExpressions - assignment in expression
function parseNumber(input: string): number | null {
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional for testing
  let result: number | null;
  if ((result = Number.parseFloat(input)) && !Number.isNaN(result)) {
    return result;
  }
  return null;
}

// Warning: noForEach - using forEach instead of for...of
function logItems(items: string[]): void {
  // biome-ignore lint/complexity/noForEach: intentional for testing
  items.forEach((item) => {
    console.log(item);
  });
}

// Warning: noImplicitAnyLet - let without type annotation
// biome-ignore lint/suspicious/noImplicitAnyLet: intentional for testing
let implicitAny;

// Additional unused variable
// biome-ignore lint/correctness/noUnusedVariables: intentional for testing
const anotherUnused = 123;

// Export some functions to avoid additional unused errors
export { processData, getLength, parseNumber, logItems, neverReassigned };

// Initialize implicitAny to avoid more errors
implicitAny = "value";
export { implicitAny };
