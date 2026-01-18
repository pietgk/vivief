import { describe, expect, test } from "vitest";
import { add, subtract, multiply, divide, createCalculator } from "../index.js";

describe("pkg-clean math functions", () => {
  describe("add", () => {
    test("adds positive numbers", () => {
      expect(add(2, 3)).toBe(5);
    });

    test("adds negative numbers", () => {
      expect(add(-2, -3)).toBe(-5);
    });

    test("adds zero", () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe("subtract", () => {
    test("subtracts positive numbers", () => {
      expect(subtract(5, 3)).toBe(2);
    });

    test("subtracts negative numbers", () => {
      expect(subtract(-5, -3)).toBe(-2);
    });
  });

  describe("multiply", () => {
    test("multiplies positive numbers", () => {
      expect(multiply(2, 3)).toBe(6);
    });

    test("multiplies by zero", () => {
      expect(multiply(5, 0)).toBe(0);
    });
  });

  describe("divide", () => {
    test("divides positive numbers", () => {
      expect(divide(6, 2)).toBe(3);
    });

    test("throws on division by zero", () => {
      expect(() => divide(5, 0)).toThrow("Division by zero");
    });
  });

  describe("createCalculator", () => {
    test("creates a calculator with all operations", () => {
      const calc = createCalculator();
      expect(calc.add(1, 2)).toBe(3);
      expect(calc.subtract(5, 3)).toBe(2);
      expect(calc.multiply(2, 4)).toBe(8);
      expect(calc.divide(10, 2)).toBe(5);
    });
  });
});
