/**
 * Sample TypeScript file for testing generic type parsing
 * Tests: generic classes, functions, interfaces, constraints,
 *        conditional types, mapped types, infer keyword
 */

// =============================================================================
// Basic Generic Types
// =============================================================================

/**
 * Generic interface
 */
export interface Container<T> {
  value: T;
  getValue(): T;
  setValue(value: T): void;
}

/**
 * Generic class implementing generic interface
 */
export class Box<T> implements Container<T> {
  constructor(public value: T) {}

  getValue(): T {
    return this.value;
  }

  setValue(value: T): void {
    this.value = value;
  }
}

/**
 * Generic function
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * Generic arrow function
 */
export const reverseArray = <T>(arr: T[]): T[] => {
  return [...arr].reverse();
};

// =============================================================================
// Multiple Type Parameters
// =============================================================================

/**
 * Interface with multiple type parameters
 */
export interface Pair<K, V> {
  key: K;
  value: V;
}

/**
 * Class with multiple type parameters
 */
export class Dictionary<K extends string | number, V> {
  private items: Map<K, V> = new Map();

  set(key: K, value: V): void {
    this.items.set(key, value);
  }

  get(key: K): V | undefined {
    return this.items.get(key);
  }

  entries(): Array<Pair<K, V>> {
    return Array.from(this.items.entries()).map(([key, value]) => ({
      key,
      value,
    }));
  }
}

/**
 * Function with multiple type parameters
 */
export function zip<T, U>(arr1: T[], arr2: U[]): Array<[T, U]> {
  const length = Math.min(arr1.length, arr2.length);
  const result: Array<[T, U]> = [];
  for (let i = 0; i < length; i++) {
    result.push([arr1[i], arr2[i]]);
  }
  return result;
}

// =============================================================================
// Generic Constraints
// =============================================================================

/**
 * Interface for constraint
 */
export interface Lengthwise {
  length: number;
}

/**
 * Function with extends constraint
 */
export function logLength<T extends Lengthwise>(value: T): number {
  console.log(value.length);
  return value.length;
}

/**
 * Function with keyof constraint
 */
export function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

/**
 * Class with constrained type parameter
 */
export class Repository<T extends { id: string | number }> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  findById(id: T["id"]): T | undefined {
    return this.items.find((item) => item.id === id);
  }

  removeById(id: T["id"]): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }
}

/**
 * Generic with multiple constraints
 */
export function merge<T extends object, U extends object>(obj1: T, obj2: U): T & U {
  return { ...obj1, ...obj2 };
}

// =============================================================================
// Conditional Types
// =============================================================================

/**
 * Basic conditional type
 */
export type IsString<T> = T extends string ? true : false;

/**
 * Conditional type with union distribution
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Extract and Exclude utility types
 */
export type Extract<T, U> = T extends U ? T : never;
export type Exclude<T, U> = T extends U ? never : T;

/**
 * Conditional type with infer
 */
export type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

/**
 * Extract function parameter types
 */
export type Parameters<T> = T extends (...args: infer P) => any ? P : never;

/**
 * Extract array element type
 */
export type ArrayElement<T> = T extends (infer E)[] ? E : never;

/**
 * Extract Promise resolution type
 */
export type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T;

/**
 * Nested conditional types
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// =============================================================================
// Mapped Types
// =============================================================================

/**
 * Basic mapped type - make all properties optional
 */
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

/**
 * Make all properties required
 */
export type Required<T> = {
  [P in keyof T]-?: T[P];
};

/**
 * Make all properties readonly
 */
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

/**
 * Pick specific properties
 */
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

/**
 * Omit specific properties
 */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Record utility type
 */
export type Record<K extends keyof any, V> = {
  [P in K]: V;
};

/**
 * Mapped type with key remapping (TS 4.1+)
 */
export type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

/**
 * Filter properties by type
 */
export type FilterByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

// =============================================================================
// Template Literal Types
// =============================================================================

/**
 * Basic template literal type
 */
export type EventName = `on${Capitalize<"click" | "focus" | "blur">}`;

/**
 * Template literal with multiple unions
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type ApiPath = "/users" | "/posts" | "/comments";
export type ApiEndpoint = `${HttpMethod} ${ApiPath}`;

/**
 * Template literal with mapped types
 */
export type PropEventHandlers<T> = {
  [K in keyof T as `on${Capitalize<string & K>}Change`]: (value: T[K]) => void;
};

// =============================================================================
// Recursive Types
// =============================================================================

/**
 * Recursive type for JSON values
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Recursive type for tree structure
 */
export interface TreeNode<T> {
  value: T;
  children: TreeNode<T>[];
}

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Path type for nested object access
 */
export type Path<T, Key extends keyof T = keyof T> = Key extends string
  ? T[Key] extends object
    ? `${Key}.${Path<T[Key]>}` | Key
    : Key
  : never;

// =============================================================================
// Variance Annotations (TS 4.7+)
// =============================================================================

/**
 * Covariant type parameter (out)
 */
export interface Producer<out T> {
  produce(): T;
}

/**
 * Contravariant type parameter (in)
 */
export interface Consumer<in T> {
  consume(value: T): void;
}

/**
 * Invariant type parameter (in out)
 */
export interface Processor<in out T> {
  process(value: T): T;
}

// =============================================================================
// Generic Classes with Static Members
// =============================================================================

/**
 * Generic class with static factory
 */
export class Result<T, E extends Error = Error> {
  private constructor(
    private readonly value: T | null,
    private readonly error: E | null
  ) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result(value, null);
  }

  static err<E extends Error>(error: E): Result<never, E> {
    return new Result(null, error);
  }

  isOk(): this is Result<T, never> {
    return this.error === null;
  }

  isErr(): this is Result<never, E> {
    return this.error !== null;
  }

  unwrap(): T {
    if (this.error) throw this.error;
    return this.value!;
  }

  unwrapErr(): E {
    if (this.value !== null) throw new Error("Called unwrapErr on Ok value");
    return this.error!;
  }
}

// =============================================================================
// Higher-Kinded Types Pattern
// =============================================================================

/**
 * Functor-like interface
 */
export interface Mappable<F> {
  map<A, B>(fa: F, f: (a: A) => B): F;
}

/**
 * Generic utility functions
 */
export function pipe<A, B>(value: A, fn: (a: A) => B): B;
export function pipe<A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function pipe<A, B, C, D>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D
): D;
export function pipe(value: any, ...fns: Array<(x: any) => any>): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}

// Default export
export default Box;
