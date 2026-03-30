import { describe, expect, it } from "vitest";
import { InMemoryDatomStore } from "../../src/datom/datom-store.js";
import { graphDepsDatom } from "../../src/datom/graph-deps-datom.js";
import { loadFromArrays } from "../../src/datom/loader.js";
import { createEdgeFromTestData, createNodeFromTestData } from "../../src/storage/schemas/index.js";
import {
  CIRCULAR_DEPS,
  CLASS_HIERARCHY,
  DEEP_NESTING,
  SIMPLE_CALL_CHAIN,
} from "../../src/test-utils/fixtures.js";
import type { TestFixture } from "../../src/test-utils/seed-factory.js";

/**
 * Convert a TestFixture into full schema types and load into a fresh store.
 * Uses deterministic entity_ids: "test:pkg:{kind}:{name}" to match fixture edge IDs.
 */
function loadFixture(fixture: TestFixture): InMemoryDatomStore {
  const store = new InMemoryDatomStore();
  loadFromArrays(store, {
    nodes: fixture.nodes?.map((n) => {
      const node = createNodeFromTestData(n, { entityIdPrefix: "test:pkg" });
      // Override random hash with name to match fixture edge IDs
      if (!n.entity_id) {
        node.entity_id = `test:pkg:${n.kind}:${n.name}`;
      }
      return node;
    }),
    edges: fixture.edges?.map(createEdgeFromTestData),
  });
  return store;
}

describe("graphDepsDatom", () => {
  describe("SIMPLE_CALL_CHAIN (helper <- processData <- main)", () => {
    it("depth=1 returns direct deps of main", () => {
      const store = loadFixture(SIMPLE_CALL_CHAIN);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:main",
        depth: 1,
      });

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe("processData");
      expect(deps[0].edgeType).toBe("CALLS");
      expect(deps[0].depth).toBe(1);
    });

    it("depth=2 returns transitive deps of main", () => {
      const store = loadFixture(SIMPLE_CALL_CHAIN);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:main",
        depth: 2,
      });

      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain("processData");
      expect(names).toContain("helper");
    });

    it("returns processData deps from the middle of the chain", () => {
      const store = loadFixture(SIMPLE_CALL_CHAIN);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:processData",
        depth: 1,
      });

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe("helper");
    });

    it("returns nothing for leaf node (helper)", () => {
      const store = loadFixture(SIMPLE_CALL_CHAIN);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:helper",
        depth: 1,
      });

      expect(deps).toHaveLength(0);
    });
  });

  describe("CLASS_HIERARCHY (BaseClass, DerivedClass, methods)", () => {
    it("gets all edges from DerivedClass (EXTENDS, CONTAINS)", () => {
      const store = loadFixture(CLASS_HIERARCHY);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:class:DerivedClass",
        depth: 1,
      });

      expect(deps).toHaveLength(2);
      const types = deps.map((d) => d.edgeType).sort();
      expect(types).toEqual(["CONTAINS", "EXTENDS"]);
    });

    it("filters by edgeType=EXTENDS", () => {
      const store = loadFixture(CLASS_HIERARCHY);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:class:DerivedClass",
        edgeType: "EXTENDS",
        depth: 1,
      });

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe("BaseClass");
      expect(deps[0].edgeType).toBe("EXTENDS");
    });

    it("filters by edgeType=CALLS for derivedMethod", () => {
      const store = loadFixture(CLASS_HIERARCHY);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:method:derivedMethod",
        edgeType: "CALLS",
        depth: 1,
      });

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe("baseMethod");
    });
  });

  describe("CIRCULAR_DEPS (A -> B -> C -> A)", () => {
    it("handles cycles without infinite loop", () => {
      const store = loadFixture(CIRCULAR_DEPS);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:funcA",
        depth: 10,
      });

      // Should find funcB and funcC but NOT loop back to funcA
      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain("funcB");
      expect(names).toContain("funcC");
    });

    it("depth=1 returns only direct dep", () => {
      const store = loadFixture(CIRCULAR_DEPS);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:funcA",
        depth: 1,
      });

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe("funcB");
    });
  });

  describe("DEEP_NESTING (5 levels)", () => {
    it("depth=5 traverses the full chain", () => {
      const store = loadFixture(DEEP_NESTING);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:level1",
        depth: 5,
      });

      expect(deps).toHaveLength(4);
      const names = deps.map((d) => d.name);
      expect(names).toContain("level2");
      expect(names).toContain("level3");
      expect(names).toContain("level4");
      expect(names).toContain("level5");
    });

    it("depth=2 only goes 2 levels deep", () => {
      const store = loadFixture(DEEP_NESTING);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:level1",
        depth: 2,
      });

      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain("level2");
      expect(names).toContain("level3");
    });

    it("each result has correct depth annotation", () => {
      const store = loadFixture(DEEP_NESTING);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:level1",
        depth: 5,
      });

      const depthMap = Object.fromEntries(deps.map((d) => [d.name, d.depth]));
      expect(depthMap.level2).toBe(1);
      expect(depthMap.level3).toBe(2);
      expect(depthMap.level4).toBe(3);
      expect(depthMap.level5).toBe(4);
    });
  });

  describe("limit", () => {
    it("respects limit parameter", () => {
      const store = loadFixture(DEEP_NESTING);

      const deps = graphDepsDatom(store, {
        entity: "test:pkg:function:level1",
        depth: 5,
        limit: 2,
      });

      expect(deps).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("returns empty for nonexistent entity", () => {
      const store = new InMemoryDatomStore();
      const deps = graphDepsDatom(store, { entity: "nonexistent" });
      expect(deps).toHaveLength(0);
    });

    it("returns empty for entity with no edges", () => {
      const store = new InMemoryDatomStore();
      store.assertDatom({
        e: "e1",
        a: ":node/name",
        v: "lonely",
        tx: 1,
        op: "assert",
      });

      const deps = graphDepsDatom(store, { entity: "e1" });
      expect(deps).toHaveLength(0);
    });
  });
});
