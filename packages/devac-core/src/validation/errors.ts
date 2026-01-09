/**
 * Shared error classes for validators
 */

/**
 * Source type for validator errors
 */
export type ValidatorSource = "tsc" | "test" | "lint" | "coverage";

/**
 * Base error class for all validator execution failures
 */
export class ValidatorError extends Error {
  constructor(
    public readonly source: ValidatorSource,
    public readonly output: string,
    public readonly exitCode: number
  ) {
    super(`${source} validation failed with exit code ${exitCode}`);
    this.name = "ValidatorError";
  }
}

/**
 * Error class for tsc execution failures
 */
export class TscError extends ValidatorError {
  constructor(output: string, exitCode: number) {
    super("tsc", output, exitCode);
    this.name = "TscError";
  }
}

/**
 * Error class for test execution failures
 */
export class TestError extends ValidatorError {
  constructor(output: string, exitCode: number) {
    super("test", output, exitCode);
    this.name = "TestError";
  }
}

/**
 * Error class for linter execution failures
 */
export class LinterError extends ValidatorError {
  constructor(output: string, exitCode: number) {
    super("lint", output, exitCode);
    this.name = "LinterError";
  }
}

/**
 * Error class for coverage execution failures
 */
export class CoverageError extends ValidatorError {
  constructor(output: string, exitCode: number) {
    super("coverage", output, exitCode);
    this.name = "CoverageError";
  }
}
