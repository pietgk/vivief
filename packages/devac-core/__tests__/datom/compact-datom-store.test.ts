import { describe, expect, it } from "vitest";
import { CompactDatomStore } from "../../src/datom/compact-datom-store.js";
import type { Datom, EdgeDatomValue } from "../../src/datom/types.js";

function makeDatom(e: string, a: string, v: Datom["v"], tx = 1): Datom {
  return { e, a, v, tx, op: "assert" };
}

function makeEdgeValue(target: string, sourceFile = "src/test.ts", sourceLine = 1): EdgeDatomValue {
  return { target, sourceFile, sourceLine, sourceColumn: 0, properties: {} };
}

describe("CompactDatomStore", () => {
  describe("assertDatom + stats", () => {
    it("tracks entity and datom counts", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "hello"));
      store.assertDatom(makeDatom("e1", ":node/kind", "function"));
      store.assertDatom(makeDatom("e2", ":node/name", "world"));

      expect(store.entityCount()).toBe(2);
      expect(store.datomCount()).toBe(3);
    });

    it("handles structured values", () => {
      const store = new CompactDatomStore();
      const edgeVal = makeEdgeValue("e2");
      store.assertDatom(makeDatom("e1", ":edge/CALLS", edgeVal));

      expect(store.datomCount()).toBe(1);
      expect(store.entityCount()).toBe(1);
    });
  });

  describe("assertDatoms (bulk)", () => {
    it("inserts multiple datoms at once", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "a"),
        makeDatom("e1", ":node/kind", "function"),
        makeDatom("e2", ":node/name", "b"),
      ]);
      expect(store.entityCount()).toBe(2);
      expect(store.datomCount()).toBe(3);
    });
  });

  describe("EAVT — get / getAttribute", () => {
    it("get returns EntityView with all attributes", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "myFunc"),
        makeDatom("e1", ":node/kind", "function"),
        makeDatom("e1", ":node/is_exported", true),
      ]);

      const view = store.get("e1");
      expect(view).toBeDefined();
      expect(view?.id).toBe("e1");
      expect(view?.get(":node/name")).toBe("myFunc");
      expect(view?.get(":node/kind")).toBe("function");
      expect(view?.get(":node/is_exported")).toBe(true);
      expect(view?.has(":node/name")).toBe(true);
      expect(view?.has(":node/missing")).toBe(false);
    });

    it("get returns undefined for unknown entity", () => {
      const store = new CompactDatomStore();
      expect(store.get("nonexistent")).toBeUndefined();
    });

    it("getAttribute returns values for known attribute", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "fn"));
      expect(store.getAttribute("e1", ":node/name")).toEqual(["fn"]);
    });

    it("getAttribute returns empty for unknown attribute", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "fn"));
      expect(store.getAttribute("e1", ":node/missing")).toEqual([]);
    });

    it("getAttribute returns empty for unknown entity", () => {
      const store = new CompactDatomStore();
      expect(store.getAttribute("nonexistent", ":node/name")).toEqual([]);
    });

    it("getAll returns multi-valued attributes", () => {
      const store = new CompactDatomStore();
      const edge1 = makeEdgeValue("e2");
      const edge2 = makeEdgeValue("e3");
      store.assertDatoms([
        makeDatom("e1", ":edge/CALLS", edge1),
        makeDatom("e1", ":edge/CALLS", edge2),
      ]);

      const view = store.get("e1")!;
      expect(view.getAll(":edge/CALLS")).toHaveLength(2);
    });
  });

  describe("AEVT — findByAttribute", () => {
    it("finds all entities with a given attribute", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "a"),
        makeDatom("e2", ":node/name", "b"),
        makeDatom("e3", ":node/kind", "class"),
      ]);

      const result = store.findByAttribute(":node/name");
      expect(result).toHaveLength(2);
      expect(result).toContain("e1");
      expect(result).toContain("e2");
    });

    it("finds entities with attribute matching specific value", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/kind", "function"),
        makeDatom("e2", ":node/kind", "class"),
        makeDatom("e3", ":node/kind", "function"),
      ]);

      const result = store.findByAttribute(":node/kind", "function");
      expect(result).toHaveLength(2);
      expect(result).toContain("e1");
      expect(result).toContain("e3");
    });

    it("returns empty array for unknown attribute", () => {
      const store = new CompactDatomStore();
      expect(store.findByAttribute(":node/missing")).toEqual([]);
    });
  });

  describe("AVET — findByValue", () => {
    it("finds entities by exact string value", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "processData"),
        makeDatom("e2", ":node/name", "handleClick"),
        makeDatom("e3", ":node/name", "processData"),
      ]);

      const result = store.findByValue(":node/name", "processData");
      expect(result).toHaveLength(2);
      expect(result).toContain("e1");
      expect(result).toContain("e3");
    });

    it("finds entities by boolean value", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/is_exported", true),
        makeDatom("e2", ":node/is_exported", false),
        makeDatom("e3", ":node/is_exported", true),
      ]);

      const result = store.findByValue(":node/is_exported", true);
      expect(result).toHaveLength(2);
      expect(result).toContain("e1");
      expect(result).toContain("e3");
    });

    it("finds entities by number value", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/start_line", 42),
        makeDatom("e2", ":node/start_line", 100),
      ]);

      expect(store.findByValue(":node/start_line", 42)).toEqual(["e1"]);
    });

    it("returns empty for no match", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "hello"));
      expect(store.findByValue(":node/name", "nonexistent")).toEqual([]);
    });
  });

  describe("VAET — reverseRefs", () => {
    it("finds callers of a function", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "caller1"),
        makeDatom("e2", ":node/name", "caller2"),
        makeDatom("e3", ":node/name", "target"),
        makeDatom("e1", ":edge/CALLS", makeEdgeValue("e3")),
        makeDatom("e2", ":edge/CALLS", makeEdgeValue("e3")),
      ]);

      const refs = store.reverseRefs("e3", ":edge/CALLS");
      expect(refs).toHaveLength(2);
      expect(refs).toContain("e1");
      expect(refs).toContain("e2");
    });

    it("finds all reverse refs without attribute filter", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":edge/CALLS", makeEdgeValue("e3")),
        makeDatom("e2", ":edge/IMPORTS", makeEdgeValue("e3")),
      ]);

      const refs = store.reverseRefs("e3");
      expect(refs).toHaveLength(2);
      expect(refs).toContain("e1");
      expect(refs).toContain("e2");
    });

    it("returns empty for entity with no incoming refs", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "lonely"));
      expect(store.reverseRefs("e1")).toEqual([]);
    });

    it("does not index non-edge datoms in VAET", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "e2"));
      expect(store.reverseRefs("e2")).toEqual([]);
    });
  });

  describe("callers / callees", () => {
    it("callers returns EntityViews of all callers", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("caller", ":node/name", "callerFn"),
        makeDatom("target", ":node/name", "targetFn"),
        makeDatom("caller", ":edge/CALLS", makeEdgeValue("target")),
      ]);

      const callers = store.callers("target");
      expect(callers).toHaveLength(1);
      expect(callers[0].get(":node/name")).toBe("callerFn");
    });

    it("callees returns EntityViews of all callees", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("caller", ":node/name", "callerFn"),
        makeDatom("t1", ":node/name", "target1"),
        makeDatom("t2", ":node/name", "target2"),
        makeDatom("caller", ":edge/CALLS", makeEdgeValue("t1")),
        makeDatom("caller", ":edge/CALLS", makeEdgeValue("t2")),
      ]);

      const callees = store.callees("caller");
      expect(callees).toHaveLength(2);
      const names = callees.map((c) => c.get(":node/name"));
      expect(names).toContain("target1");
      expect(names).toContain("target2");
    });
  });

  describe("transitiveDeps", () => {
    function buildChainStore(): CompactDatomStore {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("A", ":node/name", "A"),
        makeDatom("B", ":node/name", "B"),
        makeDatom("C", ":node/name", "C"),
        makeDatom("D", ":node/name", "D"),
        makeDatom("A", ":edge/CALLS", makeEdgeValue("B")),
        makeDatom("B", ":edge/CALLS", makeEdgeValue("C")),
        makeDatom("C", ":edge/CALLS", makeEdgeValue("D")),
      ]);
      return store;
    }

    it("depth=1 returns direct deps only", () => {
      const store = buildChainStore();
      const deps = store.transitiveDeps("A", ":edge/CALLS", 1);
      expect(deps).toHaveLength(1);
      expect(deps[0].get(":node/name")).toBe("B");
    });

    it("depth=2 follows two levels", () => {
      const store = buildChainStore();
      const deps = store.transitiveDeps("A", ":edge/CALLS", 2);
      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.get(":node/name"));
      expect(names).toContain("B");
      expect(names).toContain("C");
    });

    it("depth=3 follows full chain", () => {
      const store = buildChainStore();
      const deps = store.transitiveDeps("A", ":edge/CALLS", 3);
      expect(deps).toHaveLength(3);
      const names = deps.map((d) => d.get(":node/name"));
      expect(names).toContain("B");
      expect(names).toContain("C");
      expect(names).toContain("D");
    });

    it("handles cycles without infinite loop", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("A", ":node/name", "A"),
        makeDatom("B", ":node/name", "B"),
        makeDatom("C", ":node/name", "C"),
        makeDatom("A", ":edge/CALLS", makeEdgeValue("B")),
        makeDatom("B", ":edge/CALLS", makeEdgeValue("C")),
        makeDatom("C", ":edge/CALLS", makeEdgeValue("A")),
      ]);

      const deps = store.transitiveDeps("A", ":edge/CALLS", 10);
      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.get(":node/name"));
      expect(names).toContain("B");
      expect(names).toContain("C");
    });

    it("depth=0 returns nothing", () => {
      const store = buildChainStore();
      const deps = store.transitiveDeps("A", ":edge/CALLS", 0);
      expect(deps).toHaveLength(0);
    });

    it("returns empty for entity with no edges", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("A", ":node/name", "lonely"));
      const deps = store.transitiveDeps("A", ":edge/CALLS", 5);
      expect(deps).toHaveLength(0);
    });
  });

  describe("interning behavior", () => {
    it("intern pool size reflects unique attributes, not total datoms", () => {
      const store = new CompactDatomStore();
      for (let i = 0; i < 100; i++) {
        store.assertDatom(makeDatom(`e${i}`, ":node/name", `fn${i}`));
        store.assertDatom(makeDatom(`e${i}`, ":node/kind", "function"));
      }

      // Only 2 unique attributes despite 200 datoms
      expect(store.attrPool.size).toBe(2);
      expect(store.datomCount()).toBe(200);
    });

    it("EntityView.attrs returns string keys, not interned IDs", () => {
      const store = new CompactDatomStore();
      store.assertDatoms([
        makeDatom("e1", ":node/name", "fn"),
        makeDatom("e1", ":node/kind", "function"),
      ]);

      const view = store.get("e1")!;
      const keys = Array.from(view.attrs.keys());
      expect(keys).toContain(":node/name");
      expect(keys).toContain(":node/kind");
      // Should be strings, not numbers
      for (const key of keys) {
        expect(typeof key).toBe("string");
      }
    });

    it("repeated get() for same entity returns cached view", () => {
      const store = new CompactDatomStore();
      store.assertDatom(makeDatom("e1", ":node/name", "fn"));

      const view1 = store.get("e1");
      const view2 = store.get("e1");
      // WeakRef cache should return the same object
      expect(view1).toBe(view2);
    });
  });
});
