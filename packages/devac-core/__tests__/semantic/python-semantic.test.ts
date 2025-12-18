/**
 * Python Semantic Resolver Tests
 *
 * Tests for Python cross-file symbol resolution.
 * Uses regex-based parsing with optional Pyright enhancement.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PythonSemanticResolver,
  type UnresolvedRef,
  createPythonResolver,
} from "../../src/semantic/index.js";

describe("PythonSemanticResolver", () => {
  let tempDir: string;
  let resolver: PythonSemanticResolver;

  beforeAll(async () => {
    // Create temp directory for test fixtures
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "py-semantic-test-"));
    resolver = createPythonResolver();
  });

  afterAll(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear resolver caches between tests
    resolver.clearAllCaches();
  });

  describe("isAvailable", () => {
    it("should return false when disabled", async () => {
      const disabledResolver = createPythonResolver({ enabled: false });
      const available = await disabledResolver.isAvailable();
      expect(available).toBe(false);
    });

    // Note: Pyright availability depends on environment
    // This test may pass or fail based on whether npx pyright works
    it("should check for Pyright availability", async () => {
      const available = await resolver.isAvailable();
      // Just verify it returns a boolean (may be true or false)
      expect(typeof available).toBe("boolean");
    });
  });

  describe("buildExportIndex", () => {
    it("should build index for simple Python exports", async () => {
      // Create test package
      const pkgDir = path.join(tempDir, "simple-exports");
      await fs.mkdir(pkgDir, { recursive: true });

      // Create source file with exports
      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def greet(name: str) -> str:
    """Greet a person by name."""
    return f"Hello, {name}"

async def fetch_data(url: str) -> dict:
    """Fetch data from a URL."""
    pass

class User:
    """User model."""
    def __init__(self, name: str):
        self.name = name

MAX_RETRIES = 3
API_URL = "https://api.example.com"

MyType: TypeAlias = str | int
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      expect(index.packagePath).toBe(pkgDir);
      expect(index.fileExports.size).toBeGreaterThan(0);

      // Get exports from module.py
      const moduleFilePath = path.join(pkgDir, "module.py");
      const exports = index.fileExports.get(moduleFilePath);

      expect(exports).toBeDefined();
      expect(exports?.length).toBeGreaterThanOrEqual(4);

      // Check function export
      const greetExport = exports?.find((e) => e.name === "greet");
      expect(greetExport).toBeDefined();
      expect(greetExport?.kind).toBe("function");

      // Check async function export
      const fetchExport = exports?.find((e) => e.name === "fetch_data");
      expect(fetchExport).toBeDefined();
      expect(fetchExport?.kind).toBe("function");

      // Check class export
      const userExport = exports?.find((e) => e.name === "User");
      expect(userExport).toBeDefined();
      expect(userExport?.kind).toBe("class");

      // Check constant exports
      const maxRetriesExport = exports?.find((e) => e.name === "MAX_RETRIES");
      expect(maxRetriesExport).toBeDefined();
      expect(maxRetriesExport?.kind).toBe("constant");
    });

    it("should respect __all__ exports", async () => {
      const pkgDir = path.join(tempDir, "all-exports");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
__all__ = ["public_func", "PublicClass"]

def public_func():
    pass

def _private_func():
    pass

class PublicClass:
    pass

class _PrivateClass:
    pass
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "module.py"));

      expect(exports).toBeDefined();

      // Only __all__ exports should be included
      const publicFunc = exports?.find((e) => e.name === "public_func");
      expect(publicFunc).toBeDefined();

      const publicClass = exports?.find((e) => e.name === "PublicClass");
      expect(publicClass).toBeDefined();

      // Private symbols should NOT be included
      const privateFunc = exports?.find((e) => e.name === "_private_func");
      expect(privateFunc).toBeUndefined();

      const privateClass = exports?.find((e) => e.name === "_PrivateClass");
      expect(privateClass).toBeUndefined();
    });

    it("should exclude private symbols by convention", async () => {
      const pkgDir = path.join(tempDir, "private-symbols");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def public_function():
    pass

def _private_function():
    pass

def __dunder_function():
    pass

class PublicClass:
    pass

class _PrivateClass:
    pass
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "module.py"));

      expect(exports).toBeDefined();

      // Public symbols should be included
      expect(exports?.find((e) => e.name === "public_function")).toBeDefined();
      expect(exports?.find((e) => e.name === "PublicClass")).toBeDefined();

      // Private symbols should NOT be included
      expect(exports?.find((e) => e.name === "_private_function")).toBeUndefined();
      expect(exports?.find((e) => e.name === "__dunder_function")).toBeUndefined();
      expect(exports?.find((e) => e.name === "_PrivateClass")).toBeUndefined();
    });

    it("should handle package structure with __init__.py", async () => {
      const pkgDir = path.join(tempDir, "package-structure");
      const subPkgDir = path.join(pkgDir, "mypackage");
      await fs.mkdir(subPkgDir, { recursive: true });

      await fs.writeFile(
        path.join(subPkgDir, "__init__.py"),
        `
from .core import main_function
from .utils import helper

__all__ = ["main_function", "helper"]
`
      );

      await fs.writeFile(
        path.join(subPkgDir, "core.py"),
        `
def main_function():
    pass

def internal_function():
    pass
`
      );

      await fs.writeFile(
        path.join(subPkgDir, "utils.py"),
        `
def helper():
    pass

def another_helper():
    pass
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      // Should have module resolution for package
      expect(index.moduleResolution.size).toBeGreaterThan(0);

      // Check core.py exports
      const coreExports = index.fileExports.get(path.join(subPkgDir, "core.py"));
      expect(coreExports).toBeDefined();
      expect(coreExports?.find((e) => e.name === "main_function")).toBeDefined();
    });
  });

  describe("resolveRef", () => {
    it("should resolve absolute module imports", async () => {
      const pkgDir = path.join(tempDir, "resolve-absolute");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "target.py"),
        `
def target_function():
    pass

class TargetClass:
    pass
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const ref: UnresolvedRef = {
        sourceEntityId: "test:pkg:function:abc123",
        sourceFilePath: path.join(pkgDir, "main.py"),
        moduleSpecifier: "target",
        importedSymbol: "target_function",
        isTypeOnly: false,
        isDefault: false,
        isNamespace: false,
        sourceLine: 1,
        sourceColumn: 0,
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
      expect(resolved?.targetFilePath).toBe(path.join(pkgDir, "target.py"));
      expect(resolved?.confidence).toBeGreaterThan(0.8);
    });

    it("should resolve relative imports", async () => {
      const pkgDir = path.join(tempDir, "resolve-relative");
      const subDir = path.join(pkgDir, "subpackage");
      await fs.mkdir(subDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "utils.py"),
        `
def utility():
    pass
`
      );

      await fs.writeFile(
        path.join(subDir, "consumer.py"),
        `
from ..utils import utility
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const ref: UnresolvedRef = {
        sourceEntityId: "test:pkg:function:def456",
        sourceFilePath: path.join(subDir, "consumer.py"),
        moduleSpecifier: "..utils",
        importedSymbol: "utility",
        isTypeOnly: false,
        isDefault: false,
        isNamespace: false,
        sourceLine: 1,
        sourceColumn: 0,
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
      expect(resolved?.targetFilePath).toBe(path.join(pkgDir, "utils.py"));
    });

    it("should return null for unresolvable imports", async () => {
      const pkgDir = path.join(tempDir, "unresolvable");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def existing_function():
    pass
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const ref: UnresolvedRef = {
        sourceEntityId: "test:pkg:function:ghi789",
        sourceFilePath: path.join(pkgDir, "main.py"),
        moduleSpecifier: "nonexistent",
        importedSymbol: "missing_function",
        isTypeOnly: false,
        isDefault: false,
        isNamespace: false,
        sourceLine: 1,
        sourceColumn: 0,
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeNull();
    });
  });

  describe("resolvePackage", () => {
    it("should resolve multiple references in batch", async () => {
      const pkgDir = path.join(tempDir, "batch-resolve");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "models.py"),
        `
class User:
    pass

class Order:
    pass
`
      );

      await fs.writeFile(
        path.join(pkgDir, "utils.py"),
        `
def format_date():
    pass

def validate():
    pass
`
      );

      const refs: UnresolvedRef[] = [
        {
          sourceEntityId: "test:pkg:module:main",
          sourceFilePath: path.join(pkgDir, "main.py"),
          moduleSpecifier: "models",
          importedSymbol: "User",
          isTypeOnly: false,
          isDefault: false,
          isNamespace: false,
          sourceLine: 1,
          sourceColumn: 0,
        },
        {
          sourceEntityId: "test:pkg:module:main",
          sourceFilePath: path.join(pkgDir, "main.py"),
          moduleSpecifier: "utils",
          importedSymbol: "format_date",
          isTypeOnly: false,
          isDefault: false,
          isNamespace: false,
          sourceLine: 1,
          sourceColumn: 0,
        },
        {
          sourceEntityId: "test:pkg:module:main",
          sourceFilePath: path.join(pkgDir, "main.py"),
          moduleSpecifier: "nonexistent",
          importedSymbol: "missing",
          isTypeOnly: false,
          isDefault: false,
          isNamespace: false,
          sourceLine: 1,
          sourceColumn: 0,
        },
      ];

      const result = await resolver.resolvePackage(pkgDir, refs);

      expect(result.total).toBe(3);
      expect(result.resolved).toBe(2);
      expect(result.unresolved).toBe(1);
      expect(result.resolvedRefs.length).toBe(2);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
      expect(result.packagePath).toBe(pkgDir);
    });

    it("should handle empty refs array", async () => {
      const pkgDir = path.join(tempDir, "empty-refs");
      await fs.mkdir(pkgDir, { recursive: true });

      const result = await resolver.resolvePackage(pkgDir, []);

      expect(result.total).toBe(0);
      expect(result.resolved).toBe(0);
      expect(result.unresolved).toBe(0);
      expect(result.resolvedRefs.length).toBe(0);
    });
  });

  describe("caching", () => {
    it("should cache export index", async () => {
      const pkgDir = path.join(tempDir, "cache-test");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def cached_function():
    pass
`
      );

      // First call should build index
      const index1 = await resolver.buildExportIndex(pkgDir);

      // Second call should return cached index
      const index2 = await resolver.buildExportIndex(pkgDir);

      expect(index1).toBe(index2); // Same object reference
    });

    it("should clear cache for specific package", async () => {
      const pkgDir = path.join(tempDir, "clear-cache");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def initial_function():
    pass
`
      );

      const index1 = await resolver.buildExportIndex(pkgDir);

      // Clear cache
      resolver.clearCache(pkgDir);

      // This should rebuild the index
      const index2 = await resolver.buildExportIndex(pkgDir);

      expect(index1).not.toBe(index2); // Different object references
    });
  });

  describe("edge cases", () => {
    it("should handle empty Python files", async () => {
      const pkgDir = path.join(tempDir, "empty-file");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(path.join(pkgDir, "empty.py"), "");

      const index = await resolver.buildExportIndex(pkgDir);

      const exports = index.fileExports.get(path.join(pkgDir, "empty.py"));
      expect(exports).toBeUndefined(); // Empty file has no exports
    });

    it("should handle .pyi stub files", async () => {
      const pkgDir = path.join(tempDir, "stub-files");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "types.pyi"),
        `
def typed_function(x: int) -> str: ...

class TypedClass:
    value: int
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const exports = index.fileExports.get(path.join(pkgDir, "types.pyi"));
      expect(exports).toBeDefined();
      expect(exports?.find((e) => e.name === "typed_function")).toBeDefined();
      expect(exports?.find((e) => e.name === "TypedClass")).toBeDefined();
    });

    it("should skip __pycache__ directories", async () => {
      const pkgDir = path.join(tempDir, "with-pycache");
      const pycacheDir = path.join(pkgDir, "__pycache__");
      await fs.mkdir(pycacheDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "module.py"),
        `
def real_function():
    pass
`
      );

      await fs.writeFile(path.join(pycacheDir, "module.cpython-39.pyc"), "binary data");

      const index = await resolver.buildExportIndex(pkgDir);

      // Should not include __pycache__ files
      expect(index.fileExports.has(path.join(pycacheDir, "module.cpython-39.pyc"))).toBe(false);
      expect(index.fileExports.has(path.join(pkgDir, "module.py"))).toBe(true);
    });
  });
});
