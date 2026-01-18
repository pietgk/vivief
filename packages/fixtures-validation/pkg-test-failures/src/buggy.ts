/**
 * Functions with intentional bugs that cause test failures.
 * These are used to test the validation system's test detection capabilities.
 */

/**
 * BUGGY: Off-by-one error - should add a+b, but adds a+b+1
 */
export function buggyAdd(a: number, b: number): number {
  return a + b + 1; // Bug: adds extra 1
}

/**
 * BUGGY: Wrong operation - should subtract, but multiplies
 */
export function buggySubtract(a: number, b: number): number {
  return a * b; // Bug: multiplies instead of subtracts
}

/**
 * BUGGY: Returns wrong type format
 */
export function buggyFormatName(first: string, last: string): string {
  return `${last}, ${first}`; // Bug: returns "last, first" instead of "first last"
}

/**
 * BUGGY: Array operation returns wrong result
 */
export function buggySum(numbers: number[]): number {
  let sum = 0;
  for (let i = 0; i <= numbers.length; i++) {
    // Bug: off-by-one, accesses undefined
    sum += numbers[i] || 0;
  }
  return sum - 1; // Bug: subtracts 1
}

/**
 * BUGGY: Async function that rejects unexpectedly
 */
export async function buggyFetch(url: string): Promise<string> {
  // Bug: always throws regardless of input
  throw new Error(`Failed to fetch ${url}`);
}

/**
 * WORKING: This function works correctly (for control)
 */
export function workingMultiply(a: number, b: number): number {
  return a * b;
}
