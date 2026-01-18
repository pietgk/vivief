/**
 * INTENTIONAL TYPE ERRORS FOR TESTING
 *
 * This package contains intentional TypeScript errors to test the
 * validation system's typecheck detection capabilities.
 *
 * DO NOT FIX THESE ERRORS - they are here intentionally.
 */

export * from "./type-errors.js";

// Additional errors in the main entry point

// Error: TS2322 - Type mismatch in interface implementation
interface NumberProvider {
  getValue(): number;
}

const provider: NumberProvider = {
  // @ts-expect-error - Intentional type error for testing
  getValue(): string {
    return "wrong type";
  },
};

// Error: Generic type argument mismatch
function identity<T>(value: T): T {
  return value;
}

// @ts-expect-error - Intentional type error for testing
const wrongGeneric: number = identity<number>("string");

export { provider, wrongGeneric };
