/**
 * Parser Snapshot Tests
 *
 * These tests capture the expected AST output for fixture files,
 * enabling regression detection when parser behavior changes.
 *
 * Run with --update to update snapshots when intentional changes are made.
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createCSharpParser } from "../src/parsers/csharp-parser.js";
import type { ParserConfig, StructuralParseResult } from "../src/parsers/parser-interface.js";
import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import { createPythonParser } from "../src/parsers/python-parser.js";
import { createTypeScriptParser } from "../src/parsers/typescript-parser.js";

// Test fixtures paths - using the separate fixture packages
const TS_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-typescript/src");
const PY_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-python");
const CS_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-csharp");

// Default test config for inline code tests (no packageRoot needed - uses relative filenames)
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "snapshot-test-repo",
  packagePath: "snapshot-test-package",
  branch: "main",
};

// Configs for file-based tests - include packageRoot so entity IDs are deterministic
// across different worktrees (by making file paths relative to package root)
const tsTestConfig: ParserConfig = {
  ...testConfig,
  packageRoot: TS_FIXTURES_DIR,
};

// Note: Python parser doesn't need packageRoot since it doesn't include
// file paths in entity ID hashes (it only uses qualified_name)

const csTestConfig: ParserConfig = {
  ...testConfig,
  packageRoot: CS_FIXTURES_DIR,
};

/**
 * Normalize parse result for snapshot comparison
 * Removes volatile fields like parseTimeMs and sourceFileHash
 */
function normalizeForSnapshot(result: StructuralParseResult): object {
  return {
    // Sort nodes by entity_id for consistent ordering
    nodes: result.nodes
      .map((node) => ({
        name: node.name,
        kind: node.kind,
        qualified_name: node.qualified_name,
        is_exported: node.is_exported,
        is_default_export: node.is_default_export,
        is_async: node.is_async,
        is_static: node.is_static,
        is_abstract: node.is_abstract,
        is_generator: node.is_generator,
        type_parameters: node.type_parameters,
        type_signature: node.type_signature,
        decorators: node.decorators,
        documentation: node.documentation ? "HAS_DOCUMENTATION" : undefined,
        properties: node.properties,
        // Include location for regression detection
        start_line: node.start_line,
        end_line: node.end_line,
      }))
      .sort((a, b) => {
        // Sort by kind first, then by name
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return a.name.localeCompare(b.name);
      }),
    // Sort edges for consistent ordering
    edges: result.edges
      .map((edge) => ({
        edge_type: edge.edge_type,
        // Use source/target names derived from nodes if possible
        source_id_suffix: edge.source_entity_id.split(":").slice(-2).join(":"),
        target_id_suffix: edge.target_entity_id.split(":").slice(-2).join(":"),
      }))
      .sort((a, b) => {
        if (a.edge_type !== b.edge_type) return a.edge_type.localeCompare(b.edge_type);
        return a.source_id_suffix.localeCompare(b.source_id_suffix);
      }),
    // Sort external refs
    externalRefs: result.externalRefs
      .map((ref) => ({
        module_specifier: ref.module_specifier,
        imported_symbol: ref.imported_symbol,
        local_alias: ref.local_alias,
        is_type_only: ref.is_type_only,
        import_style: ref.import_style,
      }))
      .sort((a, b) => {
        if (a.module_specifier !== b.module_specifier) {
          return a.module_specifier.localeCompare(b.module_specifier);
        }
        return (a.imported_symbol || "").localeCompare(b.imported_symbol || "");
      }),
    // Include warning count but not actual messages (may vary)
    warningCount: result.warnings.length,
  };
}

// Skip file-based snapshots in CI (platform differences in line endings/paths)
const isCI = process.env.CI === "true";
const describeFileSnapshots = isCI ? describe.skip : describe;

describe("Parser Snapshots", () => {
  // ==========================================================================
  // TypeScript Parser Snapshots
  // ==========================================================================

  describeFileSnapshots("TypeScript Parser", () => {
    const parser = createTypeScriptParser();

    it("sample-class.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-functions.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-jsx.tsx snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-jsx.tsx");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-decorators.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-decorators.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-generics.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-generics.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-advanced-types.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-advanced-types.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-modules.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-modules.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-edge-cases.ts snapshot", async () => {
      const filePath = path.join(TS_FIXTURES_DIR, "sample-edge-cases.ts");
      const result = await parser.parse(filePath, tsTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    describe("inline code snapshots", () => {
      it("simple class snapshot", async () => {
        const content = `
export class SimpleClass {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  getValue(): number {
    return this.value;
  }
}
`;
        const result = await parser.parseContent(content, "simple-class.ts", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });

      it("async generator snapshot", async () => {
        const content = `
export async function* asyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    await delay(100);
    yield item;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
`;
        const result = await parser.parseContent(content, "async-gen.ts", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });

      it("type aliases snapshot", async () => {
        const content = `
export type UserId = string & { readonly __brand: "UserId" };
export type OrderId = string & { readonly __brand: "OrderId" };

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
`;
        const result = await parser.parseContent(content, "type-aliases.ts", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });
    });
  });

  // ==========================================================================
  // Python Parser Snapshots
  // ==========================================================================

  describeFileSnapshots("Python Parser", () => {
    const parser = createPythonParser();

    it("sample_class.py snapshot", async () => {
      const filePath = path.join(PY_FIXTURES_DIR, "sample_class.py");
      const result = await parser.parse(filePath, testConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample_functions.py snapshot", async () => {
      const filePath = path.join(PY_FIXTURES_DIR, "sample_functions.py");
      const result = await parser.parse(filePath, testConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample_imports.py snapshot", async () => {
      const filePath = path.join(PY_FIXTURES_DIR, "sample_imports.py");
      const result = await parser.parse(filePath, testConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample_modern_python.py snapshot", async () => {
      const filePath = path.join(PY_FIXTURES_DIR, "sample_modern_python.py");
      const result = await parser.parse(filePath, testConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    describe("inline code snapshots", () => {
      it("dataclass snapshot", async () => {
        const content = `
from dataclasses import dataclass, field

@dataclass
class User:
    name: str
    age: int
    email: str = ""
    tags: list[str] = field(default_factory=list)

    def greet(self) -> str:
        return f"Hello, {self.name}!"
`;
        const result = await parser.parseContent(content, "dataclass.py", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });

      it("protocol class snapshot", async () => {
        const content = `
from typing import Protocol, Self

class Serializable(Protocol):
    def to_json(self) -> str: ...

    @classmethod
    def from_json(cls, data: str) -> Self: ...

class Comparable(Protocol):
    def __lt__(self, other: Self) -> bool: ...
    def __eq__(self, other: object) -> bool: ...
`;
        const result = await parser.parseContent(content, "protocol.py", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });
    });
  });

  // ==========================================================================
  // C# Parser Snapshots
  // ==========================================================================

  describeFileSnapshots("C# Parser", () => {
    const parser = createCSharpParser();

    it("sample-class.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-class.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-interface.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-interface.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-records.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-records.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-generics.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-generics.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-async.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-async.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-attributes.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-attributes.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-extension.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-extension.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    it("sample-csharp-12.cs snapshot", async () => {
      const filePath = path.join(CS_FIXTURES_DIR, "sample-csharp-12.cs");
      const result = await parser.parse(filePath, csTestConfig);
      const normalized = normalizeForSnapshot(result);

      expect(normalized).toMatchSnapshot();
    });

    describe("inline code snapshots", () => {
      it("record types snapshot", async () => {
        const content = `
public record Person(string FirstName, string LastName);

public record Employee(string FirstName, string LastName, string Department)
    : Person(FirstName, LastName);

public readonly record struct Point(double X, double Y);
`;
        const result = await parser.parseContent(content, "records.cs", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });

      it("pattern matching snapshot", async () => {
        const content = `
public class PatternDemo
{
    public string Classify(object obj) => obj switch
    {
        null => "null",
        string s when s.Length > 10 => "long string",
        string s => $"string: {s}",
        int n when n < 0 => "negative",
        int n => $"number: {n}",
        _ => "unknown"
    };
}
`;
        const result = await parser.parseContent(content, "patterns.cs", testConfig);
        const normalized = normalizeForSnapshot(result);

        expect(normalized).toMatchSnapshot();
      });
    });
  });

  // ==========================================================================
  // Cross-Parser Consistency Tests
  // ==========================================================================

  describe("Cross-Parser Consistency", () => {
    it("same entity in different languages produces consistent structure", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      // Simple class with method in each language
      const tsContent = `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`;
      const pyContent = `
class Calculator:
    def add(self, a: int, b: int) -> int:
        return a + b
`;
      const csContent = `
public class Calculator
{
    public int Add(int a, int b)
    {
        return a + b;
    }
}
`;

      const tsResult = await tsParser.parseContent(tsContent, "calc.ts", testConfig);
      const pyResult = await pyParser.parseContent(pyContent, "calc.py", testConfig);
      const csResult = await csParser.parseContent(csContent, "calc.cs", testConfig);

      // Each should have a class node
      const tsClass = tsResult.nodes.find((n) => n.kind === "class");
      const pyClass = pyResult.nodes.find((n) => n.kind === "class");
      const csClass = csResult.nodes.find((n) => n.kind === "class");

      expect(tsClass).toBeDefined();
      expect(pyClass).toBeDefined();
      expect(csClass).toBeDefined();

      // Each should have a method node
      const tsMethod = tsResult.nodes.find((n) => n.kind === "method");
      const pyMethod = pyResult.nodes.find((n) => n.kind === "method");
      const csMethod = csResult.nodes.find((n) => n.kind === "method");

      expect(tsMethod).toBeDefined();
      expect(pyMethod).toBeDefined();
      expect(csMethod).toBeDefined();

      // Each should have a CONTAINS edge from class to method
      const tsContains = tsResult.edges.find((e) => e.edge_type === "CONTAINS");
      const pyContains = pyResult.edges.find((e) => e.edge_type === "CONTAINS");
      const csContains = csResult.edges.find((e) => e.edge_type === "CONTAINS");

      expect(tsContains).toBeDefined();
      expect(pyContains).toBeDefined();
      expect(csContains).toBeDefined();
    });
  });
});
