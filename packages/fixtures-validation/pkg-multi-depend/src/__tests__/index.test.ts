import { describe, expect, test } from "vitest";
import {
  power,
  modulo,
  average,
  createAdvancedCalculator,
  add,
  multiply,
} from "../index.js";

describe("pkg-multi-depend advanced calculator", () => {
  describe("power", () => {
    test("calculates powers correctly", () => {
      expect(power(2, 3)).toBe(8);
      expect(power(5, 2)).toBe(25);
      expect(power(10, 0)).toBe(1);
    });

    test("handles zero base", () => {
      expect(power(0, 5)).toBe(0);
    });
  });

  describe("modulo", () => {
    test("calculates modulo correctly", () => {
      expect(modulo(10, 3)).toBe(1);
      expect(modulo(15, 5)).toBe(0);
      expect(modulo(7, 4)).toBe(3);
    });

    test("throws on modulo by zero", () => {
      expect(() => modulo(10, 0)).toThrow("Modulo by zero");
    });
  });

  describe("average", () => {
    test("calculates average correctly", () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
      expect(average([10, 20])).toBe(15);
      expect(average([100])).toBe(100);
    });

    test("throws on empty array", () => {
      expect(() => average([])).toThrow("Cannot calculate average of empty array");
    });
  });

  describe("createAdvancedCalculator", () => {
    test("includes all operations", () => {
      const calc = createAdvancedCalculator();
      expect(calc.add(1, 2)).toBe(3);
      expect(calc.subtract(5, 3)).toBe(2);
      expect(calc.multiply(2, 4)).toBe(8);
      expect(calc.divide(10, 2)).toBe(5);
      expect(calc.power(2, 3)).toBe(8);
      expect(calc.modulo(10, 3)).toBe(1);
      expect(calc.average([1, 2, 3])).toBe(2);
    });
  });

  describe("re-exported functions", () => {
    test("add is re-exported from pkg-clean", () => {
      expect(add(1, 2)).toBe(3);
    });

    test("multiply is re-exported from pkg-clean", () => {
      expect(multiply(3, 4)).toBe(12);
    });
  });
});
