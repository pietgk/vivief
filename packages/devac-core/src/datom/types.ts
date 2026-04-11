/**
 * Datom Model — Core Types
 *
 * A datom is an immutable fact: [Entity, Attribute, Value, Transaction, Operation].
 * Four indexes (EAVT, AEVT, AVET, VAET) provide entity-centric, attribute-centric,
 * value-centric, and reverse-reference access patterns.
 *
 * See: docs/vision/brainstorms/vivief-datom-virtual-projections-spike.md
 */

/** Entity ID — reuses existing DevAC entity_id format ({repo}:{package_path}:{kind}:{scope_hash}) */
export type EntityId = string;

/** Attribute — namespaced string (e.g., ":node/name", ":edge/CALLS", ":effect/FunctionCall") */
export type Attribute = string;

/** Values stored in datoms — primitives, arrays, or structured objects */
export type DatomValue = string | number | boolean | null | string[] | Record<string, unknown>;

/** Transaction ID — monotonic counter for the spike */
export type TxId = number;

/** Operation — assert adds a fact, retract removes it */
export type DatomOp = "assert" | "retract";

/** The core datom tuple — an immutable fact */
export interface Datom {
  readonly e: EntityId;
  readonly a: Attribute;
  readonly v: DatomValue;
  readonly tx: TxId;
  readonly op: DatomOp;
}

/** Entity-centric view — all attributes for a single entity */
export interface EntityView {
  readonly id: EntityId;
  readonly attrs: ReadonlyMap<Attribute, DatomValue[]>;

  /** Get first value of attribute (convenience for single-valued attrs) */
  get(attr: Attribute): DatomValue | undefined;

  /** Get all values for a multi-valued attribute */
  getAll(attr: Attribute): DatomValue[];

  /** Check if entity has a given attribute */
  has(attr: Attribute): boolean;
}

/** Structured value for edge datoms */
export interface EdgeDatomValue {
  readonly target: EntityId;
  readonly sourceFile: string;
  readonly sourceLine: number;
  readonly sourceColumn: number;
  readonly properties: Record<string, unknown>;
}

/** Structured value for external ref datoms */
export interface ExternalRefDatomValue {
  readonly moduleSpecifier: string;
  readonly importedSymbol: string;
  readonly localAlias: string | null;
  readonly importStyle: string;
  readonly isTypeOnly: boolean;
  readonly targetEntityId: string | null;
  readonly isResolved: boolean;
  readonly isReexport: boolean;
  readonly exportAlias: string | null;
  readonly sourceFile: string;
  readonly sourceLine: number;
  readonly sourceColumn: number;
}

/** DatomStore interface — the primary query API */
export interface DatomStore {
  // --- EAVT: "everything about entity X" ---
  get(entity: EntityId): EntityView | undefined;
  getAttribute(entity: EntityId, attr: Attribute): DatomValue[];

  // --- AEVT: "find entities with attribute" ---
  findByAttribute(attr: Attribute, value?: DatomValue): EntityId[];

  // --- AVET: "search by value" ---
  findByValue(attr: Attribute, value: DatomValue): EntityId[];

  // --- VAET: "reverse references" ---
  reverseRefs(target: EntityId, attr?: Attribute): EntityId[];

  // --- Convenience ---
  callers(entity: EntityId): EntityView[];
  callees(entity: EntityId): EntityView[];

  // --- Transitive traversal ---
  transitiveDeps(entity: EntityId, attr: Attribute, depth: number): EntityView[];

  // --- Mutation ---
  assertDatom(datom: Datom): void;
  assertDatoms(datoms: Datom[]): void;

  // --- Stats ---
  entityCount(): number;
  datomCount(): number;
}

/** Result of loading data into a DatomStore */
export interface LoadResult {
  entityCount: number;
  datomCount: number;
  loadTimeMs: number;
  nodesDatomCount: number;
  edgesDatomCount: number;
  effectsDatomCount: number;
  externalRefsDatomCount: number;
}

/** Benchmark measurement result */
export interface BenchmarkResult {
  entityCount: number;
  datomCount: number;
  memoryBytes: number;
  memoryPerEntity: number;
  indexBuildTimeMs: number;
  lookupLatency: {
    eavtMedianUs: number;
    eavtP99Us: number;
    avetMedianUs: number;
    avetP99Us: number;
    vaetMedianUs: number;
    vaetP99Us: number;
  };
}
