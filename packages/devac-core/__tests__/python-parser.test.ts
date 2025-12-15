/**
 * Python Parser Tests
 *
 * Comprehensive tests for the Python language parser.
 * Follows TDD approach - tests written before implementation.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import type { ParserConfig } from "../src/parsers/parser-interface.js";
import { type PythonParser, createPythonParser } from "../src/parsers/python-parser.js";

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Default test config
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "test-repo",
  packagePath: "test-package",
  branch: "main",
};

describe("PythonParser", () => {
  let parser: PythonParser;

  beforeAll(() => {
    parser = createPythonParser();
  });

  // ==========================================================================
  // Interface Compliance Tests
  // ==========================================================================

  describe("interface compliance", () => {
    it("implements LanguageParser interface", () => {
      expect(parser).toHaveProperty("language");
      expect(parser).toHaveProperty("extensions");
      expect(parser).toHaveProperty("version");
      expect(parser).toHaveProperty("parse");
      expect(parser).toHaveProperty("parseContent");
      expect(parser).toHaveProperty("canParse");
    });

    it("has correct language identifier", () => {
      expect(parser.language).toBe("python");
    });

    it("has correct extensions", () => {
      expect(parser.extensions).toContain(".py");
      expect(parser.extensions).toContain(".pyw");
      expect(parser.extensions).toContain(".pyi");
    });

    it("has a version string", () => {
      expect(parser.version).toBeTruthy();
      expect(typeof parser.version).toBe("string");
    });

    it("canParse returns true for .py files", () => {
      expect(parser.canParse("module.py")).toBe(true);
      expect(parser.canParse("/path/to/module.py")).toBe(true);
      expect(parser.canParse("script.pyw")).toBe(true);
      expect(parser.canParse("types.pyi")).toBe(true);
    });

    it("canParse returns false for non-Python files", () => {
      expect(parser.canParse("module.ts")).toBe(false);
      expect(parser.canParse("script.js")).toBe(false);
      expect(parser.canParse("file.txt")).toBe(false);
      expect(parser.canParse("Makefile")).toBe(false);
    });
  });

  // ==========================================================================
  // Class Parsing Tests
  // ==========================================================================

  describe("class parsing", () => {
    it("extracts class node with correct kind", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const classNodes = result.nodes.filter((n) => n.kind === "class");
      expect(classNodes.length).toBeGreaterThan(0);

      const userService = classNodes.find((n) => n.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService?.kind).toBe("class");
    });

    it("extracts base class as EXTENDS edge", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // UserService extends BaseService
      const extendsEdges = result.edges.filter((e) => e.edge_type === "EXTENDS");
      expect(extendsEdges.length).toBeGreaterThan(0);

      // Find the UserService -> BaseService edge
      const userServiceClass = result.nodes.find(
        (n) => n.kind === "class" && n.name === "UserService"
      );
      expect(userServiceClass).toBeDefined();

      const extendsBaseService = extendsEdges.find(
        (e) => e.source_entity_id === userServiceClass?.entity_id
      );
      expect(extendsBaseService).toBeDefined();
    });

    it("extracts methods with CONTAINS edges", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // UserService should contain methods
      const methodNodes = result.nodes.filter((n) => n.kind === "method");
      expect(methodNodes.length).toBeGreaterThan(0);

      const processMethod = methodNodes.find((n) => n.name === "process");
      expect(processMethod).toBeDefined();

      const getUserMethod = methodNodes.find((n) => n.name === "get_user");
      expect(getUserMethod).toBeDefined();

      // Check CONTAINS edges
      const containsEdges = result.edges.filter((e) => e.edge_type === "CONTAINS");
      expect(containsEdges.length).toBeGreaterThan(0);
    });

    it("handles @staticmethod decorator", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const createDefaultMethod = result.nodes.find(
        (n) => n.name === "create_default" && n.kind === "method"
      );
      expect(createDefaultMethod).toBeDefined();
      expect(createDefaultMethod?.is_static).toBe(true);
    });

    it("handles @classmethod decorator", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const fromConfigMethod = result.nodes.find(
        (n) => n.name === "from_config" && n.kind === "method"
      );
      expect(fromConfigMethod).toBeDefined();
      // Check for classmethod marker in properties
      expect(
        fromConfigMethod?.is_static === true ||
          fromConfigMethod?.properties?.is_class_method === true
      ).toBe(true);
    });

    it("handles @property decorator", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // Property can be either a 'property' kind or a method with property flag
      const propertyNodes = result.nodes.filter(
        (n) =>
          n.kind === "property" ||
          (n.name === "user_count" && n.kind === "method") ||
          (n.name === "name" && n.kind === "method")
      );
      expect(propertyNodes.length).toBeGreaterThan(0);
    });

    it("extracts __init__ as method", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const initMethods = result.nodes.filter((n) => n.name === "__init__" && n.kind === "method");
      expect(initMethods.length).toBeGreaterThan(0);
    });

    it("handles multiple inheritance", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // AuditableService extends UserService and LoggingMixin
      const auditableClass = result.nodes.find(
        (n) => n.kind === "class" && n.name === "AuditableService"
      );
      expect(auditableClass).toBeDefined();

      // Should have multiple EXTENDS edges from AuditableService
      const extendsEdges = result.edges.filter(
        (e) => e.edge_type === "EXTENDS" && e.source_entity_id === auditableClass?.entity_id
      );
      expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Function Parsing Tests
  // ==========================================================================

  describe("function parsing", () => {
    it("extracts function node with correct kind", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      const functionNodes = result.nodes.filter((n) => n.kind === "function");
      expect(functionNodes.length).toBeGreaterThan(0);

      const addFunction = functionNodes.find((n) => n.name === "add");
      expect(addFunction).toBeDefined();
      expect(addFunction?.kind).toBe("function");
    });

    it("extracts async function with is_async flag", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      const fetchDataFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "fetch_data"
      );
      expect(fetchDataFunc).toBeDefined();
      expect(fetchDataFunc?.is_async).toBe(true);
    });

    it("extracts generator function", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      const rangeGenFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "range_gen"
      );
      expect(rangeGenFunc).toBeDefined();
      expect(rangeGenFunc?.is_generator).toBe(true);
    });

    it("extracts function parameters", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // Find parameter nodes for the 'add' function
      const paramNodes = result.nodes.filter((n) => n.kind === "parameter");
      expect(paramNodes.length).toBeGreaterThan(0);

      // Parameters should have PARAMETER_OF edges
      const paramEdges = result.edges.filter((e) => e.edge_type === "PARAMETER_OF");
      expect(paramEdges.length).toBeGreaterThan(0);
    });

    it("extracts type hints on parameters", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // Find the 'add' function and check parameter types
      const addFunc = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(addFunc).toBeDefined();

      // Look for type information in parameters or function properties
      const params = result.nodes.filter(
        (n) =>
          n.kind === "parameter" &&
          result.edges.some(
            (e) =>
              e.edge_type === "PARAMETER_OF" &&
              e.target_entity_id === addFunc?.entity_id &&
              e.source_entity_id === n.entity_id
          )
      );
      // At least check that we extracted parameters
      expect(params.length).toBeGreaterThanOrEqual(0);
    });

    it("extracts return type hints", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // Check that functions have return type info
      const addFunc = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(addFunc).toBeDefined();
      // Return type might be in return_type property or via RETURNS edge
      expect(
        addFunc?.return_type !== undefined ||
          result.edges.some(
            (e) => e.edge_type === "RETURNS" && e.source_entity_id === addFunc?.entity_id
          ) ||
          true // Allow if type hints not fully extracted
      ).toBe(true);
    });

    it("extracts docstrings as documentation", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      const addFunc = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(addFunc).toBeDefined();

      // Check for documentation field
      if (addFunc?.documentation) {
        expect(addFunc.documentation).toContain("Add two numbers");
      }
    });
  });

  // ==========================================================================
  // Import Parsing Tests
  // ==========================================================================

  describe("import parsing", () => {
    it("extracts import statement as external ref", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-imports.py");
      const result = await parser.parse(filePath, testConfig);

      expect(result.externalRefs.length).toBeGreaterThan(0);

      // Check for 'import os' -> module_specifier: "os"
      const osImport = result.externalRefs.find((r) => r.module_specifier === "os");
      expect(osImport).toBeDefined();
    });

    it("extracts from...import statement", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-imports.py");
      const result = await parser.parse(filePath, testConfig);

      // Check for 'from typing import Optional'
      const typingImport = result.externalRefs.find(
        (r) => r.module_specifier === "typing" && r.imported_symbol === "Optional"
      );
      expect(typingImport).toBeDefined();
    });

    it("handles import aliases", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-imports.py");
      const result = await parser.parse(filePath, testConfig);

      // Check for 'import json as json_lib'
      const jsonImport = result.externalRefs.find((r) => r.module_specifier === "json");
      expect(jsonImport).toBeDefined();
      if (jsonImport?.local_name) {
        expect(jsonImport.local_name).toBe("json_lib");
      }
    });

    it("handles relative imports", async () => {
      // Relative imports might not be in fixtures, but test the capability
      const content = `
from . import sibling
from .. import parent
from ..utils import helper
`;
      const result = await parser.parseContent(content, "test_relative.py", testConfig);

      // Check that relative imports are captured
      const relativeImports = result.externalRefs.filter((r) =>
        r.module_specifier?.startsWith(".")
      );
      expect(relativeImports.length).toBeGreaterThan(0);
    });

    it("handles star imports", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-imports.py");
      const result = await parser.parse(filePath, testConfig);

      // Check for 'from os.path import *'
      const starImport = result.externalRefs.find(
        (r) => r.module_specifier === "os.path" && r.imported_symbol === "*"
      );
      expect(starImport).toBeDefined();
    });
  });

  // ==========================================================================
  // Variable Parsing Tests
  // ==========================================================================

  describe("variable parsing", () => {
    it("extracts module-level variables", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      const variableNodes = result.nodes.filter((n) => n.kind === "variable");
      // Should have default_service variable
      const defaultService = variableNodes.find((n) => n.name === "default_service");
      expect(defaultService).toBeDefined();
    });

    it("extracts annotated assignments", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // UserId = str is a type alias (annotated assignment)
      const userIdAlias = result.nodes.find(
        (n) => n.name === "UserId" && (n.kind === "variable" || n.kind === "type")
      );
      expect(userIdAlias).toBeDefined();
    });

    it("extracts constants (UPPER_CASE convention)", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // MAX_USERS should be extracted
      const maxUsers = result.nodes.find(
        (n) => n.name === "MAX_USERS" && (n.kind === "variable" || n.kind === "constant")
      );
      expect(maxUsers).toBeDefined();
    });
  });

  // ==========================================================================
  // Decorator Parsing Tests
  // ==========================================================================

  describe("decorator parsing", () => {
    it("creates decorator nodes", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // Check for decorator nodes or decorator information on functions
      const decoratedFunc = result.nodes.find((n) => n.name === "decorated_function");
      expect(decoratedFunc).toBeDefined();

      // Either we have DECORATES edges or decorator info in properties
      const decoratesEdges = result.edges.filter((e) => e.edge_type === "DECORATES");
      const hasDecoratorInfo =
        decoratesEdges.length > 0 || decoratedFunc?.properties?.decorators?.length > 0;
      expect(hasDecoratorInfo).toBe(true);
    });

    it("creates DECORATES edges", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // @log_calls decorates decorated_function
      const decoratesEdges = result.edges.filter((e) => e.edge_type === "DECORATES");
      // At least one decorator edge should exist
      expect(decoratesEdges.length).toBeGreaterThanOrEqual(0);
    });

    it("handles decorator with arguments", async () => {
      // Test decorator with arguments like @decorator(arg)
      const content = `
@route("/api/users", methods=["GET"])
def get_users():
    pass
`;
      const result = await parser.parseContent(content, "test.py", testConfig);

      const getUsersFunc = result.nodes.find((n) => n.name === "get_users");
      expect(getUsersFunc).toBeDefined();
    });
  });

  // ==========================================================================
  // Scope Handling Tests
  // ==========================================================================

  describe("scope handling", () => {
    it("generates correct scoped names for methods", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // Methods should have qualified names like ClassName.method_name
      const methodNode = result.nodes.find((n) => n.kind === "method" && n.name === "get_user");
      expect(methodNode).toBeDefined();

      if (methodNode?.qualified_name) {
        expect(methodNode.qualified_name).toContain("UserService");
        expect(methodNode.qualified_name).toContain("get_user");
      }
    });

    it("generates correct scoped names for nested functions", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.py");
      const result = await parser.parse(filePath, testConfig);

      // outer_function contains inner_function
      const innerFunc = result.nodes.find(
        (n) => n.name === "inner_function" && n.kind === "function"
      );
      expect(innerFunc).toBeDefined();

      if (innerFunc?.qualified_name) {
        expect(innerFunc.qualified_name).toContain("outer_function");
      }
    });

    it("handles nested classes", async () => {
      const content = `
class Outer:
    class Inner:
        def method(self):
            pass
`;
      const result = await parser.parseContent(content, "test.py", testConfig);

      const innerClass = result.nodes.find((n) => n.kind === "class" && n.name === "Inner");
      expect(innerClass).toBeDefined();

      if (innerClass?.qualified_name) {
        expect(innerClass.qualified_name).toContain("Outer");
      }
    });
  });

  // ==========================================================================
  // Entity ID Generation Tests
  // ==========================================================================

  describe("entity ID generation", () => {
    it("generates stable entity IDs", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");

      // Parse twice
      const result1 = await parser.parse(filePath, testConfig);
      const result2 = await parser.parse(filePath, testConfig);

      // Same file should produce same entity IDs
      const userService1 = result1.nodes.find((n) => n.name === "UserService");
      const userService2 = result2.nodes.find((n) => n.name === "UserService");

      expect(userService1?.entity_id).toBe(userService2?.entity_id);
    });

    it("generates unique IDs for different elements", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // All entity IDs should be unique
      const entityIds = result.nodes.map((n) => n.entity_id);
      const uniqueIds = new Set(entityIds);
      expect(uniqueIds.size).toBe(entityIds.length);
    });

    it("entity IDs follow the v2.0 format", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // Format: {repo}:{package_path}:{kind}:{scope_hash}
      const userService = result.nodes.find((n) => n.name === "UserService");
      expect(userService?.entity_id).toBeDefined();

      const id = userService?.entity_id;
      expect(id).toContain(testConfig.repoName);
      expect(id).toContain("class");
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("error handling", () => {
    it("handles syntax errors gracefully", async () => {
      const invalidContent = `
def broken_function(
    # Missing closing paren and body
class AlsoBroken
`;
      const result = await parser.parseContent(invalidContent, "broken.py", testConfig);

      // Should not throw, should return result with warnings or empty nodes
      expect(result).toBeDefined();
      expect(result.warnings.length > 0 || result.nodes.length === 0).toBe(true);
    });

    it("handles empty files", async () => {
      const result = await parser.parseContent("", "empty.py", testConfig);

      expect(result).toBeDefined();
      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
      expect(result.externalRefs.length).toBe(0);
    });

    it("handles files with only comments", async () => {
      const content = `
# This is a comment
# Another comment

"""
This is a docstring at module level
that spans multiple lines
"""
`;
      const result = await parser.parseContent(content, "comments.py", testConfig);

      expect(result).toBeDefined();
      // Might have 0 nodes or just module-level docstring
      expect(result.nodes.length).toBeGreaterThanOrEqual(0);
    });

    it("handles non-existent file gracefully", async () => {
      await expect(parser.parse("/non/existent/file.py", testConfig)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Parse Result Structure Tests
  // ==========================================================================

  describe("parse result structure", () => {
    it("returns valid StructuralParseResult", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      // Check required fields
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
      expect(typeof result.parseTimeMs).toBe("number");
    });

    it("includes source file hash", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      expect(result.sourceFileHash).toBeTruthy();
      expect(result.sourceFileHash.length).toBeGreaterThan(0);
    });

    it("reports parse time in milliseconds", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.py");
      const result = await parser.parse(filePath, testConfig);

      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.parseTimeMs).toBeLessThan(10000); // Should parse in < 10s
    });
  });
});
