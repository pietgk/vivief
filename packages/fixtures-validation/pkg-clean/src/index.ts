/**
 * Clean fixture package - no errors expected.
 * Used as a control fixture for validation tests.
 */

/**
 * Add two numbers together.
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtract b from a.
 * @param a - First number
 * @param b - Second number
 * @returns The difference of a and b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiply two numbers together.
 * @param a - First number
 * @param b - Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divide a by b.
 * @param a - Dividend
 * @param b - Divisor
 * @returns The quotient of a and b
 * @throws Error if b is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

/**
 * Calculator interface for basic operations.
 */
export interface Calculator {
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
  multiply(a: number, b: number): number;
  divide(a: number, b: number): number;
}

/**
 * Create a calculator instance.
 */
export function createCalculator(): Calculator {
  return {
    add,
    subtract,
    multiply,
    divide,
  };
}
