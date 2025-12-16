/**
 * C# Semantic Resolver Tests
 *
 * Tests for C# cross-file symbol resolution.
 * Uses regex-based parsing with optional .NET SDK enhancement.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type CSharpSemanticResolver,
  type UnresolvedRef,
  createCSharpResolver,
} from "../../src/semantic/index.js";

describe("CSharpSemanticResolver", () => {
  let tempDir: string;
  let resolver: CSharpSemanticResolver;

  beforeAll(async () => {
    // Create temp directory for test fixtures
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cs-semantic-test-"));
    resolver = createCSharpResolver();
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
      const disabledResolver = createCSharpResolver({ enabled: false });
      const available = await disabledResolver.isAvailable();
      expect(available).toBe(false);
    });

    // Note: .NET SDK availability depends on environment
    it("should check for .NET SDK availability", async () => {
      const available = await resolver.isAvailable();
      // Just verify it returns a boolean (may be true or false)
      expect(typeof available).toBe("boolean");
    });
  });

  describe("buildExportIndex", () => {
    it("should build index for public classes", async () => {
      const pkgDir = path.join(tempDir, "public-classes");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Models.cs"),
        `
namespace MyApp.Models
{
    public class User
    {
        public string Name { get; set; }
        public int Age { get; set; }
    }

    public class Order
    {
        public int Id { get; set; }
        public decimal Total { get; set; }
    }

    internal class InternalHelper
    {
        // Should not be exported
    }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      expect(index.packagePath).toBe(pkgDir);
      expect(index.fileExports.size).toBeGreaterThan(0);

      const exports = index.fileExports.get(path.join(pkgDir, "Models.cs"));
      expect(exports).toBeDefined();

      // Check public classes are exported
      const userExport = exports?.find((e) => e.name === "User");
      expect(userExport).toBeDefined();
      expect(userExport?.kind).toBe("class");

      const orderExport = exports?.find((e) => e.name === "Order");
      expect(orderExport).toBeDefined();
      expect(orderExport?.kind).toBe("class");

      // Internal class should NOT be exported
      const internalExport = exports?.find((e) => e.name === "InternalHelper");
      expect(internalExport).toBeUndefined();
    });

    it("should handle interfaces", async () => {
      const pkgDir = path.join(tempDir, "interfaces");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Interfaces.cs"),
        `
namespace MyApp.Contracts
{
    public interface IUserService
    {
        User GetUser(int id);
        void SaveUser(User user);
    }

    public partial interface IOrderService
    {
        Order GetOrder(int id);
    }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "Interfaces.cs"));

      expect(exports).toBeDefined();

      const userServiceExport = exports?.find((e) => e.name === "IUserService");
      expect(userServiceExport).toBeDefined();
      expect(userServiceExport?.kind).toBe("interface");
      expect(userServiceExport?.isTypeOnly).toBe(true);

      const orderServiceExport = exports?.find((e) => e.name === "IOrderService");
      expect(orderServiceExport).toBeDefined();
    });

    it("should handle structs and records", async () => {
      const pkgDir = path.join(tempDir, "structs-records");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "ValueTypes.cs"),
        `
namespace MyApp.ValueTypes
{
    public struct Point
    {
        public int X;
        public int Y;
    }

    public readonly struct ImmutablePoint
    {
        public readonly int X;
        public readonly int Y;
    }

    public record Person(string Name, int Age);

    public sealed record Employee(string Name, string Department);

    public record struct Coordinate(double Lat, double Lng);
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "ValueTypes.cs"));

      expect(exports).toBeDefined();

      // Structs
      expect(exports?.find((e) => e.name === "Point")).toBeDefined();
      expect(exports?.find((e) => e.name === "ImmutablePoint")).toBeDefined();

      // Records
      expect(exports?.find((e) => e.name === "Person")).toBeDefined();
      expect(exports?.find((e) => e.name === "Employee")).toBeDefined();
      expect(exports?.find((e) => e.name === "Coordinate")).toBeDefined();
    });

    it("should handle enums and delegates", async () => {
      const pkgDir = path.join(tempDir, "enums-delegates");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Types.cs"),
        `
namespace MyApp.Types
{
    public enum Status
    {
        Pending,
        Active,
        Completed
    }

    public enum Priority
    {
        Low = 1,
        Medium = 2,
        High = 3
    }

    public delegate void EventHandler(object sender, EventArgs e);
    public delegate Task<T> AsyncOperation<T>(CancellationToken token);
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "Types.cs"));

      expect(exports).toBeDefined();

      // Enums
      const statusExport = exports?.find((e) => e.name === "Status");
      expect(statusExport).toBeDefined();
      expect(statusExport?.kind).toBe("enum");

      const priorityExport = exports?.find((e) => e.name === "Priority");
      expect(priorityExport).toBeDefined();

      // Delegates
      const eventHandlerExport = exports?.find((e) => e.name === "EventHandler");
      expect(eventHandlerExport).toBeDefined();
      expect(eventHandlerExport?.kind).toBe("type");
    });

    it("should handle file-scoped namespaces", async () => {
      const pkgDir = path.join(tempDir, "file-scoped-ns");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Service.cs"),
        `
namespace MyApp.Services;

public class UserService
{
    public User GetUser(int id) => new User();
}

public class OrderService
{
    public Order GetOrder(int id) => new Order();
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      // Check namespace resolution
      expect(index.moduleResolution.has("MyApp.Services")).toBe(true);

      const exports = index.fileExports.get(path.join(pkgDir, "Service.cs"));
      expect(exports).toBeDefined();
      expect(exports?.find((e) => e.name === "UserService")).toBeDefined();
      expect(exports?.find((e) => e.name === "OrderService")).toBeDefined();
    });

    it("should handle abstract and sealed classes", async () => {
      const pkgDir = path.join(tempDir, "modifiers");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "BaseClasses.cs"),
        `
namespace MyApp.Base
{
    public abstract class BaseEntity
    {
        public int Id { get; set; }
    }

    public sealed class FinalClass
    {
        public string Value { get; set; }
    }

    public partial class PartialClass
    {
        public string Part1 { get; set; }
    }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "BaseClasses.cs"));

      expect(exports).toBeDefined();
      expect(exports?.find((e) => e.name === "BaseEntity")).toBeDefined();
      expect(exports?.find((e) => e.name === "FinalClass")).toBeDefined();
      expect(exports?.find((e) => e.name === "PartialClass")).toBeDefined();
    });

    it("should handle static classes", async () => {
      const pkgDir = path.join(tempDir, "static-classes");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Helpers.cs"),
        `
namespace MyApp.Utilities
{
    public static class StringHelper
    {
        public static string Trim(string input) => input?.Trim();
    }

    public static partial class MathHelper
    {
        public static int Add(int a, int b) => a + b;
    }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);
      const exports = index.fileExports.get(path.join(pkgDir, "Helpers.cs"));

      expect(exports).toBeDefined();
      expect(exports?.find((e) => e.name === "StringHelper")).toBeDefined();
      expect(exports?.find((e) => e.name === "MathHelper")).toBeDefined();
    });
  });

  describe("resolveRef", () => {
    it("should resolve namespace imports", async () => {
      const pkgDir = path.join(tempDir, "resolve-namespace");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Models.cs"),
        `
namespace MyApp.Models
{
    public class User
    {
        public string Name { get; set; }
    }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const ref: UnresolvedRef = {
        sourceEntityId: "test:pkg:class:abc123",
        sourceFilePath: path.join(pkgDir, "Program.cs"),
        moduleSpecifier: "MyApp.Models",
        importedSymbol: "User",
        isTypeOnly: false,
      };

      const resolved = await resolver.resolveRef(ref, index);

      expect(resolved).toBeDefined();
      expect(resolved?.targetFilePath).toBe(path.join(pkgDir, "Models.cs"));
      expect(resolved?.confidence).toBeGreaterThan(0.8);
    });

    it("should return null for unresolvable imports", async () => {
      const pkgDir = path.join(tempDir, "unresolvable");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Models.cs"),
        `
namespace MyApp.Models
{
    public class ExistingClass { }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      const ref: UnresolvedRef = {
        sourceEntityId: "test:pkg:class:def456",
        sourceFilePath: path.join(pkgDir, "Program.cs"),
        moduleSpecifier: "NonExistent.Namespace",
        importedSymbol: "MissingClass",
        isTypeOnly: false,
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
        path.join(pkgDir, "Models.cs"),
        `
namespace MyApp.Models
{
    public class User { }
    public class Order { }
}
`
      );

      await fs.writeFile(
        path.join(pkgDir, "Services.cs"),
        `
namespace MyApp.Services
{
    public class UserService { }
}
`
      );

      const refs: UnresolvedRef[] = [
        {
          sourceEntityId: "test:pkg:class:main",
          sourceFilePath: path.join(pkgDir, "Program.cs"),
          moduleSpecifier: "MyApp.Models",
          importedSymbol: "User",
          isTypeOnly: false,
        },
        {
          sourceEntityId: "test:pkg:class:main",
          sourceFilePath: path.join(pkgDir, "Program.cs"),
          moduleSpecifier: "MyApp.Services",
          importedSymbol: "UserService",
          isTypeOnly: false,
        },
        {
          sourceEntityId: "test:pkg:class:main",
          sourceFilePath: path.join(pkgDir, "Program.cs"),
          moduleSpecifier: "NonExistent",
          importedSymbol: "Missing",
          isTypeOnly: false,
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
    });
  });

  describe("caching", () => {
    it("should cache export index", async () => {
      const pkgDir = path.join(tempDir, "cache-test");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Class.cs"),
        `
namespace MyApp
{
    public class CachedClass { }
}
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
        path.join(pkgDir, "Class.cs"),
        `
namespace MyApp
{
    public class InitialClass { }
}
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
    it("should handle empty C# files", async () => {
      const pkgDir = path.join(tempDir, "empty-file");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(path.join(pkgDir, "Empty.cs"), "");

      const index = await resolver.buildExportIndex(pkgDir);

      const exports = index.fileExports.get(path.join(pkgDir, "Empty.cs"));
      expect(exports).toBeUndefined(); // Empty file has no exports
    });

    it("should skip bin and obj directories", async () => {
      const pkgDir = path.join(tempDir, "with-bin-obj");
      const binDir = path.join(pkgDir, "bin", "Debug");
      const objDir = path.join(pkgDir, "obj");
      await fs.mkdir(binDir, { recursive: true });
      await fs.mkdir(objDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "Source.cs"),
        `
namespace MyApp
{
    public class RealClass { }
}
`
      );

      await fs.writeFile(
        path.join(binDir, "Compiled.cs"),
        `
namespace MyApp
{
    public class CompiledClass { }
}
`
      );

      await fs.writeFile(
        path.join(objDir, "Generated.cs"),
        `
namespace MyApp
{
    public class GeneratedClass { }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      // Should include source file
      expect(index.fileExports.has(path.join(pkgDir, "Source.cs"))).toBe(true);

      // Should NOT include bin/obj files
      expect(index.fileExports.has(path.join(binDir, "Compiled.cs"))).toBe(false);
      expect(index.fileExports.has(path.join(objDir, "Generated.cs"))).toBe(false);
    });

    it("should handle multiple namespaces in one file", async () => {
      const pkgDir = path.join(tempDir, "multi-namespace");
      await fs.mkdir(pkgDir, { recursive: true });

      await fs.writeFile(
        path.join(pkgDir, "MultiNs.cs"),
        `
namespace MyApp.Models
{
    public class User { }
}

namespace MyApp.ViewModels
{
    public class UserViewModel { }
}
`
      );

      const index = await resolver.buildExportIndex(pkgDir);

      // Both namespaces should be in module resolution
      expect(index.moduleResolution.has("MyApp.Models")).toBe(true);
      expect(index.moduleResolution.has("MyApp.ViewModels")).toBe(true);

      // Both classes should be exported
      const exports = index.fileExports.get(path.join(pkgDir, "MultiNs.cs"));
      expect(exports).toBeDefined();
      expect(exports?.find((e) => e.name === "User")).toBeDefined();
      expect(exports?.find((e) => e.name === "UserViewModel")).toBeDefined();
    });
  });
});
