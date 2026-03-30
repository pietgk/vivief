import { describe, expect, it } from "vitest";
import { InMemoryDatomStore } from "../../src/datom/datom-store.js";
import { loadFromArrays } from "../../src/datom/loader.js";
import type { EdgeDatomValue, ExternalRefDatomValue } from "../../src/datom/types.js";
import {
  createEdgeFromTestData,
  createExternalRefFromTestData,
  createNodeFromTestData,
} from "../../src/storage/schemas/index.js";

/** Helper: convert TestFixture nodes/edges/externalRefs to full schema types */
function materialize(fixture: {
  nodes?: Parameters<typeof createNodeFromTestData>[0][];
  edges?: Parameters<typeof createEdgeFromTestData>[0][];
  externalRefs?: Parameters<typeof createExternalRefFromTestData>[0][];
}) {
  return {
    nodes: fixture.nodes?.map((n) => createNodeFromTestData(n, { entityIdPrefix: "test:pkg" })),
    edges: fixture.edges?.map(createEdgeFromTestData),
    externalRefs: fixture.externalRefs?.map(createExternalRefFromTestData),
  };
}

describe("loadFromArrays", () => {
  describe("nodes", () => {
    it("loads nodes and creates datoms for each non-null, non-metadata column", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            name: "myFunc",
            kind: "function",
            file_path: "src/utils.ts",
            is_exported: true,
          },
        ],
      });

      const result = loadFromArrays(store, data);

      expect(result.entityCount).toBe(1);
      expect(result.nodesDatomCount).toBeGreaterThan(0);

      // Find the entity by name
      const entities = store.findByValue(":node/name", "myFunc");
      expect(entities).toHaveLength(1);

      const view = store.get(entities[0]!)!;
      expect(view.get(":node/name")).toBe("myFunc");
      expect(view.get(":node/kind")).toBe("function");
      expect(view.get(":node/file_path")).toBe("src/utils.ts");
      expect(view.get(":node/is_exported")).toBe(true);
    });

    it("skips metadata columns (entity_id, source_file_hash, branch, is_deleted, updated_at)", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [{ name: "fn", kind: "function", file_path: "src/a.ts" }],
      });

      loadFromArrays(store, data);

      const entities = store.findByValue(":node/name", "fn");
      const view = store.get(entities[0]!)!;

      // These should NOT be present as attributes
      expect(view.has(":node/entity_id")).toBe(false);
      expect(view.has(":node/source_file_hash")).toBe(false);
      expect(view.has(":node/branch")).toBe(false);
      expect(view.has(":node/is_deleted")).toBe(false);
      expect(view.has(":node/updated_at")).toBe(false);
    });

    it("skips null values", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            name: "fn",
            kind: "function",
            file_path: "src/a.ts",
            // type_signature and documentation default to null
          },
        ],
      });

      loadFromArrays(store, data);

      const entities = store.findByValue(":node/name", "fn");
      const view = store.get(entities[0]!)!;
      expect(view.has(":node/type_signature")).toBe(false);
      expect(view.has(":node/documentation")).toBe(false);
    });

    it("loads multiple nodes as separate entities", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          { name: "a", kind: "function", file_path: "src/a.ts" },
          { name: "b", kind: "class", file_path: "src/b.ts" },
          { name: "c", kind: "variable", file_path: "src/c.ts" },
        ],
      });

      const result = loadFromArrays(store, data);
      expect(result.entityCount).toBe(3);
    });
  });

  describe("edges", () => {
    it("loads edges as structured values on source entity", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:function:caller",
            name: "caller",
            kind: "function",
            file_path: "src/a.ts",
          },
          {
            entity_id: "test:pkg:function:target",
            name: "target",
            kind: "function",
            file_path: "src/b.ts",
          },
        ],
        edges: [
          {
            source_entity_id: "test:pkg:function:caller",
            target_entity_id: "test:pkg:function:target",
            edge_type: "CALLS",
            source_file_path: "src/a.ts",
          },
        ],
      });

      const result = loadFromArrays(store, data);
      expect(result.edgesDatomCount).toBe(1);

      const callerView = store.get("test:pkg:function:caller")!;
      const edges = callerView.getAll(":edge/CALLS");
      expect(edges).toHaveLength(1);

      const edgeVal = edges[0] as unknown as EdgeDatomValue;
      expect(edgeVal.target).toBe("test:pkg:function:target");
      expect(edgeVal.sourceFile).toBe("src/a.ts");
    });

    it("populates VAET index for reverse lookups", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:function:caller",
            name: "caller",
            kind: "function",
            file_path: "src/a.ts",
          },
          {
            entity_id: "test:pkg:function:target",
            name: "target",
            kind: "function",
            file_path: "src/b.ts",
          },
        ],
        edges: [
          {
            source_entity_id: "test:pkg:function:caller",
            target_entity_id: "test:pkg:function:target",
            edge_type: "CALLS",
            source_file_path: "src/a.ts",
          },
        ],
      });

      loadFromArrays(store, data);

      const callers = store.reverseRefs("test:pkg:function:target", ":edge/CALLS");
      expect(callers).toContain("test:pkg:function:caller");
    });

    it("loads multiple edge types", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:class:Child",
            name: "Child",
            kind: "class",
            file_path: "src/a.ts",
          },
          {
            entity_id: "test:pkg:class:Parent",
            name: "Parent",
            kind: "class",
            file_path: "src/b.ts",
          },
          {
            entity_id: "test:pkg:interface:IFace",
            name: "IFace",
            kind: "interface",
            file_path: "src/c.ts",
          },
        ],
        edges: [
          {
            source_entity_id: "test:pkg:class:Child",
            target_entity_id: "test:pkg:class:Parent",
            edge_type: "EXTENDS",
            source_file_path: "src/a.ts",
          },
          {
            source_entity_id: "test:pkg:class:Child",
            target_entity_id: "test:pkg:interface:IFace",
            edge_type: "IMPLEMENTS",
            source_file_path: "src/a.ts",
          },
        ],
      });

      loadFromArrays(store, data);

      const childView = store.get("test:pkg:class:Child")!;
      expect(childView.getAll(":edge/EXTENDS")).toHaveLength(1);
      expect(childView.getAll(":edge/IMPLEMENTS")).toHaveLength(1);
    });
  });

  describe("externalRefs", () => {
    it("loads external refs as structured values", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:module:app",
            name: "app",
            kind: "module",
            file_path: "src/app.ts",
          },
        ],
        externalRefs: [
          {
            source_entity_id: "test:pkg:module:app",
            module_specifier: "express",
            imported_symbol: "Router",
            import_style: "named",
          },
        ],
      });

      const result = loadFromArrays(store, data);
      expect(result.externalRefsDatomCount).toBe(1);

      const appView = store.get("test:pkg:module:app")!;
      const refs = appView.getAll(":external-ref/import");
      expect(refs).toHaveLength(1);

      const ref = refs[0] as unknown as ExternalRefDatomValue;
      expect(ref.moduleSpecifier).toBe("express");
      expect(ref.importedSymbol).toBe("Router");
      expect(ref.importStyle).toBe("named");
    });

    it("loads multiple external refs on same entity", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:module:app",
            name: "app",
            kind: "module",
            file_path: "src/app.ts",
          },
        ],
        externalRefs: [
          {
            source_entity_id: "test:pkg:module:app",
            module_specifier: "express",
            imported_symbol: "Router",
          },
          {
            source_entity_id: "test:pkg:module:app",
            module_specifier: "lodash",
            imported_symbol: "default",
            import_style: "default",
          },
        ],
      });

      loadFromArrays(store, data);

      const appView = store.get("test:pkg:module:app")!;
      expect(appView.getAll(":external-ref/import")).toHaveLength(2);
    });
  });

  describe("LoadResult", () => {
    it("returns correct counts and timing", () => {
      const store = new InMemoryDatomStore();
      const data = materialize({
        nodes: [
          {
            entity_id: "test:pkg:function:a",
            name: "a",
            kind: "function",
            file_path: "src/a.ts",
          },
          {
            entity_id: "test:pkg:function:b",
            name: "b",
            kind: "function",
            file_path: "src/b.ts",
          },
        ],
        edges: [
          {
            source_entity_id: "test:pkg:function:a",
            target_entity_id: "test:pkg:function:b",
            edge_type: "CALLS",
            source_file_path: "src/a.ts",
          },
        ],
        externalRefs: [
          {
            source_entity_id: "test:pkg:function:a",
            module_specifier: "zod",
            imported_symbol: "z",
          },
        ],
      });

      const result = loadFromArrays(store, data);

      expect(result.entityCount).toBe(2);
      expect(result.nodesDatomCount).toBeGreaterThan(0);
      expect(result.edgesDatomCount).toBe(1);
      expect(result.externalRefsDatomCount).toBe(1);
      expect(result.effectsDatomCount).toBe(0);
      expect(result.loadTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.datomCount).toBe(
        result.nodesDatomCount + result.edgesDatomCount + result.externalRefsDatomCount
      );
    });
  });

  describe("empty data", () => {
    it("handles empty arrays", () => {
      const store = new InMemoryDatomStore();
      const result = loadFromArrays(store, {
        nodes: [],
        edges: [],
        externalRefs: [],
      });

      expect(result.entityCount).toBe(0);
      expect(result.datomCount).toBe(0);
    });

    it("handles undefined arrays", () => {
      const store = new InMemoryDatomStore();
      const result = loadFromArrays(store, {});

      expect(result.entityCount).toBe(0);
      expect(result.datomCount).toBe(0);
    });
  });
});
