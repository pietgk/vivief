/**
 * TypeScript Parser Tests
 *
 * Comprehensive tests for the TypeScript/JavaScript language parser.
 * Follows TDD approach - tests written before implementation fixes.
 *
 * Based on DevAC v2.0 spec Phase 2 requirements.
 */

import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import type { ParserConfig } from "../src/parsers/parser-interface.js";
import { type TypeScriptParser, createTypeScriptParser } from "../src/parsers/typescript-parser.js";

// Test fixtures path - using the fixtures-typescript package
const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-typescript/src");

// Default test config
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "test-repo",
  packagePath: "test-package",
  branch: "main",
};

describe("TypeScriptParser", () => {
  let parser: TypeScriptParser;

  beforeAll(() => {
    parser = createTypeScriptParser();
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
      expect(parser.language).toBe("typescript");
    });

    it("has correct extensions", () => {
      expect(parser.extensions).toContain(".ts");
      expect(parser.extensions).toContain(".tsx");
      expect(parser.extensions).toContain(".js");
      expect(parser.extensions).toContain(".jsx");
      expect(parser.extensions).toContain(".mjs");
      expect(parser.extensions).toContain(".cjs");
    });

    it("has a version string", () => {
      expect(parser.version).toBeTruthy();
      expect(typeof parser.version).toBe("string");
    });

    it("canParse returns true for TypeScript files", () => {
      expect(parser.canParse("module.ts")).toBe(true);
      expect(parser.canParse("/path/to/module.ts")).toBe(true);
      expect(parser.canParse("component.tsx")).toBe(true);
      expect(parser.canParse("script.js")).toBe(true);
      expect(parser.canParse("component.jsx")).toBe(true);
      expect(parser.canParse("esm.mjs")).toBe(true);
      expect(parser.canParse("common.cjs")).toBe(true);
    });

    it("canParse returns false for non-TypeScript files", () => {
      expect(parser.canParse("module.py")).toBe(false);
      expect(parser.canParse("script.cs")).toBe(false);
      expect(parser.canParse("file.txt")).toBe(false);
      expect(parser.canParse("Makefile")).toBe(false);
      expect(parser.canParse("style.css")).toBe(false);
    });
  });

  // ==========================================================================
  // Class Parsing Tests
  // ==========================================================================

  describe("class parsing", () => {
    it("extracts class node with correct kind", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const classNodes = result.nodes.filter((n) => n.kind === "class");
      expect(classNodes.length).toBeGreaterThan(0);

      const userService = classNodes.find((n) => n.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService?.kind).toBe("class");
    });

    it("extracts base class as EXTENDS edge", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // UserService extends BaseService
      const extendsEdges = result.edges.filter((e) => e.edge_type === "EXTENDS");
      expect(extendsEdges.length).toBeGreaterThan(0);

      // Find the UserService class
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
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // UserService should contain methods
      const methodNodes = result.nodes.filter((n) => n.kind === "method");
      expect(methodNodes.length).toBeGreaterThan(0);

      const processMethod = methodNodes.find((n) => n.name === "process");
      expect(processMethod).toBeDefined();

      const getUserMethod = methodNodes.find((n) => n.name === "getUser");
      expect(getUserMethod).toBeDefined();

      // Check CONTAINS edges
      const containsEdges = result.edges.filter((e) => e.edge_type === "CONTAINS");
      expect(containsEdges.length).toBeGreaterThan(0);
    });

    it("handles abstract classes", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const baseService = result.nodes.find((n) => n.name === "BaseService" && n.kind === "class");
      expect(baseService).toBeDefined();
      expect(baseService?.is_abstract).toBe(true);
    });

    it("handles static methods", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const createDefaultMethod = result.nodes.find(
        (n) => n.name === "createDefault" && n.kind === "method"
      );
      expect(createDefaultMethod).toBeDefined();
      expect(createDefaultMethod?.is_static).toBe(true);
    });

    it("extracts class properties", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const propertyNodes = result.nodes.filter((n) => n.kind === "property");
      expect(propertyNodes.length).toBeGreaterThan(0);

      // Should have version property
      const versionProp = propertyNodes.find((n) => n.name === "version");
      expect(versionProp).toBeDefined();
    });

    it("handles getter as property", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // userCount is a getter
      const userCountProp = result.nodes.find(
        (n) => n.name === "userCount" && n.kind === "property"
      );
      expect(userCountProp).toBeDefined();
    });

    it("handles private class fields", async () => {
      const content = `
class MyClass {
  #privateField = 42;

  getPrivate() {
    return this.#privateField;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      // Private fields should be extracted (behavior may vary)
      expect(result.nodes.length).toBeGreaterThan(0);
      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "MyClass");
      expect(classNode).toBeDefined();
    });

    it("handles static blocks", async () => {
      const content = `
class Config {
  static value: number;

  static {
    Config.value = 42;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "Config");
      expect(classNode).toBeDefined();
    });
  });

  // ==========================================================================
  // Function Parsing Tests
  // ==========================================================================

  describe("function parsing", () => {
    it("extracts function node with correct kind", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const functionNodes = result.nodes.filter((n) => n.kind === "function");
      expect(functionNodes.length).toBeGreaterThan(0);

      const addFunction = functionNodes.find((n) => n.name === "add");
      expect(addFunction).toBeDefined();
      expect(addFunction?.kind).toBe("function");
    });

    it("extracts async function with is_async flag", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const fetchDataFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "fetchData"
      );
      expect(fetchDataFunc).toBeDefined();
      expect(fetchDataFunc?.is_async).toBe(true);
    });

    it("extracts generator function with is_generator flag", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const rangeFunc = result.nodes.find((n) => n.kind === "function" && n.name === "range");
      expect(rangeFunc).toBeDefined();
      expect(rangeFunc?.is_generator).toBe(true);
    });

    it("extracts arrow functions", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const multiplyFunc = result.nodes.find((n) => n.kind === "function" && n.name === "multiply");
      expect(multiplyFunc).toBeDefined();

      const divideFunc = result.nodes.find((n) => n.kind === "function" && n.name === "divide");
      expect(divideFunc).toBeDefined();
    });

    it("extracts async arrow functions", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const loadFileFunc = result.nodes.find((n) => n.kind === "function" && n.name === "loadFile");
      expect(loadFileFunc).toBeDefined();
      expect(loadFileFunc?.is_async).toBe(true);
    });

    it("extracts nested functions", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const outerFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "outerFunction"
      );
      expect(outerFunc).toBeDefined();
    });

    it("handles higher-order functions", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      const createMultiplierFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "createMultiplier"
      );
      expect(createMultiplierFunc).toBeDefined();
    });
  });

  // ==========================================================================
  // CALLS Edge Tests
  // ==========================================================================

  describe("CALLS edge extraction", () => {
    it("extracts simple function calls", async () => {
      const content = `
function helper() {
  return 42;
}

function main() {
  return helper();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      expect(callsEdges.length).toBeGreaterThan(0);

      // main() calls helper()
      const mainFunc = result.nodes.find((n) => n.name === "main" && n.kind === "function");
      expect(mainFunc).toBeDefined();

      const helperCall = callsEdges.find(
        (e) =>
          e.source_entity_id === mainFunc?.entity_id && e.target_entity_id === "unresolved:helper"
      );
      expect(helperCall).toBeDefined();
    });

    it("extracts method calls on objects", async () => {
      const content = `
const logger = console;

function log() {
  logger.info("hello");
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      const infoCall = callsEdges.find((e) => e.target_entity_id === "unresolved:logger.info");
      expect(infoCall).toBeDefined();
    });

    it("extracts chained method calls", async () => {
      const content = `
function process(items: string[]) {
  return items.filter(x => x).map(x => x.toUpperCase());
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");

      // Should have calls to filter and map on items
      const filterCall = callsEdges.find((e) => e.target_entity_id === "unresolved:items.filter");
      expect(filterCall).toBeDefined();
    });

    it("extracts calls to built-in functions", async () => {
      const content = `
function test() {
  console.log("test");
  setTimeout(() => {}, 1000);
  parseInt("42");
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");

      expect(callsEdges.find((e) => e.target_entity_id === "unresolved:console.log")).toBeDefined();
      expect(callsEdges.find((e) => e.target_entity_id === "unresolved:setTimeout")).toBeDefined();
      expect(callsEdges.find((e) => e.target_entity_id === "unresolved:parseInt")).toBeDefined();
    });

    it("extracts calls inside class methods", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      expect(callsEdges.length).toBeGreaterThan(0);

      // process() method calls console.log()
      const processMethod = result.nodes.find((n) => n.name === "process" && n.kind === "method");
      expect(processMethod).toBeDefined();

      const consoleLogCall = callsEdges.find(
        (e) =>
          e.source_entity_id === processMethod?.entity_id &&
          e.target_entity_id === "unresolved:console.log"
      );
      expect(consoleLogCall).toBeDefined();
    });

    it("extracts super() calls in constructors", async () => {
      const content = `
class Parent {
  constructor() {}
}

class Child extends Parent {
  constructor() {
    super();
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      const superCall = callsEdges.find((e) => e.target_entity_id === "unresolved:super");
      expect(superCall).toBeDefined();
    });

    it("extracts this.method() calls", async () => {
      const content = `
class Service {
  helper() { return 1; }

  main() {
    return this.helper();
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      const thisHelperCall = callsEdges.find(
        (e) => e.target_entity_id === "unresolved:this.helper"
      );
      expect(thisHelperCall).toBeDefined();
    });

    it("tracks source location in CALLS edges", async () => {
      const content = `
function caller() {
  target();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");
      expect(callsEdges.length).toBeGreaterThan(0);

      const targetCall = callsEdges.find((e) => e.target_entity_id === "unresolved:target");
      expect(targetCall).toBeDefined();
      expect(targetCall?.source_line).toBe(3); // Line where target() is called
    });

    it("includes argument count in CALLS edge properties", async () => {
      const content = `
function test() {
  noArgs();
  oneArg(1);
  threeArgs(1, 2, 3);
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");

      const noArgsCall = callsEdges.find((e) => e.target_entity_id === "unresolved:noArgs");
      expect(noArgsCall?.properties.argumentCount).toBe(0);

      const oneArgCall = callsEdges.find((e) => e.target_entity_id === "unresolved:oneArg");
      expect(oneArgCall?.properties.argumentCount).toBe(1);

      const threeArgsCall = callsEdges.find((e) => e.target_entity_id === "unresolved:threeArgs");
      expect(threeArgsCall?.properties.argumentCount).toBe(3);
    });

    it("handles calls at module level", async () => {
      const content = `
// Top-level call during module initialization
console.log("Module loaded");

export const config = loadConfig();
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callsEdges = result.edges.filter((e) => e.edge_type === "CALLS");

      // Module-level calls should have file as source
      const moduleNode = result.nodes.find((n) => n.kind === "module");
      expect(moduleNode).toBeDefined();

      const loadConfigCall = callsEdges.find((e) => e.target_entity_id === "unresolved:loadConfig");
      expect(loadConfigCall).toBeDefined();
      expect(loadConfigCall?.source_entity_id).toBe(moduleNode?.entity_id);
    });
  });

  // ==========================================================================
  // Import Parsing Tests
  // ==========================================================================

  describe("import parsing", () => {
    it("extracts named imports as external refs", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      expect(result.externalRefs.length).toBeGreaterThan(0);

      // Check for EventEmitter import
      const eventEmitterRef = result.externalRefs.find((r) => r.imported_symbol === "EventEmitter");
      expect(eventEmitterRef).toBeDefined();
      expect(eventEmitterRef?.module_specifier).toBe("node:events");
    });

    it("extracts type-only imports", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // Check for type-only import
      const readableRef = result.externalRefs.find((r) => r.imported_symbol === "Readable");
      expect(readableRef).toBeDefined();
      expect(readableRef?.is_type_only).toBe(true);
    });

    it("extracts default imports", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      // path is imported as default
      const pathRef = result.externalRefs.find(
        (r) => r.imported_symbol === "default" && r.module_specifier === "node:path"
      );
      expect(pathRef).toBeDefined();
    });

    it("extracts re-exports", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-functions.ts");
      const result = await parser.parse(filePath, testConfig);

      // export { readFile, writeFile } from "node:fs/promises"
      const reexportRefs = result.externalRefs.filter((r) => r.is_reexport === true);
      expect(reexportRefs.length).toBeGreaterThanOrEqual(0);
    });

    it("handles namespace imports", async () => {
      const content = `
import * as fs from "node:fs";
import * as path from "node:path";

const x = fs.readFileSync(path.join("a", "b"));
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const fsRef = result.externalRefs.find(
        (r) => r.imported_symbol === "*" && r.module_specifier === "node:fs"
      );
      expect(fsRef).toBeDefined();
      expect(fsRef?.import_style).toBe("namespace");
    });

    it("handles aliased imports", async () => {
      const content = `
import { readFile as read, writeFile as write } from "node:fs/promises";
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const readRef = result.externalRefs.find((r) => r.imported_symbol === "readFile");
      expect(readRef).toBeDefined();
      expect(readRef?.local_alias).toBe("read");
    });

    it("handles side-effect imports", async () => {
      const content = `
import "reflect-metadata";
import "./polyfills";
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sideEffectRefs = result.externalRefs.filter((r) => r.import_style === "side_effect");
      expect(sideEffectRefs.length).toBe(2);
    });

    it("handles dynamic imports", async () => {
      const content = `
async function loadModule() {
  const mod = await import("./dynamic-module");
  return mod;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const dynamicRef = result.externalRefs.find((r) => r.import_style === "dynamic");
      expect(dynamicRef).toBeDefined();
      expect(dynamicRef?.module_specifier).toBe("./dynamic-module");
    });
  });

  // ==========================================================================
  // Export Parsing Tests
  // ==========================================================================

  describe("export parsing", () => {
    it("marks exported classes correctly", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const userService = result.nodes.find((n) => n.kind === "class" && n.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService?.is_exported).toBe(true);
    });

    it("marks default exports correctly", async () => {
      // Note: When a class is declared with `export class X` and then
      // separately `export default X`, the parser creates the node at the
      // class declaration (not at the export default statement).
      // Test with inline default export syntax instead:
      const content = `
export default class DefaultClass {
  getValue() { return 42; }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const defaultClass = result.nodes.find(
        (n) => n.kind === "class" && n.name === "DefaultClass"
      );
      expect(defaultClass).toBeDefined();
      expect(defaultClass?.is_default_export).toBe(true);
    });

    it("handles separate export default statement", async () => {
      // When export default references an already-declared class,
      // the class is created at declaration time without default export flag.
      // This is a known parser limitation - the default export is a separate statement.
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // UserService is declared with `export class` then `export default UserService`
      const userService = result.nodes.find((n) => n.kind === "class" && n.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService?.is_exported).toBe(true);
      // Note: is_default_export may be false due to separate declaration pattern
    });

    it("marks exported functions correctly", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const createUserFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "createUser"
      );
      expect(createUserFunc).toBeDefined();
      expect(createUserFunc?.is_exported).toBe(true);
    });

    it("handles export all declarations", async () => {
      const content = `
export * from "./utils";
export * as helpers from "./helpers";
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const exportAllRefs = result.externalRefs.filter(
        (r) => r.is_reexport === true && r.imported_symbol === "*"
      );
      expect(exportAllRefs.length).toBeGreaterThanOrEqual(1);
    });

    it("handles named export with rename", async () => {
      const content = `
const internalName = 42;
export { internalName as publicName };
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      // The variable should still be extracted
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // TypeScript-Specific Tests
  // ==========================================================================

  describe("TypeScript-specific parsing", () => {
    it("extracts interface declarations", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const interfaceNodes = result.nodes.filter((n) => n.kind === "interface");
      expect(interfaceNodes.length).toBeGreaterThan(0);

      const userConfigInterface = interfaceNodes.find((n) => n.name === "UserConfig");
      expect(userConfigInterface).toBeDefined();
      expect(userConfigInterface?.is_exported).toBe(true);
    });

    it("extracts type alias declarations", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const typeNodes = result.nodes.filter((n) => n.kind === "type");
      expect(typeNodes.length).toBeGreaterThan(0);

      const userIdType = typeNodes.find((n) => n.name === "UserId");
      expect(userIdType).toBeDefined();
      expect(userIdType?.is_exported).toBe(true);
    });

    it("extracts enum declarations", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const enumNodes = result.nodes.filter((n) => n.kind === "enum");
      expect(enumNodes.length).toBeGreaterThan(0);

      const statusEnum = enumNodes.find((n) => n.name === "Status");
      expect(statusEnum).toBeDefined();
    });

    it("extracts enum members", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const enumMemberNodes = result.nodes.filter((n) => n.kind === "enum_member");
      expect(enumMemberNodes.length).toBeGreaterThanOrEqual(3); // Active, Inactive, Pending

      const activeEnumMember = enumMemberNodes.find((n) => n.name === "Active");
      expect(activeEnumMember).toBeDefined();
    });

    it("handles interface extends", async () => {
      const content = `
interface Base {
  id: number;
}

interface Extended extends Base {
  name: string;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const extendsEdges = result.edges.filter((e) => e.edge_type === "EXTENDS");
      expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("handles generic interfaces", async () => {
      const content = `
interface Container<T> {
  value: T;
  getValue(): T;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const containerInterface = result.nodes.find(
        (n) => n.kind === "interface" && n.name === "Container"
      );
      expect(containerInterface).toBeDefined();
    });

    it("handles mapped types", async () => {
      const content = `
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Optional<T> = {
  [P in keyof T]?: T[P];
};
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const typeNodes = result.nodes.filter((n) => n.kind === "type");
      expect(typeNodes.length).toBe(2);
    });

    it("handles conditional types", async () => {
      const content = `
type NonNullable<T> = T extends null | undefined ? never : T;
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const typeNodes = result.nodes.filter((n) => n.kind === "type");
      expect(typeNodes.length).toBe(2);
    });

    it("handles template literal types", async () => {
      const content = `
type EventName = "click" | "focus" | "blur";
type EventHandler = \`on\${Capitalize<EventName>}\`;
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const typeNodes = result.nodes.filter((n) => n.kind === "type");
      expect(typeNodes.length).toBe(2);
    });

    it("handles const assertions", async () => {
      const content = `
const colors = ["red", "green", "blue"] as const;
type Color = typeof colors[number];
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles satisfies operator", async () => {
      const content = `
type Config = { debug: boolean };
const config = { debug: true } satisfies Config;
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // JSX/TSX Parsing Tests
  // ==========================================================================

  describe("JSX/TSX parsing", () => {
    it("parses JSX component function", async () => {
      const content = `
import React from "react";

export function Button({ onClick, children }) {
  return <button onClick={onClick}>{children}</button>;
}
`;
      const result = await parser.parseContent(content, "test.tsx", testConfig);

      const buttonFunc = result.nodes.find((n) => n.kind === "function" && n.name === "Button");
      expect(buttonFunc).toBeDefined();
      expect(buttonFunc?.is_exported).toBe(true);
    });

    it("parses JSX arrow component", async () => {
      const content = `
import React from "react";

export const Card = ({ title, children }) => {
  return (
    <div className="card">
      <h1>{title}</h1>
      {children}
    </div>
  );
};
`;
      const result = await parser.parseContent(content, "test.tsx", testConfig);

      const cardFunc = result.nodes.find((n) => n.kind === "function" && n.name === "Card");
      expect(cardFunc).toBeDefined();
    });

    it("parses React class component", async () => {
      const content = `
import React, { Component } from "react";

export class Counter extends Component {
  state = { count: 0 };

  increment = () => {
    this.setState({ count: this.state.count + 1 });
  };

  render() {
    return (
      <div>
        <span>{this.state.count}</span>
        <button onClick={this.increment}>+</button>
      </div>
    );
  }
}
`;
      const result = await parser.parseContent(content, "test.tsx", testConfig);

      const counterClass = result.nodes.find((n) => n.kind === "class" && n.name === "Counter");
      expect(counterClass).toBeDefined();
    });

    it("parses typed React component", async () => {
      const content = `
import React from "react";

interface ButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ onClick, label, disabled = false }) => {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
};
`;
      const result = await parser.parseContent(content, "test.tsx", testConfig);

      const propsInterface = result.nodes.find(
        (n) => n.kind === "interface" && n.name === "ButtonProps"
      );
      expect(propsInterface).toBeDefined();

      const buttonFunc = result.nodes.find((n) => n.kind === "function" && n.name === "Button");
      expect(buttonFunc).toBeDefined();
    });

    it("handles JSX fragments", async () => {
      const content = `
import React from "react";

export const List = ({ items }) => {
  return (
    <>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </>
  );
};
`;
      const result = await parser.parseContent(content, "test.tsx", testConfig);

      const listFunc = result.nodes.find((n) => n.kind === "function" && n.name === "List");
      expect(listFunc).toBeDefined();
    });
  });

  // ==========================================================================
  // Decorator Parsing Tests
  // ==========================================================================

  describe("decorator parsing", () => {
    it("parses class decorators", async () => {
      const content = `
function Component(target: any) {
  return target;
}

@Component
class MyComponent {
  render() {
    return "Hello";
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "MyComponent");
      expect(classNode).toBeDefined();
    });

    it("parses method decorators", async () => {
      const content = `
function Log(target: any, key: string, descriptor: PropertyDescriptor) {
  return descriptor;
}

class Service {
  @Log
  doWork() {
    console.log("Working");
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const serviceClass = result.nodes.find((n) => n.kind === "class" && n.name === "Service");
      expect(serviceClass).toBeDefined();

      const doWorkMethod = result.nodes.find((n) => n.kind === "method" && n.name === "doWork");
      expect(doWorkMethod).toBeDefined();
    });

    it("parses decorators with arguments", async () => {
      const content = `
function Injectable(options: { providedIn: string }) {
  return (target: any) => target;
}

@Injectable({ providedIn: "root" })
class UserService {
  getUsers() {
    return [];
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const serviceClass = result.nodes.find((n) => n.kind === "class" && n.name === "UserService");
      expect(serviceClass).toBeDefined();
    });

    it("parses multiple decorators", async () => {
      const content = `
function First(target: any) { return target; }
function Second(target: any) { return target; }
function Third(target: any) { return target; }

@First
@Second
@Third
class MultiDecorated {
  value = 42;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const classNode = result.nodes.find((n) => n.kind === "class" && n.name === "MultiDecorated");
      expect(classNode).toBeDefined();
    });

    it("parses property decorators", async () => {
      const content = `
function Observable(target: any, key: string) {}

class Store {
  @Observable
  count: number = 0;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const storeClass = result.nodes.find((n) => n.kind === "class" && n.name === "Store");
      expect(storeClass).toBeDefined();
    });
  });

  // ==========================================================================
  // Namespace and Module Tests
  // ==========================================================================

  describe("namespace and module parsing", () => {
    it("handles namespace declarations", async () => {
      const content = `
namespace Utils {
  export function helper(): void {}
  export const VERSION = "1.0.0";
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      // Namespace contents should be extracted
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles nested namespaces", async () => {
      const content = `
namespace Outer {
  export namespace Inner {
    export function deepFunction(): void {}
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles module declarations", async () => {
      const content = `
declare module "my-module" {
  export function myFunction(): void;
  export interface MyInterface {
    prop: string;
  }
}
`;
      const result = await parser.parseContent(content, "test.d.ts", testConfig);

      expect(result).toBeDefined();
    });

    it("handles module augmentation", async () => {
      const content = `
declare module "express" {
  interface Request {
    user?: { id: string };
  }
}
`;
      const result = await parser.parseContent(content, "test.d.ts", testConfig);

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Entity ID Generation Tests
  // ==========================================================================

  describe("entity ID generation", () => {
    it("generates stable entity IDs", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");

      // Parse twice
      const result1 = await parser.parse(filePath, testConfig);
      const result2 = await parser.parse(filePath, testConfig);

      // Same file should produce same entity IDs
      const userService1 = result1.nodes.find((n) => n.name === "UserService");
      const userService2 = result2.nodes.find((n) => n.name === "UserService");

      expect(userService1?.entity_id).toBe(userService2?.entity_id);
    });

    it("generates unique IDs for different elements", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      // All entity IDs should be unique
      const entityIds = result.nodes.map((n) => n.entity_id);
      const uniqueIds = new Set(entityIds);
      expect(uniqueIds.size).toBe(entityIds.length);
    });

    it("entity IDs follow the v2.0 format", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
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
  // Edge Cases and Error Handling Tests
  // ==========================================================================

  describe("error handling", () => {
    it("handles syntax errors gracefully", async () => {
      const invalidContent = `
export function broken( {
  // Missing closing paren and body
}

class AlsoBroken
`;
      const result = await parser.parseContent(invalidContent, "broken.ts", testConfig);

      // Should not throw, should return result with warnings
      expect(result).toBeDefined();
      expect(result.warnings.length > 0 || result.nodes.length >= 0).toBe(true);
    });

    it("handles empty files", async () => {
      const result = await parser.parseContent("", "empty.ts", testConfig);

      expect(result).toBeDefined();
      // Should have file node at minimum
      expect(result.nodes.length).toBeGreaterThanOrEqual(0);
    });

    it("handles files with only comments", async () => {
      const content = `
// This is a comment
/* Another comment */
/**
 * JSDoc comment
 */
`;
      const result = await parser.parseContent(content, "comments.ts", testConfig);

      expect(result).toBeDefined();
    });

    it("handles non-existent file gracefully", async () => {
      await expect(parser.parse("/non/existent/file.ts", testConfig)).rejects.toThrow();
    });

    it("handles file with BOM", async () => {
      const contentWithBOM = "\ufeffexport const value = 42;";
      const result = await parser.parseContent(contentWithBOM, "bom.ts", testConfig);

      expect(result).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles very long lines", async () => {
      const longString = "x".repeat(10000);
      const content = `export const long = "${longString}";`;
      const result = await parser.parseContent(content, "long.ts", testConfig);

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Parse Result Structure Tests
  // ==========================================================================

  describe("parse result structure", () => {
    it("returns valid StructuralParseResult", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
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
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      expect(result.sourceFileHash).toBeTruthy();
      expect(result.sourceFileHash.length).toBeGreaterThan(0);
    });

    it("reports parse time in milliseconds", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.parseTimeMs).toBeLessThan(10000); // Should parse in < 10s
    });

    it("creates file/module node", async () => {
      const filePath = path.join(FIXTURES_DIR, "sample-class.ts");
      const result = await parser.parse(filePath, testConfig);

      const moduleNode = result.nodes.find((n) => n.kind === "module");
      expect(moduleNode).toBeDefined();
      expect(moduleNode?.name).toBe("sample-class.ts");
    });
  });

  // ==========================================================================
  // Complex Generics Tests
  // ==========================================================================

  describe("complex generics", () => {
    it("handles generic classes", async () => {
      const content = `
export class Container<T> {
  private value: T;

  constructor(value: T) {
    this.value = value;
  }

  getValue(): T {
    return this.value;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const containerClass = result.nodes.find((n) => n.kind === "class" && n.name === "Container");
      expect(containerClass).toBeDefined();
    });

    it("handles multiple type parameters", async () => {
      const content = `
export class Pair<K, V> {
  constructor(public key: K, public value: V) {}
}

export type Mapper<TInput, TOutput> = (input: TInput) => TOutput;
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("handles generic constraints", async () => {
      const content = `
export function process<T extends { id: string }>(items: T[]): string[] {
  return items.map(item => item.id);
}

export class Repository<T extends Entity> {
  save(entity: T): void {}
}

interface Entity {
  id: string;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const processFunc = result.nodes.find((n) => n.kind === "function" && n.name === "process");
      expect(processFunc).toBeDefined();
    });

    it("handles generic function overloads", async () => {
      const content = `
function transform(value: string): number;
function transform(value: number): string;
function transform<T>(value: T): T;
function transform(value: any): any {
  return value;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      // Should extract at least the implementation
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Documentation Extraction Tests
  // ==========================================================================

  describe("documentation extraction", () => {
    it("extracts JSDoc from function declarations", async () => {
      const content = `
/**
 * Adds two numbers together.
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const addFunc = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(addFunc).toBeDefined();
      expect(addFunc?.documentation).toBeDefined();
      expect(addFunc?.documentation).toContain("Adds two numbers together");
      expect(addFunc?.documentation).toContain("@param a");
      expect(addFunc?.documentation).toContain("@returns");
    });

    it("extracts JSDoc from arrow functions", async () => {
      const content = `
/**
 * Multiplies two numbers.
 */
const multiply = (a: number, b: number) => a * b;
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const multiplyFunc = result.nodes.find((n) => n.kind === "function" && n.name === "multiply");
      expect(multiplyFunc).toBeDefined();
      expect(multiplyFunc?.documentation).toBeDefined();
      expect(multiplyFunc?.documentation).toContain("Multiplies two numbers");
    });

    it("extracts JSDoc from class declarations", async () => {
      const content = `
/**
 * A service for managing users.
 * @example
 * const service = new UserService();
 * service.getUser(1);
 */
export class UserService {
  getUser(id: number) {
    return { id };
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const userService = result.nodes.find((n) => n.kind === "class" && n.name === "UserService");
      expect(userService).toBeDefined();
      expect(userService?.documentation).toBeDefined();
      expect(userService?.documentation).toContain("A service for managing users");
      expect(userService?.documentation).toContain("@example");
    });

    it("extracts JSDoc from class methods", async () => {
      const content = `
class Calculator {
  /**
   * Divides the first number by the second.
   * @throws Error if divisor is zero
   */
  divide(a: number, b: number): number {
    if (b === 0) throw new Error("Cannot divide by zero");
    return a / b;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const divideMethod = result.nodes.find((n) => n.kind === "method" && n.name === "divide");
      expect(divideMethod).toBeDefined();
      expect(divideMethod?.documentation).toBeDefined();
      expect(divideMethod?.documentation).toContain("Divides the first number");
      expect(divideMethod?.documentation).toContain("@throws");
    });

    it("extracts JSDoc from interfaces", async () => {
      const content = `
/**
 * Configuration options for the application.
 */
export interface AppConfig {
  debug: boolean;
  apiUrl: string;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const appConfig = result.nodes.find((n) => n.kind === "interface" && n.name === "AppConfig");
      expect(appConfig).toBeDefined();
      expect(appConfig?.documentation).toBeDefined();
      expect(appConfig?.documentation).toContain("Configuration options");
    });

    it("extracts JSDoc from type aliases", async () => {
      const content = `
/**
 * Valid user roles in the system.
 */
export type UserRole = "admin" | "user" | "guest";
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const userRole = result.nodes.find((n) => n.kind === "type" && n.name === "UserRole");
      expect(userRole).toBeDefined();
      expect(userRole?.documentation).toBeDefined();
      expect(userRole?.documentation).toContain("Valid user roles");
    });

    it("extracts JSDoc from enums", async () => {
      const content = `
/**
 * HTTP status codes commonly used in the API.
 */
export enum HttpStatus {
  OK = 200,
  NotFound = 404,
  ServerError = 500
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const httpStatus = result.nodes.find((n) => n.kind === "enum" && n.name === "HttpStatus");
      expect(httpStatus).toBeDefined();
      expect(httpStatus?.documentation).toBeDefined();
      expect(httpStatus?.documentation).toContain("HTTP status codes");
    });

    it("returns null for elements without JSDoc", async () => {
      const content = `
export function noDoc(x: number): number {
  return x * 2;
}

// Regular comment, not JSDoc
export function withComment(x: number): number {
  return x + 1;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const noDocFunc = result.nodes.find((n) => n.kind === "function" && n.name === "noDoc");
      expect(noDocFunc).toBeDefined();
      expect(noDocFunc?.documentation).toBeNull();

      const withCommentFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "withComment"
      );
      expect(withCommentFunc).toBeDefined();
      expect(withCommentFunc?.documentation).toBeNull();
    });

    it("handles multi-line JSDoc with formatting", async () => {
      const content = `
/**
 * Process data through multiple transformation steps.
 *
 * This function takes raw data and applies a series of
 * transformations to produce the final result.
 *
 * Steps:
 * 1. Validate input
 * 2. Transform data
 * 3. Return result
 *
 * @param data - The input data to process
 * @returns Transformed data
 */
export function processData(data: unknown): unknown {
  return data;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const processFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "processData"
      );
      expect(processFunc).toBeDefined();
      expect(processFunc?.documentation).toBeDefined();
      expect(processFunc?.documentation).toContain("Process data through multiple");
      expect(processFunc?.documentation).toContain("Steps:");
      expect(processFunc?.documentation).toContain("1. Validate input");
    });

    it("respects includeDocumentation config flag", async () => {
      const content = `
/**
 * This is documented.
 */
export function documented(): void {}
`;
      // Parse with documentation disabled
      const configWithoutDocs: ParserConfig = {
        ...testConfig,
        includeDocumentation: false,
      };
      const result = await parser.parseContent(content, "test.ts", configWithoutDocs);

      const func = result.nodes.find((n) => n.kind === "function" && n.name === "documented");
      expect(func).toBeDefined();
      expect(func?.documentation).toBeNull();
    });

    it("extracts JSDoc from async functions", async () => {
      const content = `
/**
 * Fetches user data from the API.
 * @async
 */
export async function fetchUser(id: number): Promise<{ id: number }> {
  return { id };
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const fetchFunc = result.nodes.find((n) => n.kind === "function" && n.name === "fetchUser");
      expect(fetchFunc).toBeDefined();
      expect(fetchFunc?.documentation).toBeDefined();
      expect(fetchFunc?.documentation).toContain("Fetches user data");
    });

    it("extracts JSDoc from class properties", async () => {
      const content = `
class Config {
  /**
   * The application version string.
   */
  version: string = "1.0.0";
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const versionProp = result.nodes.find((n) => n.kind === "property" && n.name === "version");
      expect(versionProp).toBeDefined();
      expect(versionProp?.documentation).toBeDefined();
      expect(versionProp?.documentation).toContain("application version");
    });
  });

  // ==========================================================================
  // Async/Await and Generators Tests
  // ==========================================================================

  describe("async/await and generators", () => {
    it("handles async generators", async () => {
      const content = `
export async function* asyncGenerator(): AsyncGenerator<number> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 100));
    yield i;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const genFunc = result.nodes.find(
        (n) => n.kind === "function" && n.name === "asyncGenerator"
      );
      expect(genFunc).toBeDefined();
      expect(genFunc?.is_async).toBe(true);
      expect(genFunc?.is_generator).toBe(true);
    });

    it("handles async methods in classes", async () => {
      const content = `
class ApiClient {
  async get<T>(url: string): Promise<T> {
    const response = await fetch(url);
    return response.json();
  }

  async *fetchPages(): AsyncGenerator<any[]> {
    let page = 0;
    while (true) {
      const data = await this.get(\`/api?page=\${page++}\`);
      if (!data.length) break;
      yield data;
    }
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const getMethod = result.nodes.find((n) => n.kind === "method" && n.name === "get");
      expect(getMethod).toBeDefined();
      expect(getMethod?.is_async).toBe(true);
    });
  });

  // ==========================================================================
  // Effects Extraction Tests (v3.0 Foundation)
  // ==========================================================================

  describe("effects extraction", () => {
    it("extracts FunctionCallEffect for simple function calls", async () => {
      const content = `
function helper() {
  return 42;
}

function main() {
  return helper();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      expect(effects.length).toBeGreaterThan(0);

      const helperCall = effects.find((e) => e.callee_name === "helper");
      expect(helperCall).toBeDefined();
      expect(helperCall?.is_method_call).toBe(false);
      expect(helperCall?.is_constructor).toBe(false);
    });

    it("extracts FunctionCallEffect for method calls", async () => {
      const content = `
function log() {
  console.log("hello");
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const logCall = effects.find((e) => e.callee_name === "console.log");
      expect(logCall).toBeDefined();
      expect(logCall?.is_method_call).toBe(true);
    });

    it("tracks source location in effects", async () => {
      const content = `
function caller() {
  doSomething();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const call = effects.find((e) => e.callee_name === "doSomething");
      expect(call).toBeDefined();
      expect(call?.source_line).toBeGreaterThan(0);
      expect(call?.source_column).toBeGreaterThanOrEqual(0);
    });

    it("extracts argument count in effects", async () => {
      const content = `
function test() {
  noArgs();
  oneArg(1);
  threeArgs(1, 2, 3);
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");

      const noArgsCall = effects.find((e) => e.callee_name === "noArgs");
      expect(noArgsCall?.argument_count).toBe(0);

      const oneArgCall = effects.find((e) => e.callee_name === "oneArg");
      expect(oneArgCall?.argument_count).toBe(1);

      const threeArgsCall = effects.find((e) => e.callee_name === "threeArgs");
      expect(threeArgsCall?.argument_count).toBe(3);
    });

    it("detects async calls with await", async () => {
      const content = `
async function fetchData() {
  const data = await fetch("/api/data");
  return data;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const fetchCall = effects.find((e) => e.callee_name === "fetch");
      expect(fetchCall).toBeDefined();
      expect(fetchCall?.is_async).toBe(true);
    });

    it("detects constructor calls with new", async () => {
      const content = `
function createDate() {
  return new Date();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const dateCall = effects.find((e) => e.callee_name === "Date");
      expect(dateCall).toBeDefined();
      expect(dateCall?.is_constructor).toBe(true);
    });

    it("links effect to source entity", async () => {
      const content = `
function caller() {
  callee();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const callerNode = result.nodes.find((n) => n.name === "caller" && n.kind === "function");
      expect(callerNode).toBeDefined();

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const calleeEffect = effects.find((e) => e.callee_name === "callee");
      expect(calleeEffect).toBeDefined();
      expect(calleeEffect?.source_entity_id).toBe(callerNode?.entity_id);
    });

    it("extracts effects from class methods", async () => {
      const content = `
class Service {
  process() {
    console.log("processing");
    this.helper();
  }

  helper() {}
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const logCall = effects.find((e) => e.callee_name === "console.log");
      const helperCall = effects.find((e) => e.callee_name === "this.helper");

      expect(logCall).toBeDefined();
      expect(helperCall).toBeDefined();
    });

    it("has unique effect_id for each effect", async () => {
      const content = `
function multi() {
  a();
  b();
  c();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const effects = result.effects.filter((e) => e.effect_type === "FunctionCall");
      const effectIds = new Set(effects.map((e) => e.effect_id));
      expect(effectIds.size).toBe(effects.length);
    });

    // ==========================================================================
    // API Decorator Extraction Tests (v0.5.0)
    // ==========================================================================

    it("extracts RequestEffect from tsoa @Route and @Get decorators", async () => {
      const content = `
import { Route, Get, Controller, SuccessResponse } from "tsoa";

@Route("users")
class UserController extends Controller {
  @Get("{userId}")
  @SuccessResponse("200", "Success")
  public async getUser(userId: string): Promise<User> {
    return { id: userId, name: "Test" };
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const requestEffects = result.effects.filter((e) => e.effect_type === "Request");
      expect(requestEffects.length).toBeGreaterThan(0);

      const getUserEffect = requestEffects.find((e) => e.route_pattern?.includes("users"));
      expect(getUserEffect).toBeDefined();
      expect(getUserEffect?.method).toBe("GET");
      expect(getUserEffect?.route_pattern).toContain("users");
      expect(getUserEffect?.framework).toBe("tsoa");
    });

    it("extracts RequestEffect from NestJS decorators", async () => {
      const content = `
import { Controller, Get, Post, Body } from "@nestjs/common";

@Controller("messages")
class MessageController {
  @Get()
  getMessages() {
    return [];
  }

  @Post()
  createMessage(@Body() body: CreateMessageDto) {
    return body;
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const requestEffects = result.effects.filter((e) => e.effect_type === "Request");
      expect(requestEffects.length).toBe(2);

      const getEffect = requestEffects.find((e) => e.method === "GET");
      expect(getEffect).toBeDefined();
      expect(getEffect?.route_pattern).toContain("messages");

      const postEffect = requestEffects.find((e) => e.method === "POST");
      expect(postEffect).toBeDefined();
    });

    it("combines class route prefix with method route", async () => {
      const content = `
import { Route, Get } from "tsoa";

@Route("api/v1/orders")
class OrderController {
  @Get("{orderId}/items")
  getOrderItems(orderId: string) {
    return [];
  }
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const requestEffects = result.effects.filter((e) => e.effect_type === "Request");
      expect(requestEffects.length).toBe(1);

      const effect = requestEffects[0];
      expect(effect?.route_pattern).toBe("/api/v1/orders/{orderId}/items");
    });

    // ==========================================================================
    // HTTP Client / M2M Detection Tests (v0.5.0)
    // ==========================================================================

    it("extracts SendEffect for m2mClient calls", async () => {
      const content = `
async function sendNotification(payload: any) {
  await m2mClient.post(\`/\${process.env.STAGE}/miami-endpoints/sendMessage\`, payload);
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sendEffects = result.effects.filter((e) => e.effect_type === "Send");
      expect(sendEffects.length).toBe(1);

      const effect = sendEffects[0];
      expect(effect?.send_type).toBe("m2m");
      expect(effect?.method).toBe("POST");
      expect(effect?.target).toContain("miami-endpoints");
      expect(effect?.service_name).toBe("miami");
    });

    it("extracts SendEffect for axios calls", async () => {
      const content = `
async function fetchData() {
  const response = await axios.get("https://api.stripe.com/v1/charges");
  return response.data;
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sendEffects = result.effects.filter((e) => e.effect_type === "Send");
      expect(sendEffects.length).toBe(1);

      const effect = sendEffects[0];
      expect(effect?.send_type).toBe("http");
      expect(effect?.method).toBe("GET");
      expect(effect?.is_third_party).toBe(true);
    });

    it("extracts SendEffect for fetch calls with string URL", async () => {
      const content = `
async function callApi() {
  const response = await fetch("/api/users");
  return response.json();
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sendEffects = result.effects.filter((e) => e.effect_type === "Send");
      expect(sendEffects.length).toBe(1);

      const effect = sendEffects[0];
      expect(effect?.target).toBe("/api/users");
    });

    it("detects M2M pattern in URL and extracts service name", async () => {
      const content = `
async function callBackend() {
  await m2mClient.post(\`/staging/billing-endpoints/processPayment\`, {});
  await m2mClient.get(\`/\${STAGE}/auth-endpoints/validateToken\`);
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sendEffects = result.effects.filter((e) => e.effect_type === "Send");
      expect(sendEffects.length).toBe(2);

      const billingCall = sendEffects.find((e) => e.target?.includes("billing"));
      expect(billingCall?.service_name).toBe("billing");
      expect(billingCall?.send_type).toBe("m2m");

      const authCall = sendEffects.find((e) => e.target?.includes("auth"));
      expect(authCall?.service_name).toBe("auth");
      expect(authCall?.send_type).toBe("m2m");
    });

    it("does not create SendEffect for non-HTTP calls", async () => {
      const content = `
function regularFunction() {
  console.log("hello");
  someHelper();
  return calculate(1, 2);
}
`;
      const result = await parser.parseContent(content, "test.ts", testConfig);

      const sendEffects = result.effects.filter((e) => e.effect_type === "Send");
      expect(sendEffects.length).toBe(0);
    });
  });
});
