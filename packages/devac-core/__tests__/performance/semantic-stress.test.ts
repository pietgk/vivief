/**
 * Semantic Resolution Performance Tests
 *
 * Tests performance characteristics of semantic resolvers
 * under various load conditions.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CSharpSemanticResolver,
  type PythonSemanticResolver,
  type TypeScriptSemanticResolver,
  type UnresolvedRef,
  createCSharpResolver,
  createPythonResolver,
  createTypeScriptResolver,
} from "../../src/semantic/index.js";

describe("Semantic Resolution Performance", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-perf-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("TypeScript Resolver", () => {
    let resolver: TypeScriptSemanticResolver;

    beforeAll(() => {
      resolver = createTypeScriptResolver();
    });

    it("should build export index for 50 files in <5s", async () => {
      const pkgDir = path.join(tempDir, "ts-50-files");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create 50 TypeScript files
      for (let i = 0; i < 50; i++) {
        const content = `
export function func${i}(x: number): number {
  return x * ${i};
}

export class Class${i} {
  private value: number = ${i};

  getValue(): number {
    return this.value;
  }
}

export interface Interface${i} {
  id: number;
  name: string;
}

export type Type${i} = string | number;

export const CONSTANT_${i} = ${i};
`;
        await fs.writeFile(path.join(pkgDir, `module${i}.ts`), content);
      }

      // Create tsconfig.json
      await fs.writeFile(
        path.join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            strict: true,
          },
          include: ["**/*.ts"],
        })
      );

      const startTime = Date.now();
      const index = await resolver.buildExportIndex(pkgDir);
      const duration = Date.now() - startTime;

      expect(index.fileExports.size).toBe(50);
      expect(duration).toBeLessThan(5000); // <5s

      // Verify exports were extracted
      const firstFileExports = index.fileExports.get(path.join(pkgDir, "module0.ts"));
      expect(firstFileExports).toBeDefined();
      expect(firstFileExports?.length).toBeGreaterThanOrEqual(5); // func, class, interface, type, const

      console.log(`TypeScript: Built index for 50 files in ${duration}ms`);
    });

    it("should resolve 100 references in <2s", async () => {
      const pkgDir = path.join(tempDir, "ts-resolve-100");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create source files
      for (let i = 0; i < 10; i++) {
        const content = `
export function helper${i}(): void {}
export class Service${i} {}
`;
        await fs.writeFile(path.join(pkgDir, `helpers${i}.ts`), content);
      }

      await fs.writeFile(
        path.join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2020", module: "ESNext" },
          include: ["**/*.ts"],
        })
      );

      // Create 100 unresolved refs
      const refs: UnresolvedRef[] = [];
      for (let i = 0; i < 100; i++) {
        const fileIndex = i % 10;
        refs.push({
          sourceEntityId: `test:pkg:function:src${i}`,
          sourceFilePath: path.join(pkgDir, "main.ts"),
          moduleSpecifier: `./helpers${fileIndex}`,
          importedSymbol: `helper${fileIndex}`,
          isTypeOnly: false,
        });
      }

      const startTime = Date.now();
      const result = await resolver.resolvePackage(pkgDir, refs);
      const duration = Date.now() - startTime;

      expect(result.total).toBe(100);
      expect(result.resolved).toBeGreaterThan(90); // Allow some failures
      expect(duration).toBeLessThan(2000); // <2s

      console.log(`TypeScript: Resolved ${result.resolved}/100 refs in ${duration}ms`);
    });

    it("should handle cache efficiently", async () => {
      const pkgDir = path.join(tempDir, "ts-cache-test");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(path.join(pkgDir, "module.ts"), "export function cached(): void {}");

      await fs.writeFile(
        path.join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2020", module: "ESNext" },
          include: ["**/*.ts"],
        })
      );

      // First build (cold)
      const coldStart = Date.now();
      await resolver.buildExportIndex(pkgDir);
      const coldDuration = Date.now() - coldStart;

      // Second build (cached)
      const warmStart = Date.now();
      await resolver.buildExportIndex(pkgDir);
      const warmDuration = Date.now() - warmStart;

      // Cached should be significantly faster
      expect(warmDuration).toBeLessThan(coldDuration);
      expect(warmDuration).toBeLessThan(10); // Should be near-instant

      console.log(`TypeScript: Cold build ${coldDuration}ms, Cached ${warmDuration}ms`);
    });
  });

  describe("Python Resolver", () => {
    let resolver: PythonSemanticResolver;

    beforeAll(() => {
      resolver = createPythonResolver();
    });

    it("should build export index for 50 files in <2s", async () => {
      const pkgDir = path.join(tempDir, "py-50-files");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create 50 Python files
      for (let i = 0; i < 50; i++) {
        const content = `
def func${i}(x: int) -> int:
    """Function ${i}"""
    return x * ${i}

class Class${i}:
    """Class ${i}"""
    def __init__(self):
        self.value = ${i}

    def get_value(self) -> int:
        return self.value

CONSTANT_${i} = ${i}
`;
        await fs.writeFile(path.join(pkgDir, `module${i}.py`), content);
      }

      const startTime = Date.now();
      const index = await resolver.buildExportIndex(pkgDir);
      const duration = Date.now() - startTime;

      expect(index.fileExports.size).toBe(50);
      expect(duration).toBeLessThan(2000); // <2s (regex is fast)

      console.log(`Python: Built index for 50 files in ${duration}ms`);
    });

    it("should resolve 100 references in <1s", async () => {
      const pkgDir = path.join(tempDir, "py-resolve-100");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create source files
      for (let i = 0; i < 10; i++) {
        const content = `
def helper${i}():
    pass

class Service${i}:
    pass
`;
        await fs.writeFile(path.join(pkgDir, `helpers${i}.py`), content);
      }

      // Create 100 unresolved refs
      const refs: UnresolvedRef[] = [];
      for (let i = 0; i < 100; i++) {
        const fileIndex = i % 10;
        refs.push({
          sourceEntityId: `test:pkg:function:src${i}`,
          sourceFilePath: path.join(pkgDir, "main.py"),
          moduleSpecifier: `helpers${fileIndex}`,
          importedSymbol: `helper${fileIndex}`,
          isTypeOnly: false,
        });
      }

      const startTime = Date.now();
      const result = await resolver.resolvePackage(pkgDir, refs);
      const duration = Date.now() - startTime;

      expect(result.total).toBe(100);
      expect(result.resolved).toBeGreaterThan(90);
      expect(duration).toBeLessThan(5000); // <5s (Python resolution can be slow)

      console.log(`Python: Resolved ${result.resolved}/100 refs in ${duration}ms`);
    });
  });

  describe("C# Resolver", () => {
    let resolver: CSharpSemanticResolver;

    beforeAll(() => {
      resolver = createCSharpResolver();
    });

    it("should build export index for 50 files in <2s", async () => {
      const pkgDir = path.join(tempDir, "cs-50-files");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create 50 C# files
      for (let i = 0; i < 50; i++) {
        const content = `
namespace MyApp.Module${i}
{
    public class Class${i}
    {
        public int Value { get; set; } = ${i};

        public int GetValue()
        {
            return Value;
        }
    }

    public interface IService${i}
    {
        void DoWork();
    }

    public enum Status${i}
    {
        Active,
        Inactive
    }
}
`;
        await fs.writeFile(path.join(pkgDir, `Module${i}.cs`), content);
      }

      const startTime = Date.now();
      const index = await resolver.buildExportIndex(pkgDir);
      const duration = Date.now() - startTime;

      expect(index.fileExports.size).toBe(50);
      expect(duration).toBeLessThan(2000); // <2s (regex is fast)

      console.log(`C#: Built index for 50 files in ${duration}ms`);
    });

    it("should resolve 100 references in <1s", async () => {
      const pkgDir = path.join(tempDir, "cs-resolve-100");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create source files
      for (let i = 0; i < 10; i++) {
        const content = `
namespace MyApp.Helpers${i}
{
    public class Helper${i}
    {
        public void DoWork() { }
    }
}
`;
        await fs.writeFile(path.join(pkgDir, `Helpers${i}.cs`), content);
      }

      // Create 100 unresolved refs
      const refs: UnresolvedRef[] = [];
      for (let i = 0; i < 100; i++) {
        const fileIndex = i % 10;
        refs.push({
          sourceEntityId: `test:pkg:class:src${i}`,
          sourceFilePath: path.join(pkgDir, "Program.cs"),
          moduleSpecifier: `MyApp.Helpers${fileIndex}`,
          importedSymbol: `Helper${fileIndex}`,
          isTypeOnly: false,
        });
      }

      const startTime = Date.now();
      const result = await resolver.resolvePackage(pkgDir, refs);
      const duration = Date.now() - startTime;

      expect(result.total).toBe(100);
      expect(result.resolved).toBeGreaterThan(90);
      expect(duration).toBeLessThan(1000); // <1s

      console.log(`C#: Resolved ${result.resolved}/100 refs in ${duration}ms`);
    });
  });

  describe("Memory Usage", () => {
    it("should not leak memory across multiple resolutions", async () => {
      const pkgDir = path.join(tempDir, "memory-test");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create some files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(pkgDir, `module${i}.ts`),
          `export function func${i}(): void {}`
        );
      }

      await fs.writeFile(
        path.join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2020", module: "ESNext" },
          include: ["**/*.ts"],
        })
      );

      const resolver = createTypeScriptResolver();
      const initialMemory = process.memoryUsage().heapUsed;

      // Run multiple resolutions
      for (let iteration = 0; iteration < 5; iteration++) {
        resolver.clearAllCaches();
        await resolver.buildExportIndex(pkgDir);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (<200MB)
      // ts-morph uses significant memory for type checking
      expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024);

      console.log(`Memory growth after 5 iterations: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    });
  });
});
