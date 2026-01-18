/**
 * INTENTIONALLY FAILING TESTS
 *
 * These tests are designed to FAIL because they test buggy functions.
 * This is intentional - we use these to test the validation system's
 * ability to detect and report test failures.
 *
 * Expected failures:
 * - buggyAdd returns wrong result (off-by-one)
 * - buggySubtract returns wrong result (wrong operation)
 * - buggyFormatName returns wrong format
 * - buggySum returns wrong result
 * - buggyFetch throws unexpectedly
 */

import { describe, expect, test } from "vitest";
import {
  buggyAdd,
  buggySubtract,
  buggyFormatName,
  buggySum,
  buggyFetch,
  workingMultiply,
} from "../buggy.js";

describe("pkg-test-failures - Intentionally Failing Tests", () => {
  describe("buggyAdd", () => {
    test("FAILS: should add two numbers correctly", () => {
      // This test WILL FAIL because buggyAdd adds an extra 1
      expect(buggyAdd(2, 3)).toBe(5); // Will be 6
    });

    test("FAILS: should handle zero", () => {
      // This test WILL FAIL
      expect(buggyAdd(0, 0)).toBe(0); // Will be 1
    });
  });

  describe("buggySubtract", () => {
    test("FAILS: should subtract two numbers correctly", () => {
      // This test WILL FAIL because buggySubtract multiplies
      expect(buggySubtract(5, 3)).toBe(2); // Will be 15
    });
  });

  describe("buggyFormatName", () => {
    test("FAILS: should format name as 'first last'", () => {
      // This test WILL FAIL because buggyFormatName returns "last, first"
      expect(buggyFormatName("John", "Doe")).toBe("John Doe"); // Will be "Doe, John"
    });
  });

  describe("buggySum", () => {
    test("FAILS: should sum array of numbers", () => {
      // This test WILL FAIL because buggySum subtracts 1
      expect(buggySum([1, 2, 3])).toBe(6); // Will be 5
    });

    test("FAILS: should handle empty array", () => {
      // This test WILL FAIL
      expect(buggySum([])).toBe(0); // Will be -1
    });
  });

  describe("buggyFetch", () => {
    test("FAILS: should fetch data without throwing", async () => {
      // This test WILL FAIL because buggyFetch always throws
      await expect(buggyFetch("https://example.com")).resolves.toBe("data");
    });
  });

  describe("workingMultiply (control)", () => {
    test("PASSES: should multiply correctly", () => {
      // This test WILL PASS - it's a control to ensure not all tests fail
      expect(workingMultiply(2, 3)).toBe(6);
    });
  });
});
