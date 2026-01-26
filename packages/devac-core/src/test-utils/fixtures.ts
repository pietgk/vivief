/**
 * Test Fixtures - Pre-defined Test Graphs
 *
 * These fixtures provide common test scenarios that can be used across
 * all test suites. They use Zod-derived types for type safety.
 */

import type { TestFixture } from "./seed-factory.js";

/**
 * Simple call chain: utils.ts -> service.ts -> index.ts
 *
 * helper() <- processData() <- main()
 */
export const SIMPLE_CALL_CHAIN: TestFixture = {
  nodes: [
    { name: "helper", kind: "function", file_path: "src/utils.ts", is_exported: true },
    { name: "processData", kind: "function", file_path: "src/service.ts", is_exported: true },
    { name: "main", kind: "function", file_path: "src/index.ts", is_exported: true },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:function:processData",
      target_entity_id: "test:pkg:function:helper",
      edge_type: "CALLS",
      source_file_path: "src/service.ts",
    },
    {
      source_entity_id: "test:pkg:function:main",
      target_entity_id: "test:pkg:function:processData",
      edge_type: "CALLS",
      source_file_path: "src/index.ts",
    },
  ],
};

/**
 * Class hierarchy with methods
 *
 * BaseClass <- DerivedClass (extends)
 * BaseClass.baseMethod()
 * DerivedClass.derivedMethod() calls BaseClass.baseMethod()
 */
export const CLASS_HIERARCHY: TestFixture = {
  nodes: [
    { name: "BaseClass", kind: "class", file_path: "src/base.ts", is_exported: true },
    { name: "baseMethod", kind: "method", file_path: "src/base.ts" },
    { name: "DerivedClass", kind: "class", file_path: "src/derived.ts", is_exported: true },
    { name: "derivedMethod", kind: "method", file_path: "src/derived.ts" },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:class:DerivedClass",
      target_entity_id: "test:pkg:class:BaseClass",
      edge_type: "EXTENDS",
      source_file_path: "src/derived.ts",
    },
    {
      source_entity_id: "test:pkg:class:BaseClass",
      target_entity_id: "test:pkg:method:baseMethod",
      edge_type: "CONTAINS",
      source_file_path: "src/base.ts",
    },
    {
      source_entity_id: "test:pkg:class:DerivedClass",
      target_entity_id: "test:pkg:method:derivedMethod",
      edge_type: "CONTAINS",
      source_file_path: "src/derived.ts",
    },
    {
      source_entity_id: "test:pkg:method:derivedMethod",
      target_entity_id: "test:pkg:method:baseMethod",
      edge_type: "CALLS",
      source_file_path: "src/derived.ts",
    },
  ],
};

/**
 * Module import chain
 *
 * index.ts imports from service.ts imports from utils.ts
 */
export const IMPORT_CHAIN: TestFixture = {
  nodes: [
    { name: "utils", kind: "module", file_path: "src/utils.ts", is_exported: true },
    { name: "service", kind: "module", file_path: "src/service.ts", is_exported: true },
    { name: "index", kind: "module", file_path: "src/index.ts", is_exported: true },
    { name: "helperFn", kind: "function", file_path: "src/utils.ts", is_exported: true },
    { name: "serviceFn", kind: "function", file_path: "src/service.ts", is_exported: true },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:module:service",
      target_entity_id: "test:pkg:module:utils",
      edge_type: "IMPORTS",
      source_file_path: "src/service.ts",
    },
    {
      source_entity_id: "test:pkg:module:index",
      target_entity_id: "test:pkg:module:service",
      edge_type: "IMPORTS",
      source_file_path: "src/index.ts",
    },
  ],
  externalRefs: [
    {
      source_entity_id: "test:pkg:module:service",
      module_specifier: "./utils",
      imported_symbol: "helperFn",
    },
    {
      source_entity_id: "test:pkg:module:index",
      module_specifier: "./service",
      imported_symbol: "serviceFn",
    },
  ],
};

/**
 * Circular dependency graph
 *
 * A -> B -> C -> A
 */
export const CIRCULAR_DEPS: TestFixture = {
  nodes: [
    { name: "moduleA", kind: "module", file_path: "src/a.ts", is_exported: true },
    { name: "moduleB", kind: "module", file_path: "src/b.ts", is_exported: true },
    { name: "moduleC", kind: "module", file_path: "src/c.ts", is_exported: true },
    { name: "funcA", kind: "function", file_path: "src/a.ts", is_exported: true },
    { name: "funcB", kind: "function", file_path: "src/b.ts", is_exported: true },
    { name: "funcC", kind: "function", file_path: "src/c.ts", is_exported: true },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:function:funcA",
      target_entity_id: "test:pkg:function:funcB",
      edge_type: "CALLS",
      source_file_path: "src/a.ts",
    },
    {
      source_entity_id: "test:pkg:function:funcB",
      target_entity_id: "test:pkg:function:funcC",
      edge_type: "CALLS",
      source_file_path: "src/b.ts",
    },
    {
      source_entity_id: "test:pkg:function:funcC",
      target_entity_id: "test:pkg:function:funcA",
      edge_type: "CALLS",
      source_file_path: "src/c.ts",
    },
  ],
};

/**
 * Deep nesting graph (5 levels)
 *
 * level1 -> level2 -> level3 -> level4 -> level5
 */
export const DEEP_NESTING: TestFixture = {
  nodes: [
    { name: "level1", kind: "function", file_path: "src/deep/level1.ts", is_exported: true },
    { name: "level2", kind: "function", file_path: "src/deep/level2.ts", is_exported: true },
    { name: "level3", kind: "function", file_path: "src/deep/level3.ts", is_exported: true },
    { name: "level4", kind: "function", file_path: "src/deep/level4.ts", is_exported: true },
    { name: "level5", kind: "function", file_path: "src/deep/level5.ts", is_exported: true },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:function:level1",
      target_entity_id: "test:pkg:function:level2",
      edge_type: "CALLS",
      source_file_path: "src/deep/level1.ts",
    },
    {
      source_entity_id: "test:pkg:function:level2",
      target_entity_id: "test:pkg:function:level3",
      edge_type: "CALLS",
      source_file_path: "src/deep/level2.ts",
    },
    {
      source_entity_id: "test:pkg:function:level3",
      target_entity_id: "test:pkg:function:level4",
      edge_type: "CALLS",
      source_file_path: "src/deep/level3.ts",
    },
    {
      source_entity_id: "test:pkg:function:level4",
      target_entity_id: "test:pkg:function:level5",
      edge_type: "CALLS",
      source_file_path: "src/deep/level4.ts",
    },
  ],
};

/**
 * External dependencies fixture
 *
 * Code that imports from external packages
 */
export const EXTERNAL_DEPS: TestFixture = {
  nodes: [
    { name: "app", kind: "module", file_path: "src/app.ts", is_exported: true },
    { name: "handler", kind: "function", file_path: "src/app.ts", is_exported: true },
  ],
  externalRefs: [
    {
      source_entity_id: "test:pkg:module:app",
      module_specifier: "express",
      imported_symbol: "Router",
      import_style: "named",
    },
    {
      source_entity_id: "test:pkg:module:app",
      module_specifier: "lodash",
      imported_symbol: "default",
      import_style: "default",
    },
    {
      source_entity_id: "test:pkg:module:app",
      module_specifier: "zod",
      imported_symbol: "z",
      import_style: "named",
      is_type_only: false,
    },
  ],
};

/**
 * Empty fixture for testing edge cases
 */
export const EMPTY_FIXTURE: TestFixture = {
  nodes: [],
  edges: [],
  externalRefs: [],
};

/**
 * Single node fixture
 */
export const SINGLE_NODE: TestFixture = {
  nodes: [
    { name: "standalone", kind: "function", file_path: "src/standalone.ts", is_exported: true },
  ],
};

/**
 * Interface implementation fixture
 */
export const INTERFACE_IMPL: TestFixture = {
  nodes: [
    { name: "IService", kind: "interface", file_path: "src/types.ts", is_exported: true },
    { name: "ServiceImpl", kind: "class", file_path: "src/service.ts", is_exported: true },
    { name: "process", kind: "method", file_path: "src/service.ts" },
  ],
  edges: [
    {
      source_entity_id: "test:pkg:class:ServiceImpl",
      target_entity_id: "test:pkg:interface:IService",
      edge_type: "IMPLEMENTS",
      source_file_path: "src/service.ts",
    },
    {
      source_entity_id: "test:pkg:class:ServiceImpl",
      target_entity_id: "test:pkg:method:process",
      edge_type: "CONTAINS",
      source_file_path: "src/service.ts",
    },
  ],
};

/**
 * Generate a fixture with a specified number of nodes
 * Useful for performance testing
 */
export function generateLargeFixture(nodeCount: number): TestFixture {
  const nodes = [];
  const edges = [];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      name: `func${i}`,
      kind: "function" as const,
      file_path: `src/gen/file${Math.floor(i / 10)}.ts`,
      is_exported: i % 5 === 0,
    });

    // Create edges to previous nodes (forming a dependency chain)
    if (i > 0) {
      edges.push({
        source_entity_id: `test:pkg:function:func${i}`,
        target_entity_id: `test:pkg:function:func${i - 1}`,
        edge_type: "CALLS" as const,
        source_file_path: `src/gen/file${Math.floor(i / 10)}.ts`,
      });
    }
  }

  return { nodes, edges };
}
