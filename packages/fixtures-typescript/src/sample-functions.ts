/**
 * Sample TypeScript file with various function patterns
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

// Simple function
export function add(a: number, b: number): number {
  return a + b;
}

// Async function
export async function fetchData(url: string): Promise<string> {
  // Simulated fetch
  return `Data from ${url}`;
}

// Generator function
export function* range(start: number, end: number): Generator<number> {
  for (let i = start; i < end; i++) {
    yield i;
  }
}

// Arrow function
export const multiply = (a: number, b: number): number => a * b;

// Arrow function with body
export const divide = (a: number, b: number): number => {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
};

// Async arrow function
export const loadFile = async (filePath: string): Promise<string> => {
  return readFile(filePath, "utf-8");
};

// Higher-order function
export const createMultiplier = (factor: number) => {
  return (value: number): number => value * factor;
};

// Function with nested function
export function outerFunction(x: number): number {
  function innerFunction(y: number): number {
    return y * 2;
  }
  return innerFunction(x) + x;
}

// Function with callback parameter
export function processItems<T>(items: T[], callback: (item: T, index: number) => void): void {
  items.forEach(callback);
}

// Re-export
export { readFile, writeFile } from "node:fs/promises";

// Namespace import usage
const _fullPath = path.join("/tmp", "test.txt");
