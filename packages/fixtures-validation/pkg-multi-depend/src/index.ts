/**
 * Multi-dependency fixture package.
 *
 * This package depends on pkg-clean to test:
 * - Cross-package dependency resolution
 * - Affected analysis across package boundaries
 * - Multi-package validation scenarios
 */

import {
  add,
  subtract,
  multiply,
  divide,
  createCalculator,
  type Calculator,
} from "@pietgk/fixture-pkg-clean";

/**
 * Advanced calculator that extends the basic calculator with additional operations.
 */
export interface AdvancedCalculator extends Calculator {
  power(base: number, exponent: number): number;
  modulo(a: number, b: number): number;
  average(numbers: number[]): number;
}

/**
 * Calculate the power of a base raised to an exponent.
 */
export function power(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) {
    result = multiply(result, base);
  }
  return result;
}

/**
 * Calculate the modulo (remainder) of a division.
 */
export function modulo(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Modulo by zero");
  }
  // Use imported operations: a - (floor(a/b) * b)
  const quotient = Math.floor(divide(a, b));
  return subtract(a, multiply(quotient, b));
}

/**
 * Calculate the average of an array of numbers.
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new Error("Cannot calculate average of empty array");
  }
  let sum = 0;
  for (const num of numbers) {
    sum = add(sum, num);
  }
  return divide(sum, numbers.length);
}

/**
 * Create an advanced calculator with all operations.
 */
export function createAdvancedCalculator(): AdvancedCalculator {
  const baseCalc = createCalculator();
  return {
    ...baseCalc,
    power,
    modulo,
    average,
  };
}

// Re-export types and functions from pkg-clean for convenience
export { add, subtract, multiply, divide };
export type { Calculator };
