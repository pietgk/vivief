/**
 * INTENTIONAL TYPE ERRORS FOR TESTING
 *
 * This file contains intentional TypeScript type errors to test
 * the validation system's ability to detect and report them.
 *
 * Expected errors:
 * - TS2322: Type 'string' is not assignable to type 'number'
 * - TS2322: Type 'number' is not assignable to type 'string'
 * - TS2345: Argument type mismatch
 * - TS2339: Property does not exist
 */

// Error 1: TS2322 - Type 'string' is not assignable to type 'number'
// @ts-expect-error - Intentional type error for testing
const numberValue: number = "not a number";

// Error 2: TS2322 - Type 'number' is not assignable to type 'string'
// @ts-expect-error - Intentional type error for testing
const stringValue: string = 42;

// Error 3: TS2322 - Type 'boolean' is not assignable to type 'string[]'
// @ts-expect-error - Intentional type error for testing
const arrayValue: string[] = true;

// Error 4: Function with wrong return type
function getNumber(): number {
  // @ts-expect-error - Intentional type error for testing
  return "not a number";
}

// Error 5: TS2345 - Argument type mismatch in function call
function processNumber(value: number): number {
  return value * 2;
}

// @ts-expect-error - Intentional type error for testing
const result = processNumber("not a number");

// Error 6: TS2339 - Property does not exist on type
interface User {
  name: string;
  age: number;
}

function getUserProperty(user: User): string {
  // @ts-expect-error - Intentional type error for testing
  return user.nonExistentProperty;
}

// Error 7: TS2741 - Missing required property
interface Config {
  apiKey: string;
  endpoint: string;
  timeout: number;
}

// @ts-expect-error - Intentional type error for testing
const config: Config = {
  apiKey: "test",
  // Missing: endpoint and timeout
};

// Export to ensure this is not tree-shaken
export {
  numberValue,
  stringValue,
  arrayValue,
  getNumber,
  result,
  getUserProperty,
  config,
};
