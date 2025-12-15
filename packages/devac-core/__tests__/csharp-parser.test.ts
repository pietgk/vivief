/**
 * C# Parser Tests
 *
 * TDD tests for the CSharpParser implementation.
 * Based on DevAC v2.0 spec Phase 6 requirements.
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createCSharpParser } from "../src/parsers/csharp-parser.js";
import type { ParserConfig } from "../src/parsers/parser-interface.js";
import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, "fixtures");

const getFixturePath = (name: string) => path.join(FIXTURES_DIR, name);

const defaultConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "test-repo",
  packagePath: "test-package",
};

// ============================================================================
// Interface Compliance Tests
// ============================================================================

describe("CSharpParser", () => {
  describe("interface compliance", () => {
    it("implements LanguageParser interface", () => {
      const parser = createCSharpParser();

      expect(parser).toHaveProperty("language");
      expect(parser).toHaveProperty("extensions");
      expect(parser).toHaveProperty("version");
      expect(parser).toHaveProperty("parse");
      expect(parser).toHaveProperty("parseContent");
      expect(parser).toHaveProperty("canParse");
    });

    it("has correct language identifier", () => {
      const parser = createCSharpParser();
      expect(parser.language).toBe("csharp");
    });

    it("has correct extensions", () => {
      const parser = createCSharpParser();
      expect(parser.extensions).toContain(".cs");
      expect(parser.extensions).toHaveLength(1);
    });

    it("has version string", () => {
      const parser = createCSharpParser();
      expect(typeof parser.version).toBe("string");
      expect(parser.version.length).toBeGreaterThan(0);
    });

    it("canParse returns true for .cs files", () => {
      const parser = createCSharpParser();
      expect(parser.canParse("test.cs")).toBe(true);
      expect(parser.canParse("MyClass.cs")).toBe(true);
      expect(parser.canParse("/path/to/file.cs")).toBe(true);
    });

    it("canParse returns false for non-.cs files", () => {
      const parser = createCSharpParser();
      expect(parser.canParse("test.ts")).toBe(false);
      expect(parser.canParse("test.py")).toBe(false);
      expect(parser.canParse("test.java")).toBe(false);
      expect(parser.canParse("test.css")).toBe(false);
      expect(parser.canParse("test.csproj")).toBe(false);
    });
  });

  describe("basic parsing", () => {
    it("returns valid StructuralParseResult", async () => {
      const parser = createCSharpParser();
      const content = `
namespace Test
{
    public class MyClass
    {
        public void MyMethod() { }
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      expect(result).toHaveProperty("nodes");
      expect(result).toHaveProperty("edges");
      expect(result).toHaveProperty("externalRefs");
      expect(result).toHaveProperty("sourceFileHash");
      expect(result).toHaveProperty("filePath");
      expect(result).toHaveProperty("parseTimeMs");
      expect(result).toHaveProperty("warnings");

      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
      expect(Array.isArray(result.externalRefs)).toBe(true);
      expect(typeof result.sourceFileHash).toBe("string");
      expect(result.filePath).toBe("test.cs");
      expect(typeof result.parseTimeMs).toBe("number");
    });

    it("parse time is under 100ms for simple file", async () => {
      const parser = createCSharpParser();
      const content = `
public class SimpleClass
{
    public int Value { get; set; }
}
`;
      const result = await parser.parseContent(content, "simple.cs", defaultConfig);
      expect(result.parseTimeMs).toBeLessThan(100);
    });

    it("handles empty file", async () => {
      const parser = createCSharpParser();
      const result = await parser.parseContent("", "empty.cs", defaultConfig);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("handles file with only comments", async () => {
      const parser = createCSharpParser();
      const content = `
// This is a comment
/* This is also a comment */
/// <summary>XML doc comment</summary>
`;
      const result = await parser.parseContent(content, "comments.cs", defaultConfig);

      expect(result.nodes).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("handles syntax errors gracefully", async () => {
      const parser = createCSharpParser();
      const content = `
public class Broken {
    public void Method( { // Missing closing paren
    }
}
`;
      // Should not throw, but may have warnings
      const result = await parser.parseContent(content, "broken.cs", defaultConfig);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // Namespace Tests (Task 3)
  // ============================================================================

  describe("namespace parsing", () => {
    it("extracts traditional namespace declaration", async () => {
      const parser = createCSharpParser();
      const content = `
namespace MyCompany.MyProduct.Core
{
    public class MyClass { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const namespaceNode = result.nodes.find((n) => n.kind === "namespace");
      expect(namespaceNode).toBeDefined();
      expect(namespaceNode?.name).toBe("MyCompany.MyProduct.Core");
    });

    it("extracts file-scoped namespace (C# 10)", async () => {
      const parser = createCSharpParser();
      const content = `
namespace DevAC.Tests.Modern;

public class ModernClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const namespaceNode = result.nodes.find((n) => n.kind === "namespace");
      expect(namespaceNode).toBeDefined();
      expect(namespaceNode?.name).toBe("DevAC.Tests.Modern");
    });

    it("handles nested namespaces", async () => {
      const parser = createCSharpParser();
      const content = `
namespace Outer
{
    namespace Inner
    {
        public class InnerClass { }
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const namespaceNodes = result.nodes.filter((n) => n.kind === "namespace");
      expect(namespaceNodes.length).toBeGreaterThanOrEqual(1);
    });

    it("creates CONTAINS edges for namespace hierarchy", async () => {
      const parser = createCSharpParser();
      const content = `
namespace MyNamespace
{
    public class MyClass { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const containsEdge = result.edges.find((e) => e.edge_type === "CONTAINS");
      expect(containsEdge).toBeDefined();
    });
  });

  // ============================================================================
  // Class Parsing Tests (Task 4)
  // ============================================================================

  describe("class parsing", () => {
    it("extracts class with correct kind", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    public string Name { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "User");
      expect(classNode).toBeDefined();
      expect(classNode?.kind).toBe("class");
    });

    it("extracts EXTENDS edge for base class", async () => {
      const parser = createCSharpParser();
      const content = `
public class BaseClass { }

public class DerivedClass : BaseClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const extendsEdge = result.edges.find((e) => e.edge_type === "EXTENDS");
      expect(extendsEdge).toBeDefined();
    });

    it("extracts IMPLEMENTS edges for interfaces", async () => {
      const parser = createCSharpParser();
      const content = `
public interface IEntity { }
public interface INameable { }

public class User : IEntity, INameable { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const implementsEdges = result.edges.filter((e) => e.edge_type === "IMPLEMENTS");
      expect(implementsEdges.length).toBeGreaterThanOrEqual(2);
    });

    it("handles abstract classes", async () => {
      const parser = createCSharpParser();
      const content = `
public abstract class BaseEntity
{
    public abstract void Validate();
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "BaseEntity");
      expect(classNode).toBeDefined();
      expect(classNode?.is_abstract).toBe(true);
    });

    it("handles static classes", async () => {
      const parser = createCSharpParser();
      const content = `
public static class Utilities
{
    public static void DoSomething() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Utilities");
      expect(classNode).toBeDefined();
      expect(classNode?.is_static).toBe(true);
    });

    it("handles sealed classes", async () => {
      const parser = createCSharpParser();
      const content = `
public sealed class FinalClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "FinalClass");
      expect(classNode).toBeDefined();
      expect(classNode?.properties?.isSealed).toBe(true);
    });

    it("handles generic classes", async () => {
      const parser = createCSharpParser();
      const content = `
public class Container<T>
{
    public T Value { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Container");
      expect(classNode).toBeDefined();
      expect(classNode?.type_parameters).toContain("T");
    });

    it("handles partial classes", async () => {
      const parser = createCSharpParser();
      const content = `
public partial class Customer
{
    public int Id { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Customer");
      expect(classNode).toBeDefined();
      expect(classNode?.properties?.isPartial).toBe(true);
    });
  });

  // ============================================================================
  // Interface Parsing Tests (Task 4)
  // ============================================================================

  describe("interface parsing", () => {
    it("extracts interface node", async () => {
      const parser = createCSharpParser();
      const content = `
public interface IEntity
{
    int Id { get; set; }
    void Validate();
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const interfaceNode = result.nodes.find(
        (n) => n.kind === "interface" && n.name === "IEntity"
      );
      expect(interfaceNode).toBeDefined();
    });

    it("handles interface inheritance", async () => {
      const parser = createCSharpParser();
      const content = `
public interface IBase { }
public interface IDerived : IBase { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const extendsEdge = result.edges.find((e) => e.edge_type === "EXTENDS");
      expect(extendsEdge).toBeDefined();
    });

    it("handles generic interfaces", async () => {
      const parser = createCSharpParser();
      const content = `
public interface IRepository<T> where T : class
{
    T GetById(int id);
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const interfaceNode = result.nodes.find(
        (n) => n.kind === "interface" && n.name === "IRepository"
      );
      expect(interfaceNode).toBeDefined();
      expect(interfaceNode?.type_parameters).toContain("T");
    });
  });

  // ============================================================================
  // Struct and Record Parsing Tests (Task 4)
  // ============================================================================

  describe("struct and record parsing", () => {
    it("extracts struct with isStruct property", async () => {
      const parser = createCSharpParser();
      const content = `
public struct Point
{
    public int X { get; set; }
    public int Y { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const structNode = result.nodes.find((n) => n.name === "Point");
      expect(structNode).toBeDefined();
      expect(structNode?.kind).toBe("class"); // structs map to class kind
      expect(structNode?.properties?.isStruct).toBe(true);
    });

    it("extracts record with isRecord property", async () => {
      const parser = createCSharpParser();
      const content = `
public record Person(string FirstName, string LastName);
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const recordNode = result.nodes.find((n) => n.name === "Person");
      expect(recordNode).toBeDefined();
      expect(recordNode?.kind).toBe("class"); // records map to class kind
      expect(recordNode?.properties?.isRecord).toBe(true);
    });

    it("extracts record struct", async () => {
      const parser = createCSharpParser();
      const content = `
public readonly record struct Point(double X, double Y);
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const recordNode = result.nodes.find((n) => n.name === "Point");
      expect(recordNode).toBeDefined();
      expect(recordNode?.properties?.isRecord).toBe(true);
      expect(recordNode?.properties?.isStruct).toBe(true);
    });
  });

  // ============================================================================
  // Method Parsing Tests (Task 5)
  // ============================================================================

  describe("method parsing", () => {
    it("extracts methods with CONTAINS edge", async () => {
      const parser = createCSharpParser();
      const content = `
public class Service
{
    public void DoWork() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "DoWork");
      expect(methodNode).toBeDefined();

      const containsEdge = result.edges.find(
        (e) => e.edge_type === "CONTAINS" && e.target_entity_id === methodNode?.entity_id
      );
      expect(containsEdge).toBeDefined();
    });

    it("handles async methods", async () => {
      const parser = createCSharpParser();
      const content = `
public class Service
{
    public async Task DoWorkAsync() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "DoWorkAsync");
      expect(methodNode).toBeDefined();
      expect(methodNode?.is_async).toBe(true);
    });

    it("handles static methods", async () => {
      const parser = createCSharpParser();
      const content = `
public class Utilities
{
    public static void StaticMethod() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "StaticMethod");
      expect(methodNode).toBeDefined();
      expect(methodNode?.is_static).toBe(true);
    });

    it("handles virtual methods", async () => {
      const parser = createCSharpParser();
      const content = `
public class Base
{
    public virtual void VirtualMethod() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find(
        (n) => n.kind === "method" && n.name === "VirtualMethod"
      );
      expect(methodNode).toBeDefined();
      expect(methodNode?.properties?.isVirtual).toBe(true);
    });

    it("extracts method parameters", async () => {
      const parser = createCSharpParser();
      const content = `
public class Service
{
    public int Add(int a, int b) { return a + b; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const paramNodes = result.nodes.filter((n) => n.kind === "parameter");
      expect(paramNodes.length).toBeGreaterThanOrEqual(2);
    });

    it("extracts return type", async () => {
      const parser = createCSharpParser();
      const content = `
public class Service
{
    public string GetName() { return ""; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "GetName");
      expect(methodNode).toBeDefined();
      expect(methodNode?.type_signature).toContain("string");
    });

    it("handles extension methods", async () => {
      const parser = createCSharpParser();
      const content = `
public static class StringExtensions
{
    public static bool IsEmpty(this string value)
    {
        return string.IsNullOrEmpty(value);
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "IsEmpty");
      expect(methodNode).toBeDefined();
      expect(methodNode?.properties?.isExtension).toBe(true);
    });
  });

  // ============================================================================
  // Property and Field Parsing Tests (Task 5)
  // ============================================================================

  describe("property and field parsing", () => {
    it("extracts auto-properties", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    public string Name { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const propNode = result.nodes.find((n) => n.kind === "property" && n.name === "Name");
      expect(propNode).toBeDefined();
    });

    it("extracts explicit properties", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    private string _name;
    public string Name
    {
        get => _name;
        set => _name = value;
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const propNode = result.nodes.find((n) => n.kind === "property" && n.name === "Name");
      expect(propNode).toBeDefined();
    });

    it("extracts fields", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    private readonly string _id;
    public const int MaxAge = 150;
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const fieldNodes = result.nodes.filter((n) => n.kind === "variable");
      expect(fieldNodes.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts events", async () => {
      const parser = createCSharpParser();
      const content = `
public class Publisher
{
    public event EventHandler OnChange;
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const eventNode = result.nodes.find((n) => n.name === "OnChange");
      expect(eventNode).toBeDefined();
      expect(eventNode?.properties?.isEvent).toBe(true);
    });
  });

  // ============================================================================
  // Constructor Parsing Tests (Task 5)
  // ============================================================================

  describe("constructor parsing", () => {
    it("extracts constructors", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    public User() { }
    public User(string name) { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const constructors = result.nodes.filter(
        (n) => n.kind === "method" && n.properties?.isConstructor === true
      );
      expect(constructors.length).toBeGreaterThanOrEqual(2);
    });

    it("extracts static constructors", async () => {
      const parser = createCSharpParser();
      const content = `
public class Config
{
    static Config() { }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const staticCtor = result.nodes.find(
        (n) => n.kind === "method" && n.properties?.isConstructor && n.is_static
      );
      expect(staticCtor).toBeDefined();
    });
  });

  // ============================================================================
  // Attribute Parsing Tests (Task 6)
  // ============================================================================

  describe("attribute parsing", () => {
    it("extracts attributes as decorator nodes", async () => {
      const parser = createCSharpParser();
      const content = `
[Serializable]
public class User { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "User");
      expect(classNode).toBeDefined();
      expect(classNode?.decorators).toContain("Serializable");
    });

    it("creates DECORATES edges", async () => {
      const parser = createCSharpParser();
      const content = `
[Obsolete]
public class OldClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const decoratesEdge = result.edges.find((e) => e.edge_type === "DECORATES");
      expect(decoratesEdge).toBeDefined();
    });

    it("handles attributes with arguments", async () => {
      const parser = createCSharpParser();
      const content = `
[Obsolete("Use NewClass instead", error: true)]
public class OldClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "OldClass");
      expect(classNode?.decorators).toContain("Obsolete");
    });

    it("handles multiple attributes", async () => {
      const parser = createCSharpParser();
      const content = `
[Serializable]
[Obsolete]
public class MultiAttrClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "MultiAttrClass");
      expect(classNode?.decorators?.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // Using Directive Tests (Task 6)
  // ============================================================================

  describe("using directives", () => {
    it("extracts using as external ref", async () => {
      const parser = createCSharpParser();
      const content = `
using System;
using System.Collections.Generic;

public class MyClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      expect(result.externalRefs.length).toBeGreaterThanOrEqual(2);

      const systemRef = result.externalRefs.find((r) => r.module_specifier === "System");
      expect(systemRef).toBeDefined();
    });

    it("handles using static", async () => {
      const parser = createCSharpParser();
      const content = `
using static System.Console;

public class MyClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const staticRef = result.externalRefs.find((r) => r.module_specifier.includes("Console"));
      expect(staticRef).toBeDefined();
    });

    it("handles using alias", async () => {
      const parser = createCSharpParser();
      const content = `
using Dict = System.Collections.Generic.Dictionary<string, int>;

public class MyClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const aliasRef = result.externalRefs.find((r) => r.local_alias === "Dict");
      expect(aliasRef).toBeDefined();
    });

    it("handles global using", async () => {
      const parser = createCSharpParser();
      const content = `
global using System;

public class MyClass { }
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const globalRef = result.externalRefs.find((r) => r.module_specifier === "System");
      expect(globalRef).toBeDefined();
    });
  });

  // ============================================================================
  // Generics Tests (Task 7)
  // ============================================================================

  describe("generics", () => {
    it("extracts type parameters", async () => {
      const parser = createCSharpParser();
      const content = `
public class Pair<TFirst, TSecond>
{
    public TFirst First { get; set; }
    public TSecond Second { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Pair");
      expect(classNode).toBeDefined();
      expect(classNode?.type_parameters).toContain("TFirst");
      expect(classNode?.type_parameters).toContain("TSecond");
    });

    it("extracts type constraints", async () => {
      const parser = createCSharpParser();
      const content = `
public class Repository<T> where T : class, new()
{
    public T Create() { return new T(); }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Repository");
      expect(classNode).toBeDefined();
      expect(classNode?.properties?.typeConstraints).toBeDefined();
    });
  });

  // ============================================================================
  // Async Tests (Task 7)
  // ============================================================================

  describe("async patterns", () => {
    it("marks async methods correctly", async () => {
      const parser = createCSharpParser();
      const content = `
public class AsyncService
{
    public async Task<string> FetchDataAsync()
    {
        await Task.Delay(100);
        return "data";
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const methodNode = result.nodes.find(
        (n) => n.kind === "method" && n.name === "FetchDataAsync"
      );
      expect(methodNode).toBeDefined();
      expect(methodNode?.is_async).toBe(true);
    });
  });

  // ============================================================================
  // Enum Tests
  // ============================================================================

  describe("enum parsing", () => {
    it("extracts enum declarations", async () => {
      const parser = createCSharpParser();
      const content = `
public enum Status
{
    Active,
    Inactive,
    Pending
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const enumNode = result.nodes.find((n) => n.kind === "enum" && n.name === "Status");
      expect(enumNode).toBeDefined();
    });

    it("extracts enum members", async () => {
      const parser = createCSharpParser();
      const content = `
public enum Status
{
    Active = 1,
    Inactive = 2
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const enumMembers = result.nodes.filter((n) => n.kind === "enum_member");
      expect(enumMembers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // Entity ID Tests
  // ============================================================================

  describe("entity ID generation", () => {
    it("generates stable entity IDs", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    public string Name { get; set; }
}
`;
      const result1 = await parser.parseContent(content, "test.cs", defaultConfig);
      const result2 = await parser.parseContent(content, "test.cs", defaultConfig);

      const classId1 = result1.nodes.find((n) => n.name === "User")?.entity_id;
      const classId2 = result2.nodes.find((n) => n.name === "User")?.entity_id;

      expect(classId1).toBe(classId2);
    });

    it("generates unique IDs for different elements", async () => {
      const parser = createCSharpParser();
      const content = `
public class User
{
    public string Name { get; set; }
}

public class Product
{
    public string Name { get; set; }
}
`;
      const result = await parser.parseContent(content, "test.cs", defaultConfig);

      const userNode = result.nodes.find((n) => n.kind === "class" && n.name === "User");
      const productNode = result.nodes.find((n) => n.kind === "class" && n.name === "Product");

      expect(userNode?.entity_id).not.toBe(productNode?.entity_id);
    });
  });

  // ============================================================================
  // Fixture File Tests
  // ============================================================================

  describe("fixture file parsing", () => {
    it("parses sample-class.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-class.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      expect(result.nodes.length).toBeGreaterThan(0);

      // Should have classes
      const classes = result.nodes.filter((n) => n.kind === "class");
      expect(classes.length).toBeGreaterThanOrEqual(3); // BaseEntity, User, AdminUser, etc.

      // Should have methods
      const methods = result.nodes.filter((n) => n.kind === "method");
      expect(methods.length).toBeGreaterThan(0);

      // Should have properties
      const properties = result.nodes.filter((n) => n.kind === "property");
      expect(properties.length).toBeGreaterThan(0);
    });

    it("parses sample-interface.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-interface.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const interfaces = result.nodes.filter((n) => n.kind === "interface");
      expect(interfaces.length).toBeGreaterThanOrEqual(5);
    });

    it("parses sample-records.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-records.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const records = result.nodes.filter((n) => n.properties?.isRecord === true);
      expect(records.length).toBeGreaterThanOrEqual(3);
    });

    it("parses sample-generics.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-generics.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const generics = result.nodes.filter(
        (n) => n.type_parameters && n.type_parameters.length > 0
      );
      expect(generics.length).toBeGreaterThanOrEqual(3);
    });

    it("parses sample-async.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-async.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const asyncMethods = result.nodes.filter((n) => n.kind === "method" && n.is_async);
      expect(asyncMethods.length).toBeGreaterThanOrEqual(3);
    });

    it("parses sample-attributes.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-attributes.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const nodesWithDecorators = result.nodes.filter(
        (n) => n.decorators && n.decorators.length > 0
      );
      expect(nodesWithDecorators.length).toBeGreaterThanOrEqual(3);
    });

    it("parses sample-extension.cs fixture", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-extension.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      const extensionMethods = result.nodes.filter((n) => n.properties?.isExtension === true);
      expect(extensionMethods.length).toBeGreaterThanOrEqual(5);
    });
  });
});
