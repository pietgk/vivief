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

    it("parses sample-csharp-12.cs fixture with modern features", async () => {
      const parser = createCSharpParser();
      const fixturePath = getFixturePath("sample-csharp-12.cs");
      const result = await parser.parse(fixturePath, defaultConfig);

      // Should parse without errors
      expect(result).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);

      // Should have classes
      const classes = result.nodes.filter((n) => n.kind === "class");
      expect(classes.length).toBeGreaterThan(5);

      // Should have interfaces
      const interfaces = result.nodes.filter((n) => n.kind === "interface");
      expect(interfaces.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Modern C# Features Tests (C# 10-12)
  // ==========================================================================

  describe("modern C# features", () => {
    describe("nullable reference types", () => {
      it("parses nullable property types", async () => {
        const parser = createCSharpParser();
        const content = `
public class User
{
    public string Name { get; set; } = "";
    public string? MiddleName { get; set; }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const nameProperty = result.nodes.find((n) => n.kind === "property" && n.name === "Name");
        expect(nameProperty).toBeDefined();

        const middleNameProperty = result.nodes.find(
          (n) => n.kind === "property" && n.name === "MiddleName"
        );
        expect(middleNameProperty).toBeDefined();
      });

      it("parses nullable method parameters and return types", async () => {
        const parser = createCSharpParser();
        const content = `
public class Service
{
    public string? ProcessName(string? input)
    {
        return input?.ToUpper();
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const processMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "ProcessName"
        );
        expect(processMethod).toBeDefined();
      });
    });

    describe("pattern matching", () => {
      it("parses switch expression with type patterns", async () => {
        const parser = createCSharpParser();
        const content = `
public class PatternDemo
{
    public string Describe(object obj) => obj switch
    {
        null => "null",
        string s => $"String: {s}",
        int n => $"Number: {n}",
        _ => "Unknown"
    };
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const describeMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "Describe"
        );
        expect(describeMethod).toBeDefined();
      });

      it("parses property patterns", async () => {
        const parser = createCSharpParser();
        const content = `
public class Customer { public int Level { get; set; } }

public class DiscountCalculator
{
    public decimal GetDiscount(Customer c) => c switch
    {
        { Level: > 10 } => 0.20m,
        { Level: > 5 } => 0.10m,
        _ => 0m
    };
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const getDiscountMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "GetDiscount"
        );
        expect(getDiscountMethod).toBeDefined();
      });

      it("parses relational patterns", async () => {
        const parser = createCSharpParser();
        const content = `
public class TempClassifier
{
    public string Classify(double temp) => temp switch
    {
        < 0 => "Freezing",
        >= 0 and < 15 => "Cold",
        >= 15 and < 25 => "Comfortable",
        >= 25 => "Hot"
    };
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const classifyMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "Classify"
        );
        expect(classifyMethod).toBeDefined();
      });

      it("parses list patterns", async () => {
        const parser = createCSharpParser();
        const content = `
public class ListMatcher
{
    public string Match(int[] numbers) => numbers switch
    {
        [] => "Empty",
        [var single] => $"Single: {single}",
        [var first, .., var last] => $"Range: {first} to {last}"
    };
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const matchMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Match");
        expect(matchMethod).toBeDefined();
      });

      it("parses is pattern with negation", async () => {
        const parser = createCSharpParser();
        const content = `
public class Checker
{
    public bool IsNotNull(object? obj) => obj is not null;
    public bool IsValidAge(int age) => age is >= 0 and <= 120;
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const isNotNullMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "IsNotNull"
        );
        expect(isNotNullMethod).toBeDefined();

        const isValidAgeMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "IsValidAge"
        );
        expect(isValidAgeMethod).toBeDefined();
      });
    });

    describe("init-only setters", () => {
      it("parses init-only properties", async () => {
        const parser = createCSharpParser();
        const content = `
public class ImmutablePerson
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const idProperty = result.nodes.find((n) => n.kind === "property" && n.name === "Id");
        expect(idProperty).toBeDefined();

        const nameProperty = result.nodes.find((n) => n.kind === "property" && n.name === "Name");
        expect(nameProperty).toBeDefined();
      });
    });

    describe("primary constructors (C# 12)", () => {
      it("parses class with primary constructor", async () => {
        const parser = createCSharpParser();
        const content = `
public class Person(string firstName, string lastName)
{
    public string FirstName { get; } = firstName;
    public string LastName { get; } = lastName;
    public string FullName => $"{firstName} {lastName}";
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const personClass = result.nodes.find((n) => n.kind === "class" && n.name === "Person");
        expect(personClass).toBeDefined();

        const firstNameProperty = result.nodes.find(
          (n) => n.kind === "property" && n.name === "FirstName"
        );
        expect(firstNameProperty).toBeDefined();
      });

      it("parses struct with primary constructor", async () => {
        const parser = createCSharpParser();
        const content = `
public readonly struct Point(double x, double y)
{
    public double X { get; } = x;
    public double Y { get; } = y;
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const pointStruct = result.nodes.find((n) => n.name === "Point");
        expect(pointStruct).toBeDefined();
        expect(pointStruct?.properties?.isStruct).toBe(true);
      });

      it("parses class with primary constructor and inheritance", async () => {
        const parser = createCSharpParser();
        const content = `
public class Person(string name) { }

public class Employee(string name, string department) : Person(name)
{
    public string Department { get; } = department;
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const employeeClass = result.nodes.find((n) => n.kind === "class" && n.name === "Employee");
        expect(employeeClass).toBeDefined();

        const extendsEdge = result.edges.find(
          (e) => e.edge_type === "EXTENDS" && e.source_entity_id === employeeClass?.entity_id
        );
        expect(extendsEdge).toBeDefined();
      });
    });

    describe("collection expressions (C# 12)", () => {
      it("parses methods using collection expressions", async () => {
        const parser = createCSharpParser();
        const content = `
public class CollectionDemo
{
    public int[] GetNumbers() => [1, 2, 3, 4, 5];
    public List<string> GetNames() => ["Alice", "Bob"];
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const getNumbersMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "GetNumbers"
        );
        expect(getNumbersMethod).toBeDefined();

        const getNamesMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "GetNames"
        );
        expect(getNamesMethod).toBeDefined();
      });

      it("parses spread operator in collections", async () => {
        const parser = createCSharpParser();
        const content = `
public class SpreadDemo
{
    public int[] Combine(int[] a, int[] b) => [..a, ..b];
    public int[] Prepend(int[] arr) => [0, ..arr];
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const combineMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Combine");
        expect(combineMethod).toBeDefined();
      });
    });

    describe("raw string literals (C# 11)", () => {
      it("parses class with raw string literals", async () => {
        const parser = createCSharpParser();
        const content = `
public class StringDemo
{
    public string GetJson() => """
        {
            "name": "test"
        }
        """;
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const getJsonMethod = result.nodes.find((n) => n.kind === "method" && n.name === "GetJson");
        expect(getJsonMethod).toBeDefined();
      });
    });

    describe("required members (C# 11)", () => {
      it("parses required properties", async () => {
        const parser = createCSharpParser();
        const content = `
public class Entity
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const entityClass = result.nodes.find((n) => n.kind === "class" && n.name === "Entity");
        expect(entityClass).toBeDefined();

        const idProperty = result.nodes.find((n) => n.kind === "property" && n.name === "Id");
        expect(idProperty).toBeDefined();
      });
    });

    describe("file-local types (C# 11)", () => {
      it("parses file-local classes", async () => {
        const parser = createCSharpParser();
        const content = `
file class FileLocalHelper
{
    public static int Calculate() => 42;
}

public class PublicClass
{
    public int GetValue() => FileLocalHelper.Calculate();
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        // File-local class should be parsed
        const fileLocalClass = result.nodes.find(
          (n) => n.kind === "class" && n.name === "FileLocalHelper"
        );
        expect(fileLocalClass).toBeDefined();

        const publicClass = result.nodes.find(
          (n) => n.kind === "class" && n.name === "PublicClass"
        );
        expect(publicClass).toBeDefined();
      });
    });

    describe("static abstract members in interfaces (C# 11)", () => {
      it("parses interface with static abstract members", async () => {
        const parser = createCSharpParser();
        const content = `
public interface IAddable<TSelf> where TSelf : IAddable<TSelf>
{
    static abstract TSelf operator +(TSelf left, TSelf right);
    static abstract TSelf Zero { get; }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const addableInterface = result.nodes.find(
          (n) => n.kind === "interface" && n.name === "IAddable"
        );
        expect(addableInterface).toBeDefined();
        expect(addableInterface?.type_parameters).toContain("TSelf");
      });

      it("parses implementation of static abstract interface", async () => {
        const parser = createCSharpParser();
        const content = `
public interface IAddable<TSelf> where TSelf : IAddable<TSelf>
{
    static abstract TSelf operator +(TSelf left, TSelf right);
    static abstract TSelf Zero { get; }
}

public readonly struct Money : IAddable<Money>
{
    public decimal Amount { get; }
    public Money(decimal amount) => Amount = amount;
    public static Money Zero => new(0);
    public static Money operator +(Money left, Money right) => new(left.Amount + right.Amount);
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const moneyStruct = result.nodes.find((n) => n.name === "Money");
        expect(moneyStruct).toBeDefined();

        const implementsEdge = result.edges.find(
          (e) => e.edge_type === "IMPLEMENTS" && e.source_entity_id === moneyStruct?.entity_id
        );
        expect(implementsEdge).toBeDefined();
      });
    });

    describe("generic math (C# 11)", () => {
      it("parses generic math methods using INumber", async () => {
        const parser = createCSharpParser();
        const content = `
using System.Numerics;

public class MathHelper
{
    public static T Sum<T>(IEnumerable<T> values) where T : INumber<T>
    {
        T result = T.Zero;
        foreach (var value in values)
            result += value;
        return result;
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const sumMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Sum");
        expect(sumMethod).toBeDefined();
        expect(sumMethod?.is_static).toBe(true);
      });
    });

    describe("lambda improvements", () => {
      it("parses lambda with explicit return type", async () => {
        const parser = createCSharpParser();
        const content = `
public class LambdaDemo
{
    public Func<int, int> Square = (int x) => x * x;

    public void Demo()
    {
        var add = (int a, int b) => a + b;
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const lambdaClass = result.nodes.find((n) => n.kind === "class" && n.name === "LambdaDemo");
        expect(lambdaClass).toBeDefined();

        const demoMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Demo");
        expect(demoMethod).toBeDefined();
      });
    });

    describe("async improvements", () => {
      it("parses async enumerable methods", async () => {
        const parser = createCSharpParser();
        const content = `
public class AsyncDemo
{
    public async IAsyncEnumerable<int> GenerateAsync()
    {
        for (int i = 0; i < 10; i++)
        {
            await Task.Delay(100);
            yield return i;
        }
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const generateMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "GenerateAsync"
        );
        expect(generateMethod).toBeDefined();
        expect(generateMethod?.is_async).toBe(true);
      });

      it("parses async disposable", async () => {
        const parser = createCSharpParser();
        const content = `
public class AsyncResource : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        await Task.Delay(50);
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const resourceClass = result.nodes.find(
          (n) => n.kind === "class" && n.name === "AsyncResource"
        );
        expect(resourceClass).toBeDefined();

        const disposeMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "DisposeAsync"
        );
        expect(disposeMethod).toBeDefined();
        expect(disposeMethod?.is_async).toBe(true);
      });
    });

    describe("ref and span improvements", () => {
      it("parses ref struct", async () => {
        const parser = createCSharpParser();
        const content = `
public ref struct SpanParser
{
    private readonly ReadOnlySpan<char> _data;
    private int _position;

    public SpanParser(ReadOnlySpan<char> data)
    {
        _data = data;
        _position = 0;
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const parserStruct = result.nodes.find((n) => n.name === "SpanParser");
        expect(parserStruct).toBeDefined();
      });

      it("parses scoped parameter", async () => {
        const parser = createCSharpParser();
        const content = `
public class SpanProcessor
{
    public void Process(scoped ReadOnlySpan<int> data)
    {
        foreach (var item in data)
            Console.WriteLine(item);
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const processMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Process");
        expect(processMethod).toBeDefined();
      });
    });

    describe("type aliases (C# 12)", () => {
      it("parses using alias for tuple types", async () => {
        const parser = createCSharpParser();
        const content = `
using Point = (int X, int Y);

public class PointHelper
{
    public Point Origin => (0, 0);

    public double Distance(Point a, Point b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const helperClass = result.nodes.find(
          (n) => n.kind === "class" && n.name === "PointHelper"
        );
        expect(helperClass).toBeDefined();

        const distanceMethod = result.nodes.find(
          (n) => n.kind === "method" && n.name === "Distance"
        );
        expect(distanceMethod).toBeDefined();
      });
    });

    describe("extended property patterns", () => {
      it("parses nested property patterns", async () => {
        const parser = createCSharpParser();
        const content = `
public class Address { public string Country { get; init; } = ""; }
public class Customer { public Address Address { get; init; } = new(); }
public class Order { public Customer Customer { get; init; } = new(); }

public class OrderProcessor
{
    public string Process(Order order) => order switch
    {
        { Customer.Address.Country: "USA" } => "Domestic",
        _ => "International"
    };
}
`;
        const result = await parser.parseContent(content, "test.cs", defaultConfig);

        const processMethod = result.nodes.find((n) => n.kind === "method" && n.name === "Process");
        expect(processMethod).toBeDefined();
      });
    });
  });
});
