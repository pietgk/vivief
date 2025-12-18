/**
 * Integration tests for DevAC v2.0
 *
 * Tests the full pipeline: parse → write → read
 * Validates that the system works end-to-end.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import { PythonParser } from "../src/parsers/python-parser.js";
import { TypeScriptParser } from "../src/parsers/typescript-parser.js";
import { DuckDBPool } from "../src/storage/duckdb-pool.js";
import { SeedReader } from "../src/storage/seed-reader.js";
import { SeedWriter } from "../src/storage/seed-writer.js";

// Test fixtures paths - using the separate fixture packages
const TS_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-typescript/src");
const PY_FIXTURES_DIR = path.resolve(__dirname, "../../fixtures-python");

// Helper to parse properties (may be string or object after Parquet round-trip)
function parseProperties(props: unknown): Record<string, unknown> {
  if (typeof props === "string") {
    try {
      return JSON.parse(props);
    } catch {
      return {};
    }
  }
  return (props as Record<string, unknown>) ?? {};
}

describe("Integration: Parse → Write → Read Cycle", () => {
  let pool: DuckDBPool;
  let tempDir: string;

  beforeEach(async () => {
    // Create a fresh DuckDB pool for each test
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Create a temp directory for seed files
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-test-"));
  });

  afterEach(async () => {
    // Cleanup
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("parses a TypeScript file and extracts nodes", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have parsed successfully
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.filePath).toBe(filePath);
    expect(result.sourceFileHash).toBeTruthy();

    // Should have found key entities
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("UserService");
    expect(nodeNames).toContain("BaseService");
    expect(nodeNames).toContain("createUser");
    expect(nodeNames).toContain("validateUser");
  });

  it("parses and extracts class methods correctly", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Find UserService class methods
    const methodNodes = result.nodes.filter(
      (n) => n.kind === "method" && n.qualified_name?.startsWith("UserService.")
    );

    const methodNames = methodNodes.map((n) => n.name);
    expect(methodNames).toContain("process");
    expect(methodNames).toContain("getUser");
  });

  it("extracts imports as external references", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have external references
    expect(result.externalRefs.length).toBeGreaterThan(0);

    // Should have found EventEmitter import
    const eventEmitterRef = result.externalRefs.find((r) => r.imported_symbol === "EventEmitter");
    expect(eventEmitterRef).toBeTruthy();
    expect(eventEmitterRef?.module_specifier).toBe("node:events");
  });

  it("extracts type-only imports correctly", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have type-only import for Readable
    const readableRef = result.externalRefs.find((r) => r.imported_symbol === "Readable");
    expect(readableRef).toBeTruthy();
    expect(readableRef?.is_type_only).toBe(true);
  });

  it("extracts edges (CONTAINS relationships)", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have CONTAINS edges
    const containsEdges = result.edges.filter((e) => e.edge_type === "CONTAINS");
    expect(containsEdges.length).toBeGreaterThan(0);

    // File should contain classes
    const fileNode = result.nodes.find((n) => n.kind === "module");
    expect(fileNode).toBeTruthy();

    const fileContainsClass = containsEdges.some((e) => e.source_entity_id === fileNode?.entity_id);
    expect(fileContainsClass).toBe(true);
  });

  it("generates unique entity IDs for all nodes", async () => {
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // All entity IDs should be unique
    const entityIds = result.nodes.map((n) => n.entity_id);
    const uniqueIds = new Set(entityIds);
    expect(uniqueIds.size).toBe(entityIds.length);
  });

  it("writes and reads seeds correctly", async () => {
    // Parse the file
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: tempDir,
      branch: "main",
    };

    const parseResult = await parser.parse(filePath, config);

    // Write to seeds
    const writer = new SeedWriter(pool, tempDir);
    const writeResult = await writer.writeFile(parseResult);

    expect(writeResult.success).toBe(true);
    expect(writeResult.nodesWritten).toBeGreaterThan(0);

    // Read back from seeds
    const reader = new SeedReader(pool, tempDir);
    const nodesResult = await reader.readNodes();

    // Should have same number of nodes (result has .rows property)
    expect(nodesResult.rows.length).toBe(parseResult.nodes.length);

    // Check a specific node exists
    const userServiceNode = nodesResult.rows.find((n) => n.name === "UserService");
    expect(userServiceNode).toBeTruthy();
    expect(userServiceNode?.kind).toBe("class");
  });

  it("handles multiple file parsing", async () => {
    const parser = new TypeScriptParser();

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    // Parse both fixture files
    const result1 = await parser.parse(path.join(TS_FIXTURES_DIR, "sample-class.ts"), config);
    const result2 = await parser.parse(path.join(TS_FIXTURES_DIR, "sample-functions.ts"), config);

    // Both should have nodes
    expect(result1.nodes.length).toBeGreaterThan(0);
    expect(result2.nodes.length).toBeGreaterThan(0);

    // Entity IDs should be unique across files
    const allIds = [
      ...result1.nodes.map((n) => n.entity_id),
      ...result2.nodes.map((n) => n.entity_id),
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("handles parse errors gracefully", async () => {
    const parser = new TypeScriptParser();

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    // Create a file with syntax errors
    const badFile = path.join(tempDir, "bad.ts");
    await fs.writeFile(badFile, "export function { broken syntax");

    const result = await parser.parse(badFile, config);

    // Should not throw, but may have warnings or empty results
    expect(result).toBeTruthy();
    // Parser uses error recovery, so it might still parse something
  });
});

describe("Integration: Query Capabilities", () => {
  let pool: DuckDBPool;
  let tempDir: string;
  let reader: SeedReader;

  beforeEach(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-query-test-"));

    // Parse and write fixture file
    const parser = new TypeScriptParser();
    const filePath = path.join(TS_FIXTURES_DIR, "sample-class.ts");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: tempDir,
      branch: "main",
    };

    const parseResult = await parser.parse(filePath, config);
    const writer = new SeedWriter(pool, tempDir);
    await writer.writeFile(parseResult);

    reader = new SeedReader(pool, tempDir);
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads nodes and can filter by kind in memory", async () => {
    const nodesResult = await reader.readNodes();
    const classes = nodesResult.rows.filter((n) => n.kind === "class");
    const functions = nodesResult.rows.filter((n) => n.kind === "function");

    expect(classes.length).toBeGreaterThan(0);
    expect(functions.length).toBeGreaterThan(0);

    // All results should match the filter
    expect(classes.every((n) => n.kind === "class")).toBe(true);
    expect(functions.every((n) => n.kind === "function")).toBe(true);
  });

  it("reads edges and can filter by type in memory", async () => {
    const edgesResult = await reader.readEdges();
    const containsEdges = edgesResult.rows.filter((e) => e.edge_type === "CONTAINS");

    expect(containsEdges.length).toBeGreaterThan(0);
    expect(containsEdges.every((e) => e.edge_type === "CONTAINS")).toBe(true);
  });

  it("reads external references", async () => {
    const refsResult = await reader.readExternalRefs();

    expect(refsResult.rows.length).toBeGreaterThan(0);

    // Should include our imports
    const moduleSpecifiers = refsResult.rows.map((r) => r.module_specifier);
    expect(moduleSpecifiers).toContain("node:events");
    expect(moduleSpecifiers).toContain("node:stream");
  });

  it("executes custom SQL queries", async () => {
    const parquetPath = path.join(tempDir, ".devac", "seed", "base", "nodes.parquet");
    const result = await reader.querySeeds<{ count: number }>(
      `SELECT COUNT(*) as count FROM read_parquet('${parquetPath}')`
    );

    expect(result.rows.length).toBe(1);
    expect(Number(result.rows[0]?.count)).toBeGreaterThan(0);
  });
});

describe("Integration: Python Parser", () => {
  let pool: DuckDBPool;
  let tempDir: string;

  beforeEach(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-python-test-"));
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("parses a Python file and extracts nodes", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_class.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have parsed successfully
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.filePath).toBe(filePath);
    expect(result.sourceFileHash).toBeTruthy();

    // Should have found key entities
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames).toContain("UserService");
    expect(nodeNames).toContain("BaseService");
  });

  it("parses Python classes with inheritance", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_class.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Find class nodes
    const classNodes = result.nodes.filter((n) => n.kind === "class");
    expect(classNodes.length).toBeGreaterThan(0);

    // Find EXTENDS edges for inheritance
    const extendsEdges = result.edges.filter((e) => e.edge_type === "EXTENDS");
    expect(extendsEdges.length).toBeGreaterThan(0);
  });

  it("parses Python functions with type hints", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_functions.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Find function nodes
    const functionNodes = result.nodes.filter((n) => n.kind === "function");
    expect(functionNodes.length).toBeGreaterThan(0);

    // Find the 'add' function with return type (stored in type_signature)
    const addFunc = functionNodes.find((n) => n.name === "add");
    expect(addFunc).toBeTruthy();
    expect(addFunc?.type_signature).toBe("int");
  });

  it("extracts Python imports as external references", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_imports.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Should have external references
    expect(result.externalRefs.length).toBeGreaterThan(0);

    // Check for specific imports
    const moduleSpecs = result.externalRefs.map((r) => r.module_specifier);
    expect(moduleSpecs).toContain("os");
    expect(moduleSpecs).toContain("typing");
  });

  it("writes Python parse results to Parquet and reads back", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_class.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: tempDir,
      branch: "main",
    };

    const parseResult = await parser.parse(filePath, config);

    // Write to seeds
    const writer = new SeedWriter(pool, tempDir);
    const writeResult = await writer.writeFile(parseResult);

    expect(writeResult.success).toBe(true);
    expect(writeResult.nodesWritten).toBeGreaterThan(0);

    // Read back from seeds
    const reader = new SeedReader(pool, tempDir);
    const nodesResult = await reader.readNodes();

    // Should have same number of nodes
    expect(nodesResult.rows.length).toBe(parseResult.nodes.length);

    // Check Python-specific node exists
    const userServiceNode = nodesResult.rows.find((n) => n.name === "UserService");
    expect(userServiceNode).toBeTruthy();
    expect(userServiceNode?.kind).toBe("class");
    // Language is stored in properties JSON field
    const props = parseProperties(userServiceNode?.properties);
    expect(props.language).toBe("python");
  });

  it("handles async Python functions", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_functions.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Find async function
    const asyncFunc = result.nodes.find((n) => n.kind === "function" && n.name === "fetch_data");
    expect(asyncFunc).toBeTruthy();
    expect(asyncFunc?.is_async).toBe(true);
  });

  it("handles Python methods with decorators", async () => {
    const parser = new PythonParser();
    const filePath = path.join(PY_FIXTURES_DIR, "sample_class.py");

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const result = await parser.parse(filePath, config);

    // Find methods marked as static or property (decorator info stored in properties)
    const staticMethods = result.nodes.filter((n) => n.kind === "method" && n.is_static === true);
    expect(staticMethods.length).toBeGreaterThan(0);
  });
});

describe("Integration: Mixed TypeScript/Python Package", () => {
  let pool: DuckDBPool;
  let tempDir: string;

  beforeEach(async () => {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mixed-test-"));
  });

  afterEach(async () => {
    await pool.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("parses and stores both TypeScript and Python files", async () => {
    const tsParser = new TypeScriptParser();
    const pyParser = new PythonParser();

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: tempDir,
      branch: "main",
    };

    // Parse TypeScript file
    const tsResult = await tsParser.parse(path.join(TS_FIXTURES_DIR, "sample-class.ts"), config);

    // Parse Python file
    const pyResult = await pyParser.parse(path.join(PY_FIXTURES_DIR, "sample_class.py"), config);

    // Write both to seeds
    const writer = new SeedWriter(pool, tempDir);
    await writer.writeFile(tsResult);
    await writer.writeFile(pyResult);

    // Read back all nodes
    const reader = new SeedReader(pool, tempDir);
    const nodesResult = await reader.readNodes();

    // Should have nodes from both languages (language stored in properties)
    const tsNodes = nodesResult.rows.filter((n) => {
      const props = parseProperties(n.properties);
      return props.language === "typescript";
    });
    const pyNodes = nodesResult.rows.filter((n) => {
      const props = parseProperties(n.properties);
      return props.language === "python";
    });

    expect(tsNodes.length).toBeGreaterThan(0);
    expect(pyNodes.length).toBeGreaterThan(0);

    // Total should be sum of both
    expect(nodesResult.rows.length).toBe(tsResult.nodes.length + pyResult.nodes.length);
  });

  it("maintains unique entity IDs across languages", async () => {
    const tsParser = new TypeScriptParser();
    const pyParser = new PythonParser();

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: "test-package",
      branch: "main",
    };

    const tsResult = await tsParser.parse(path.join(TS_FIXTURES_DIR, "sample-class.ts"), config);

    const pyResult = await pyParser.parse(path.join(PY_FIXTURES_DIR, "sample_class.py"), config);

    // All entity IDs should be unique across both results
    const allIds = [
      ...tsResult.nodes.map((n) => n.entity_id),
      ...pyResult.nodes.map((n) => n.entity_id),
    ];

    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("can query nodes by language", async () => {
    const tsParser = new TypeScriptParser();
    const pyParser = new PythonParser();

    const config = {
      ...DEFAULT_PARSER_CONFIG,
      repoName: "test-repo",
      packagePath: tempDir,
      branch: "main",
    };

    // Parse and write both files
    const tsResult = await tsParser.parse(path.join(TS_FIXTURES_DIR, "sample-class.ts"), config);
    const pyResult = await pyParser.parse(path.join(PY_FIXTURES_DIR, "sample_class.py"), config);

    const writer = new SeedWriter(pool, tempDir);
    await writer.writeFile(tsResult);
    await writer.writeFile(pyResult);

    // Query nodes and filter by language
    const reader = new SeedReader(pool, tempDir);
    const nodesResult = await reader.readNodes();

    // Filter Python classes (language stored in properties)
    const pythonClasses = nodesResult.rows.filter((n) => {
      const props = parseProperties(n.properties);
      return props.language === "python" && n.kind === "class";
    });
    expect(pythonClasses.length).toBeGreaterThan(0);

    // Filter TypeScript classes
    const tsClasses = nodesResult.rows.filter((n) => {
      const props = parseProperties(n.properties);
      return props.language === "typescript" && n.kind === "class";
    });
    expect(tsClasses.length).toBeGreaterThan(0);
  });
});
