/**
 * Schema Validation Tests
 *
 * Tests that parser outputs conform to the expected StructuralParseResult schema.
 * These tests ensure entity IDs are formatted correctly, edge types are valid,
 * and all required fields are present.
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createCSharpParser } from "../src/parsers/csharp-parser.js";
import type { ParserConfig, StructuralParseResult } from "../src/parsers/parser-interface.js";
import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import { createPythonParser } from "../src/parsers/python-parser.js";
import { createTypeScriptParser } from "../src/parsers/typescript-parser.js";
import type { ParsedEdge } from "../src/types/edges.js";
import type { ParsedExternalRef } from "../src/types/external-refs.js";
import type { ParsedNode } from "../src/types/nodes.js";

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Default test config
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "schema-test-repo",
  packagePath: "schema-test-package",
  branch: "main",
};

// Valid node kinds based on the actual NodeKind type
const VALID_NODE_KINDS = [
  "function",
  "class",
  "method",
  "property",
  "variable",
  "constant",
  "interface",
  "type",
  "enum",
  "enum_member",
  "namespace",
  "module",
  "parameter",
  "decorator",
  "jsx_component",
  "hook",
  "unknown",
] as const;

// Valid edge types based on the actual EdgeType type
const VALID_EDGE_TYPES = [
  "CONTAINS",
  "CALLS",
  "IMPORTS",
  "EXTENDS",
  "IMPLEMENTS",
  "RETURNS",
  "PARAMETER_OF",
  "TYPE_OF",
  "DECORATES",
  "OVERRIDES",
  "REFERENCES",
  "EXPORTS",
  "RE_EXPORTS",
  "INSTANTIATES",
  "USES_TYPE",
  "ACCESSES",
  "THROWS",
  "AWAITS",
  "YIELDS",
] as const;

/**
 * Validate entity ID format
 * Expected format: {repo}:{package_path}:{kind}:{scope_hash}
 * Also accepts "unresolved:{name}" for external/unresolved references
 */
function isValidEntityId(entityId: string, config: ParserConfig, allowUnresolved = false): boolean {
  if (!entityId || typeof entityId !== "string") return false;

  // Allow "unresolved:" prefix for external references
  if (allowUnresolved && entityId.startsWith("unresolved:")) {
    return true;
  }

  const parts = entityId.split(":");
  if (parts.length < 3) return false;

  // First part should be repo name
  if (!parts[0].includes(config.repoName)) return false;

  return true;
}

/**
 * Validate parsed node structure
 */
function validateParsedNode(node: ParsedNode, config: ParserConfig): string[] {
  const errors: string[] = [];

  // Required fields
  if (!node.entity_id) {
    errors.push("Missing entity_id");
  } else if (!isValidEntityId(node.entity_id, config)) {
    errors.push(`Invalid entity_id format: ${node.entity_id}`);
  }

  if (!node.name && node.name !== "") {
    errors.push("Missing name");
  }

  if (!node.kind) {
    errors.push("Missing kind");
  } else if (!VALID_NODE_KINDS.includes(node.kind as (typeof VALID_NODE_KINDS)[number])) {
    errors.push(`Invalid kind: ${node.kind}`);
  }

  if (!node.file_path) {
    errors.push("Missing file_path");
  }

  // Line numbers should be positive
  if (node.start_line !== undefined && node.start_line < 1) {
    errors.push(`Invalid start_line: ${node.start_line}`);
  }

  if (node.end_line !== undefined && node.end_line < 1) {
    errors.push(`Invalid end_line: ${node.end_line}`);
  }

  if (
    node.start_line !== undefined &&
    node.end_line !== undefined &&
    node.start_line > node.end_line
  ) {
    errors.push(`start_line (${node.start_line}) > end_line (${node.end_line})`);
  }

  // Boolean fields should be boolean
  if (node.is_exported !== undefined && typeof node.is_exported !== "boolean") {
    errors.push(`is_exported should be boolean: ${typeof node.is_exported}`);
  }

  if (node.is_async !== undefined && typeof node.is_async !== "boolean") {
    errors.push(`is_async should be boolean: ${typeof node.is_async}`);
  }

  if (node.is_static !== undefined && typeof node.is_static !== "boolean") {
    errors.push(`is_static should be boolean: ${typeof node.is_static}`);
  }

  // Array fields should be arrays
  if (node.decorators !== undefined && !Array.isArray(node.decorators)) {
    errors.push(`decorators should be array: ${typeof node.decorators}`);
  }

  if (node.type_parameters !== undefined && !Array.isArray(node.type_parameters)) {
    errors.push(`type_parameters should be array: ${typeof node.type_parameters}`);
  }

  return errors;
}

/**
 * Validate parsed edge structure
 */
function validateParsedEdge(
  edge: ParsedEdge,
  _nodeIds: Set<string>,
  config: ParserConfig
): string[] {
  const errors: string[] = [];

  // Required fields
  if (!edge.source_entity_id) {
    errors.push("Missing source_entity_id");
  } else if (!isValidEntityId(edge.source_entity_id, config)) {
    errors.push(`Invalid source_entity_id format: ${edge.source_entity_id}`);
  }

  if (!edge.target_entity_id) {
    errors.push("Missing target_entity_id");
  } else if (!isValidEntityId(edge.target_entity_id, config, true)) {
    // Allow unresolved references for targets (e.g., external types)
    errors.push(`Invalid target_entity_id format: ${edge.target_entity_id}`);
  }

  if (!edge.edge_type) {
    errors.push("Missing edge_type");
  } else if (!VALID_EDGE_TYPES.includes(edge.edge_type as (typeof VALID_EDGE_TYPES)[number])) {
    errors.push(`Invalid edge_type: ${edge.edge_type}`);
  }

  if (!edge.source_file_path) {
    errors.push("Missing source_file_path");
  }

  // Line number should be positive
  if (edge.source_line !== undefined && edge.source_line < 1) {
    errors.push(`Invalid source_line: ${edge.source_line}`);
  }

  return errors;
}

/**
 * Validate external reference structure
 */
function validateExternalRef(ref: ParsedExternalRef): string[] {
  const errors: string[] = [];

  // Must have module_specifier
  if (!ref.module_specifier) {
    errors.push("Missing module_specifier");
  }

  if (!ref.source_entity_id) {
    errors.push("Missing source_entity_id");
  }

  // Boolean fields should be boolean
  if (ref.is_type_only !== undefined && typeof ref.is_type_only !== "boolean") {
    errors.push(`is_type_only should be boolean: ${typeof ref.is_type_only}`);
  }

  if (ref.is_namespace_import !== undefined && typeof ref.is_namespace_import !== "boolean") {
    errors.push(`is_namespace_import should be boolean: ${typeof ref.is_namespace_import}`);
  }

  return errors;
}

/**
 * Validate complete parse result
 */
function validateParseResult(result: StructuralParseResult, config: ParserConfig): string[] {
  const errors: string[] = [];

  // Required top-level fields
  if (!result.filePath) {
    errors.push("Missing filePath");
  }

  if (typeof result.parseTimeMs !== "number") {
    errors.push(`parseTimeMs should be number: ${typeof result.parseTimeMs}`);
  } else if (result.parseTimeMs < 0) {
    errors.push(`parseTimeMs should be non-negative: ${result.parseTimeMs}`);
  }

  if (!result.sourceFileHash) {
    errors.push("Missing sourceFileHash");
  }

  if (!Array.isArray(result.nodes)) {
    errors.push("nodes should be array");
  }

  if (!Array.isArray(result.edges)) {
    errors.push("edges should be array");
  }

  if (!Array.isArray(result.externalRefs)) {
    errors.push("externalRefs should be array");
  }

  if (!Array.isArray(result.warnings)) {
    errors.push("warnings should be array");
  }

  // Validate each node
  const nodeIds = new Set(result.nodes.map((n) => n.entity_id));

  for (const node of result.nodes) {
    const nodeErrors = validateParsedNode(node, config);
    errors.push(...nodeErrors.map((e) => `Node ${node.name}: ${e}`));
  }

  // Validate each edge
  for (const edge of result.edges) {
    const edgeErrors = validateParsedEdge(edge, nodeIds, config);
    errors.push(...edgeErrors.map((e) => `Edge ${edge.edge_type}: ${e}`));
  }

  // Validate each external ref
  for (const ref of result.externalRefs) {
    const refErrors = validateExternalRef(ref);
    errors.push(...refErrors.map((e) => `ExternalRef ${ref.module_specifier}: ${e}`));
  }

  return errors;
}

describe("Schema Validation", () => {
  // ==========================================================================
  // TypeScript Parser Schema Validation
  // ==========================================================================

  describe("TypeScript Parser", () => {
    const parser = createTypeScriptParser();

    it("sample-class.ts produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-functions.ts produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-jsx.tsx produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-jsx.tsx");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-decorators.ts produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-decorators.ts");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-generics.ts produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-generics.ts");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("inline code produces valid schema", async () => {
      const content = `
export interface User {
  id: string;
  name: string;
}

export class UserService {
  private users: User[] = [];

  async getUser(id: string): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }
}

export type UserId = string;
export const DEFAULT_USER: User = { id: "1", name: "Default" };
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    describe("entity ID format", () => {
      it("entity IDs contain repo name", async () => {
        const content = "export class TestClass { method() {} }";
        const result = await parser.parseContent(content, "test.ts", testConfig);

        for (const node of result.nodes) {
          expect(node.entity_id).toContain(testConfig.repoName);
        }
      });

      it("entity IDs are unique within a file", async () => {
        const content = `
export class ClassA { methodA() {} }
export class ClassB { methodB() {} }
export function funcC() {}
`;
        const result = await parser.parseContent(content, "test.ts", testConfig);

        const ids = result.nodes.map((n) => n.entity_id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it("entity IDs are stable across parses", async () => {
        const content = "export class StableClass { stableMethod() {} }";

        const result1 = await parser.parseContent(content, "test.ts", testConfig);
        const result2 = await parser.parseContent(content, "test.ts", testConfig);

        const class1 = result1.nodes.find((n) => n.name === "StableClass");
        const class2 = result2.nodes.find((n) => n.name === "StableClass");

        expect(class1?.entity_id).toBe(class2?.entity_id);
      });
    });

    describe("edge validation", () => {
      it("CONTAINS edges have valid source and target", async () => {
        const content = `
export class Container {
  containedMethod() {}
}
`;
        const result = await parser.parseContent(content, "test.ts", testConfig);

        const containsEdges = result.edges.filter((e) => e.edge_type === "CONTAINS");
        const nodeIds = new Set(result.nodes.map((n) => n.entity_id));

        for (const edge of containsEdges) {
          expect(nodeIds.has(edge.source_entity_id)).toBe(true);
          expect(nodeIds.has(edge.target_entity_id)).toBe(true);
        }
      });

      it("EXTENDS edges reference correct parent", async () => {
        const content = `
class Parent { parentMethod() {} }
class Child extends Parent { childMethod() {} }
`;
        const result = await parser.parseContent(content, "test.ts", testConfig);

        const extendsEdge = result.edges.find((e) => e.edge_type === "EXTENDS");
        expect(extendsEdge).toBeDefined();

        const childNode = result.nodes.find((n) => n.name === "Child");
        expect(extendsEdge?.source_entity_id).toBe(childNode?.entity_id);
      });
    });
  });

  // ==========================================================================
  // Python Parser Schema Validation
  // ==========================================================================

  describe("Python Parser", () => {
    const parser = createPythonParser();

    it("sample-class.py produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-functions.py produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-imports.py produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-imports.py");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-modern-python.py produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-modern-python.py");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("inline code produces valid schema", async () => {
      const content = `
from typing import Optional, List

class UserService:
    def __init__(self):
        self.users: List[dict] = []

    async def get_user(self, user_id: str) -> Optional[dict]:
        return next((u for u in self.users if u["id"] == user_id), None)

    @staticmethod
    def validate_id(user_id: str) -> bool:
        return len(user_id) > 0

def helper_function(x: int, y: int) -> int:
    return x + y
`;
      const result = await parser.parseContent(content, "test.py", testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    describe("entity ID format", () => {
      it("entity IDs contain repo name", async () => {
        const content = `
class TestClass:
    def method(self):
        pass
`;
        const result = await parser.parseContent(content, "test.py", testConfig);

        for (const node of result.nodes) {
          expect(node.entity_id).toContain(testConfig.repoName);
        }
      });
    });
  });

  // ==========================================================================
  // C# Parser Schema Validation
  // ==========================================================================

  describe("C# Parser", () => {
    const parser = createCSharpParser();

    it("sample-class.cs produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.cs");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-interface.cs produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-interface.cs");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-records.cs produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-records.cs");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-async.cs produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-async.cs");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("sample-csharp-12.cs produces valid schema", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-csharp-12.cs");
      const result = await parser.parse(filePath, testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    it("inline code produces valid schema", async () => {
      const content = `
using System;

namespace SchemaTest
{
    public interface IService
    {
        void Process();
    }

    public class UserService : IService
    {
        public string Name { get; set; }

        public void Process()
        {
            Console.WriteLine(Name);
        }

        public async Task<string> GetAsync()
        {
            await Task.Delay(100);
            return Name;
        }
    }
}
`;
      const result = await parser.parseContent(content, "test.cs", testConfig);

      const errors = validateParseResult(result, testConfig);
      expect(errors).toHaveLength(0);
    });

    describe("entity ID format", () => {
      it("entity IDs contain repo name", async () => {
        const content = `
public class TestClass
{
    public void Method() { }
}
`;
        const result = await parser.parseContent(content, "test.cs", testConfig);

        for (const node of result.nodes) {
          expect(node.entity_id).toContain(testConfig.repoName);
        }
      });
    });
  });

  // ==========================================================================
  // Cross-Parser Schema Consistency
  // ==========================================================================

  describe("Cross-Parser Consistency", () => {
    it("all parsers produce same top-level structure", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      const tsContent = "export class Test { method() {} }";
      const pyContent = "class Test:\n    def method(self):\n        pass";
      const csContent = "public class Test { public void Method() { } }";

      const tsResult = await tsParser.parseContent(tsContent, "test.ts", testConfig);
      const pyResult = await pyParser.parseContent(pyContent, "test.py", testConfig);
      const csResult = await csParser.parseContent(csContent, "test.cs", testConfig);

      // All should have same top-level fields
      const expectedFields = [
        "nodes",
        "edges",
        "externalRefs",
        "filePath",
        "sourceFileHash",
        "parseTimeMs",
        "warnings",
      ];

      for (const field of expectedFields) {
        expect(tsResult).toHaveProperty(field);
        expect(pyResult).toHaveProperty(field);
        expect(csResult).toHaveProperty(field);
      }
    });

    it("class nodes have consistent kind across parsers", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      const tsContent = "export class MyClass { }";
      const pyContent = "class MyClass:\n    pass";
      const csContent = "public class MyClass { }";

      const tsResult = await tsParser.parseContent(tsContent, "test.ts", testConfig);
      const pyResult = await pyParser.parseContent(pyContent, "test.py", testConfig);
      const csResult = await csParser.parseContent(csContent, "test.cs", testConfig);

      const tsClass = tsResult.nodes.find((n) => n.name === "MyClass");
      const pyClass = pyResult.nodes.find((n) => n.name === "MyClass");
      const csClass = csResult.nodes.find((n) => n.name === "MyClass");

      // All should use "class" kind
      expect(tsClass?.kind).toBe("class");
      expect(pyClass?.kind).toBe("class");
      expect(csClass?.kind).toBe("class");
    });

    it("method nodes have consistent kind across parsers", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      const tsContent = "export class C { myMethod() {} }";
      const pyContent = "class C:\n    def my_method(self):\n        pass";
      const csContent = "public class C { public void MyMethod() { } }";

      const tsResult = await tsParser.parseContent(tsContent, "test.ts", testConfig);
      const pyResult = await pyParser.parseContent(pyContent, "test.py", testConfig);
      const csResult = await csParser.parseContent(csContent, "test.cs", testConfig);

      const tsMethod = tsResult.nodes.find((n) => n.kind === "method");
      const pyMethod = pyResult.nodes.find((n) => n.kind === "method");
      const csMethod = csResult.nodes.find((n) => n.kind === "method");

      // All should use "method" kind
      expect(tsMethod?.kind).toBe("method");
      expect(pyMethod?.kind).toBe("method");
      expect(csMethod?.kind).toBe("method");
    });
  });
});
