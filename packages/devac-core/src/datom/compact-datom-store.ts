/**
 * CompactDatomStore — Memory-optimized datom store.
 *
 * Drop-in replacement for InMemoryDatomStore, implementing the same
 * DatomStore interface. Four optimizations:
 *
 * 1. INTERNED ATTRIBUTE KEYS: Map<number, X> instead of Map<string, X>.
 *    V8 SMI optimization saves ~40 bytes/entry.
 *
 * 2. POINTER-ONLY AEVT: Stores Map<internedAttr, Set<EntityId>> only.
 *    No value duplication. Dereferences EAVT for value queries.
 *
 * 3. TYPE-SPECIFIC AVET: Separate sub-indexes per primitive type.
 *    Eliminates serializeValue() string allocations entirely.
 *
 * 4. ENTITYVIEW WEAKREF CACHE: Reuses EntityView wrappers on repeated access.
 */

import { InternPool } from "./intern-pool.js";
import type {
  Attribute,
  Datom,
  DatomStore,
  DatomValue,
  EdgeDatomValue,
  EntityId,
  EntityView,
} from "./types.js";

// ---------------------------------------------------------------------------
// TypedValueIndex — Type-discriminated AVET sub-indexes
// ---------------------------------------------------------------------------

interface TypedValueIndex {
  stringValues: Map<string, Set<EntityId>>;
  numberValues: Map<number, Set<EntityId>>;
  trueEntities: Set<EntityId>;
  falseEntities: Set<EntityId>;
  complexValues: Map<string, Set<EntityId>>;
}

function createTypedValueIndex(): TypedValueIndex {
  return {
    stringValues: new Map(),
    numberValues: new Map(),
    trueEntities: new Set(),
    falseEntities: new Set(),
    complexValues: new Map(),
  };
}

function addToTypedIndex(index: TypedValueIndex, value: DatomValue, entityId: EntityId): void {
  if (typeof value === "string") {
    let set = index.stringValues.get(value);
    if (!set) {
      set = new Set();
      index.stringValues.set(value, set);
    }
    set.add(entityId);
  } else if (typeof value === "number") {
    let set = index.numberValues.get(value);
    if (!set) {
      set = new Set();
      index.numberValues.set(value, set);
    }
    set.add(entityId);
  } else if (typeof value === "boolean") {
    if (value) {
      index.trueEntities.add(entityId);
    } else {
      index.falseEntities.add(entityId);
    }
  } else if (value !== null) {
    // Arrays and objects — JSON serialization unavoidable
    const key = JSON.stringify(value);
    let set = index.complexValues.get(key);
    if (!set) {
      set = new Set();
      index.complexValues.set(key, set);
    }
    set.add(entityId);
  }
}

function findInTypedIndex(index: TypedValueIndex, value: DatomValue): EntityId[] {
  if (typeof value === "string") {
    const set = index.stringValues.get(value);
    return set ? Array.from(set) : [];
  }
  if (typeof value === "number") {
    const set = index.numberValues.get(value);
    return set ? Array.from(set) : [];
  }
  if (typeof value === "boolean") {
    const set = value ? index.trueEntities : index.falseEntities;
    return Array.from(set);
  }
  if (value !== null) {
    const key = JSON.stringify(value);
    const set = index.complexValues.get(key);
    return set ? Array.from(set) : [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// CompactEntityViewImpl — Lazily resolves interned attrs
// ---------------------------------------------------------------------------

class CompactEntityViewImpl implements EntityView {
  readonly id: EntityId;
  private internedAttrs: Map<number, DatomValue[]>;
  private pool: InternPool;
  private _resolvedAttrs: ReadonlyMap<Attribute, DatomValue[]> | null = null;

  constructor(id: EntityId, attrs: Map<number, DatomValue[]>, pool: InternPool) {
    this.id = id;
    this.internedAttrs = attrs;
    this.pool = pool;
  }

  get attrs(): ReadonlyMap<Attribute, DatomValue[]> {
    if (!this._resolvedAttrs) {
      const resolved = new Map<Attribute, DatomValue[]>();
      for (const [internedId, values] of this.internedAttrs) {
        resolved.set(this.pool.resolve(internedId), values);
      }
      this._resolvedAttrs = resolved;
    }
    return this._resolvedAttrs;
  }

  get(attr: Attribute): DatomValue | undefined {
    if (!this.pool.has(attr)) return undefined;
    const values = this.internedAttrs.get(this.pool.intern(attr));
    return values?.[0];
  }

  getAll(attr: Attribute): DatomValue[] {
    if (!this.pool.has(attr)) return [];
    return this.internedAttrs.get(this.pool.intern(attr)) ?? [];
  }

  has(attr: Attribute): boolean {
    if (!this.pool.has(attr)) return false;
    return this.internedAttrs.has(this.pool.intern(attr));
  }
}

// ---------------------------------------------------------------------------
// CompactDatomStore
// ---------------------------------------------------------------------------

export class CompactDatomStore implements DatomStore {
  /** Shared intern pool for attribute strings */
  readonly attrPool = new InternPool();

  // EAVT: entity → Map<internedAttr, values[]>
  private eavt = new Map<EntityId, Map<number, DatomValue[]>>();

  // AEVT (pointer-only): internedAttr → Set<EntityId>
  private aevt = new Map<number, Set<EntityId>>();

  // AVET (type-specific): internedAttr → TypedValueIndex
  private avet = new Map<number, TypedValueIndex>();

  // VAET: targetEntity → Map<internedAttr, Set<sourceEntity>>
  private vaet = new Map<EntityId, Map<number, Set<EntityId>>>();

  // EntityView cache: WeakRef to allow GC when no external refs
  private viewCache = new Map<EntityId, WeakRef<CompactEntityViewImpl>>();

  private _datomCount = 0;

  // --- EAVT: entity-centric access ---

  get(entity: EntityId): EntityView | undefined {
    // Check cache
    const cached = this.viewCache.get(entity);
    if (cached) {
      const view = cached.deref();
      if (view) return view;
      this.viewCache.delete(entity);
    }

    const attrMap = this.eavt.get(entity);
    if (!attrMap) return undefined;

    const view = new CompactEntityViewImpl(entity, attrMap, this.attrPool);
    this.viewCache.set(entity, new WeakRef(view));
    return view;
  }

  getAttribute(entity: EntityId, attr: Attribute): DatomValue[] {
    const attrMap = this.eavt.get(entity);
    if (!attrMap) return [];
    if (!this.attrPool.has(attr)) return [];
    return attrMap.get(this.attrPool.intern(attr)) ?? [];
  }

  // --- AEVT: attribute-centric access (pointer-only) ---

  findByAttribute(attr: Attribute, value?: DatomValue): EntityId[] {
    if (!this.attrPool.has(attr)) return [];
    const internedAttr = this.attrPool.intern(attr);
    const entitySet = this.aevt.get(internedAttr);
    if (!entitySet) return [];

    if (value === undefined) {
      return Array.from(entitySet);
    }

    // Dereference through EAVT for value matching
    const result: EntityId[] = [];
    for (const entityId of entitySet) {
      const attrMap = this.eavt.get(entityId);
      if (!attrMap) continue;
      const values = attrMap.get(internedAttr);
      if (!values) continue;
      if (values.some((v) => valuesEqual(v, value))) {
        result.push(entityId);
      }
    }
    return result;
  }

  // --- AVET: value search (type-specific) ---

  findByValue(attr: Attribute, value: DatomValue): EntityId[] {
    if (!this.attrPool.has(attr)) return [];
    const internedAttr = this.attrPool.intern(attr);
    const index = this.avet.get(internedAttr);
    if (!index) return [];
    return findInTypedIndex(index, value);
  }

  // --- VAET: reverse references ---

  reverseRefs(target: EntityId, attr?: Attribute): EntityId[] {
    const attrMap = this.vaet.get(target);
    if (!attrMap) return [];

    if (attr) {
      if (!this.attrPool.has(attr)) return [];
      const sourceSet = attrMap.get(this.attrPool.intern(attr));
      return sourceSet ? Array.from(sourceSet) : [];
    }

    const result = new Set<EntityId>();
    for (const sourceSet of attrMap.values()) {
      for (const id of sourceSet) {
        result.add(id);
      }
    }
    return Array.from(result);
  }

  // --- Convenience ---

  callers(entity: EntityId): EntityView[] {
    const callsAttr = ":edge/CALLS";
    return this.reverseRefs(entity, callsAttr)
      .map((id) => this.get(id))
      .filter((v): v is EntityView => v !== undefined);
  }

  callees(entity: EntityId): EntityView[] {
    const callEdges = this.getAttribute(entity, ":edge/CALLS");
    return callEdges
      .map((v) => {
        const target = (v as unknown as EdgeDatomValue).target;
        return target ? this.get(target) : undefined;
      })
      .filter((v): v is EntityView => v !== undefined);
  }

  // --- Transitive traversal ---

  transitiveDeps(entity: EntityId, attr: Attribute, depth: number): EntityView[] {
    const visited = new Set<EntityId>();
    const result: EntityView[] = [];
    const queue: { id: EntityId; currentDepth: number }[] = [{ id: entity, currentDepth: 0 }];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      if (id !== entity) {
        const view = this.get(id);
        if (view) result.push(view);
      }

      if (currentDepth < depth) {
        const edges = this.getAttribute(id, attr);
        for (const edge of edges) {
          const target = (edge as unknown as EdgeDatomValue).target;
          if (target && !visited.has(target)) {
            queue.push({ id: target, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return result;
  }

  // --- Mutation ---

  assertDatom(datom: Datom): void {
    this.indexDatom(datom);
    this._datomCount++;
  }

  assertDatoms(datoms: Datom[]): void {
    for (const datom of datoms) {
      this.indexDatom(datom);
    }
    this._datomCount += datoms.length;
  }

  // --- Stats ---

  entityCount(): number {
    return this.eavt.size;
  }

  datomCount(): number {
    return this._datomCount;
  }

  // --- Private ---

  private indexDatom(datom: Datom): void {
    const { e, a, v } = datom;
    const internedAttr = this.attrPool.intern(a);

    // EAVT (interned attr keys)
    let attrMap = this.eavt.get(e);
    if (!attrMap) {
      attrMap = new Map();
      this.eavt.set(e, attrMap);
    }
    let values = attrMap.get(internedAttr);
    if (!values) {
      values = [];
      attrMap.set(internedAttr, values);
    }
    values.push(v);

    // Invalidate cached EntityView (attrs may have changed)
    this.viewCache.delete(e);

    // AEVT (pointer-only: just track which entities have this attribute)
    let entitySet = this.aevt.get(internedAttr);
    if (!entitySet) {
      entitySet = new Set();
      this.aevt.set(internedAttr, entitySet);
    }
    entitySet.add(e);

    // AVET (type-specific)
    let typedIndex = this.avet.get(internedAttr);
    if (!typedIndex) {
      typedIndex = createTypedValueIndex();
      this.avet.set(internedAttr, typedIndex);
    }
    addToTypedIndex(typedIndex, v, e);

    // VAET — only for edge datoms
    if (a.startsWith(":edge/") && v !== null && typeof v === "object" && !Array.isArray(v)) {
      const target = (v as unknown as EdgeDatomValue).target;
      if (target) {
        let refAttrMap = this.vaet.get(target);
        if (!refAttrMap) {
          refAttrMap = new Map();
          this.vaet.set(target, refAttrMap);
        }
        let sourceSet = refAttrMap.get(internedAttr);
        if (!sourceSet) {
          sourceSet = new Set();
          refAttrMap.set(internedAttr, sourceSet);
        }
        sourceSet.add(e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Structural equality for DatomValue without serialization for primitives */
function valuesEqual(a: DatomValue, b: DatomValue): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
