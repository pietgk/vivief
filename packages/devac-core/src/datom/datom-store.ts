/**
 * InMemoryDatomStore — Four-index datom store backed by TypeScript Maps
 *
 * Indexes:
 *   EAVT: entity → attribute → values[]        (entity-centric access)
 *   AEVT: attribute → entity → values[]         (attribute-centric access)
 *   AVET: attribute → serializedValue → entities (value search)
 *   VAET: targetEntity → attribute → sourceEntities (reverse refs, edges only)
 */

import type {
  Attribute,
  Datom,
  DatomStore,
  DatomValue,
  EdgeDatomValue,
  EntityId,
  EntityView,
  TxId,
} from "./types.js";

class EntityViewImpl implements EntityView {
  readonly id: EntityId;
  readonly attrs: ReadonlyMap<Attribute, DatomValue[]>;

  constructor(id: EntityId, attrs: Map<Attribute, DatomValue[]>) {
    this.id = id;
    this.attrs = attrs;
  }

  get(attr: Attribute): DatomValue | undefined {
    const values = this.attrs.get(attr);
    return values?.[0];
  }

  getAll(attr: Attribute): DatomValue[] {
    return this.attrs.get(attr) ?? [];
  }

  has(attr: Attribute): boolean {
    return this.attrs.has(attr);
  }
}

export class InMemoryDatomStore implements DatomStore {
  // EAVT: entity → attribute → values[]
  private eavt = new Map<EntityId, Map<Attribute, DatomValue[]>>();

  // AEVT: attribute → entity → values[]
  private aevt = new Map<Attribute, Map<EntityId, DatomValue[]>>();

  // AVET: attribute → serializedValue → Set<EntityId>
  private avet = new Map<Attribute, Map<string, Set<EntityId>>>();

  // VAET: targetEntity → attribute → Set<sourceEntity>
  private vaet = new Map<EntityId, Map<Attribute, Set<EntityId>>>();

  private _datomCount = 0;
  private _txCounter = 0;

  /** Get the next transaction ID */
  nextTx(): TxId {
    return ++this._txCounter;
  }

  // --- EAVT: entity-centric access ---

  get(entity: EntityId): EntityView | undefined {
    const attrMap = this.eavt.get(entity);
    if (!attrMap) return undefined;
    return new EntityViewImpl(entity, attrMap);
  }

  getAttribute(entity: EntityId, attr: Attribute): DatomValue[] {
    return this.eavt.get(entity)?.get(attr) ?? [];
  }

  // --- AEVT: attribute-centric access ---

  findByAttribute(attr: Attribute, value?: DatomValue): EntityId[] {
    const entityMap = this.aevt.get(attr);
    if (!entityMap) return [];

    if (value === undefined) {
      return Array.from(entityMap.keys());
    }

    const serialized = serializeValue(value);
    const result: EntityId[] = [];
    for (const [entityId, values] of entityMap) {
      if (values.some((v) => serializeValue(v) === serialized)) {
        result.push(entityId);
      }
    }
    return result;
  }

  // --- AVET: value search ---

  findByValue(attr: Attribute, value: DatomValue): EntityId[] {
    const valueMap = this.avet.get(attr);
    if (!valueMap) return [];

    const serialized = serializeValue(value);
    const entitySet = valueMap.get(serialized);
    return entitySet ? Array.from(entitySet) : [];
  }

  // --- VAET: reverse references ---

  reverseRefs(target: EntityId, attr?: Attribute): EntityId[] {
    const attrMap = this.vaet.get(target);
    if (!attrMap) return [];

    if (attr) {
      const sourceSet = attrMap.get(attr);
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
    return this.reverseRefs(entity, ":edge/CALLS")
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
      const next = queue.shift();
      if (!next) break;
      const { id, currentDepth } = next;

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

    // EAVT
    let attrMap = this.eavt.get(e);
    if (!attrMap) {
      attrMap = new Map();
      this.eavt.set(e, attrMap);
    }
    let values = attrMap.get(a);
    if (!values) {
      values = [];
      attrMap.set(a, values);
    }
    values.push(v);

    // AEVT
    let entityMap = this.aevt.get(a);
    if (!entityMap) {
      entityMap = new Map();
      this.aevt.set(a, entityMap);
    }
    let entityValues = entityMap.get(e);
    if (!entityValues) {
      entityValues = [];
      entityMap.set(e, entityValues);
    }
    entityValues.push(v);

    // AVET
    let valueMap = this.avet.get(a);
    if (!valueMap) {
      valueMap = new Map();
      this.avet.set(a, valueMap);
    }
    const serialized = serializeValue(v);
    let entitySet = valueMap.get(serialized);
    if (!entitySet) {
      entitySet = new Set();
      valueMap.set(serialized, entitySet);
    }
    entitySet.add(e);

    // VAET — only for edge datoms (attributes starting with ":edge/")
    if (a.startsWith(":edge/") && v !== null && typeof v === "object" && !Array.isArray(v)) {
      const target = (v as unknown as EdgeDatomValue).target;
      if (target) {
        let refAttrMap = this.vaet.get(target);
        if (!refAttrMap) {
          refAttrMap = new Map();
          this.vaet.set(target, refAttrMap);
        }
        let sourceSet = refAttrMap.get(a);
        if (!sourceSet) {
          sourceSet = new Set();
          refAttrMap.set(a, sourceSet);
        }
        sourceSet.add(e);
      }
    }
  }
}

/** Stable serialization of a DatomValue for use as Map key */
function serializeValue(v: DatomValue): string {
  if (v === null) return "null";
  if (typeof v === "string") return `s:${v}`;
  if (typeof v === "number") return `n:${v}`;
  if (typeof v === "boolean") return `b:${v}`;
  return JSON.stringify(v);
}
