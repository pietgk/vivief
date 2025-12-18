/**
 * Sample TypeScript file for testing advanced type parsing
 * Tests: intersection types, union types, literal types, const assertions,
 *        satisfies operator, discriminated unions, type guards
 */

// =============================================================================
// Literal Types
// =============================================================================

/**
 * String literal type
 */
export type Direction = "north" | "south" | "east" | "west";

/**
 * Numeric literal type
 */
export type DiceRoll = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Boolean literal type
 */
export type True = true;
export type False = false;

/**
 * Template literal types
 */
export type EventType = "click" | "hover" | "focus";
export type EventHandler = `on${Capitalize<EventType>}`;

/**
 * Const assertion for literal inference
 */
export const colors = ["red", "green", "blue"] as const;
export type Color = (typeof colors)[number];

export const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3,
} as const;

export type Config = typeof config;

// =============================================================================
// Union Types
// =============================================================================

/**
 * Simple union
 */
export type StringOrNumber = string | number;

/**
 * Union with null/undefined
 */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

/**
 * Union of object types
 */
export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Discriminated union with literal discriminant
 */
export type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

/**
 * Complex discriminated union
 */
export type Action =
  | { type: "INCREMENT" }
  | { type: "DECREMENT" }
  | { type: "SET"; payload: number }
  | { type: "RESET" };

// =============================================================================
// Intersection Types
// =============================================================================

/**
 * Basic intersection
 */
export interface Named {
  name: string;
}

export interface Aged {
  age: number;
}

export type Person = Named & Aged;

/**
 * Intersection with additional properties
 */
export type Employee = Person & {
  employeeId: string;
  department: string;
};

/**
 * Intersection utility
 */
export type Merge<T, U> = T & U;

/**
 * Intersection with Omit
 */
export type Override<T, U> = Omit<T, keyof U> & U;

// =============================================================================
// Index Types and Index Signatures
// =============================================================================

/**
 * Index signature
 */
export interface StringMap {
  [key: string]: string;
}

/**
 * Index signature with specific keys
 */
export interface MixedMap {
  [key: string]: unknown;
  id: string;
  name: string;
}

/**
 * Symbol index signature
 */
export interface SymbolKeyed {
  [key: symbol]: number;
}

/**
 * Template literal index signature
 */
export interface DataAttributes {
  [key: `data-${string}`]: string;
}

// =============================================================================
// Type Guards and Narrowing
// =============================================================================

/**
 * User-defined type guard
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Type guard for discriminated union
 */
export function isCircle(shape: Shape): shape is { kind: "circle"; radius: number } {
  return shape.kind === "circle";
}

/**
 * Assertion function
 */
export function assertNonNull<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error("Value is null or undefined");
  }
}

/**
 * Type guard class
 */
export class TypeGuards {
  static isArray<T>(value: unknown): value is T[] {
    return Array.isArray(value);
  }

  static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  static hasProperty<T extends object, K extends PropertyKey>(
    obj: T,
    key: K
  ): obj is T & Record<K, unknown> {
    return key in obj;
  }
}

// =============================================================================
// Satisfies Operator (TS 4.9+)
// =============================================================================

/**
 * satisfies for type checking without widening
 */
export const routes = {
  home: "/",
  about: "/about",
  users: "/users",
  userDetail: "/users/:id",
} satisfies Record<string, string>;

/**
 * satisfies with complex types
 */
export interface RouteConfig {
  path: string;
  component: string;
  exact?: boolean;
}

export const routeConfigs = [
  { path: "/", component: "Home", exact: true },
  { path: "/about", component: "About" },
  { path: "/users", component: "Users" },
] satisfies RouteConfig[];

// =============================================================================
// Branded/Nominal Types
// =============================================================================

/**
 * Branded type for type safety
 */
declare const brand: unique symbol;

export type Brand<T, B> = T & { [brand]: B };

export type UserId = Brand<string, "UserId">;
export type PostId = Brand<string, "PostId">;
export type Email = Brand<string, "Email">;

/**
 * Functions using branded types
 */
export function createUserId(id: string): UserId {
  return id as UserId;
}

export function getUserById(id: UserId): { id: UserId; name: string } {
  return { id, name: "User" };
}

// =============================================================================
// Utility Type Combinations
// =============================================================================

/**
 * Complex utility type
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Mutable version of a type
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Optional properties become required, required become optional
 */
export type Flip<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]-?: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? never : K]?: T[K];
};

/**
 * Extract only function properties
 */
export type FunctionProperties<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

/**
 * Extract non-function properties
 */
export type DataProperties<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

// =============================================================================
// Tuple Types
// =============================================================================

/**
 * Fixed-length tuple
 */
export type Point2D = [number, number];
export type Point3D = [number, number, number];

/**
 * Labeled tuple elements (TS 4.0+)
 */
export type NamedPoint = [x: number, y: number, z?: number];

/**
 * Rest elements in tuples
 */
export type StringNumberPairs = [string, ...number[]];
export type Padded = [...string[], number];

/**
 * Variadic tuple types (TS 4.0+)
 */
export type Concat<T extends unknown[], U extends unknown[]> = [...T, ...U];

// =============================================================================
// ThisType Utility
// =============================================================================

/**
 * Object with methods that use this
 */
export interface Counter {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export type CounterMethods = ThisType<Counter>;

export const counterMethods: CounterMethods = {
  increment() {
    this.count++;
  },
  decrement() {
    this.count--;
  },
  reset() {
    this.count = 0;
  },
};

// =============================================================================
// Complex Real-World Types
// =============================================================================

/**
 * API response type
 */
export type ApiResponse<T> =
  | { status: "loading" }
  | { status: "success"; data: T; timestamp: number }
  | { status: "error"; error: string; code: number };

/**
 * State machine type
 */
export type FetchState<T> =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  | { state: "success"; data: T; loadedAt: number }
  | { state: "error"; error: Error; failedAt: number };

/**
 * Builder pattern type
 */
export type Builder<T, Keys extends keyof T = never> = {
  [K in Exclude<keyof T, Keys>]: (value: T[K]) => Builder<T, Keys | K>;
} & (Keys extends keyof T ? { build(): T } : {});

/**
 * Event emitter type
 */
export type EventMap = {
  connect: [];
  disconnect: [reason: string];
  message: [data: unknown, sender: string];
  error: [error: Error];
};

export type EventHandler<E extends keyof EventMap> = (...args: EventMap[E]) => void;

// Default export
export default Shape;
