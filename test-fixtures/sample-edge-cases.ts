/**
 * Sample TypeScript file for testing edge cases and modern TypeScript features.
 * This file covers:
 * - Private class fields (#)
 * - Static blocks
 * - satisfies operator
 * - using declarations (TC39 proposal)
 * - Computed property names
 * - Symbol types
 * - Template literal types
 * - Override keyword
 * - Abstract classes and members
 * - Accessor keyword (auto-accessor)
 * - Import assertions/attributes
 * - Const type parameters
 */

// ============================================================================
// PRIVATE CLASS FIELDS
// ============================================================================

/**
 * Class with private fields using # syntax
 */
export class SecureContainer {
  // Private fields
  #secretValue: string;
  #counter: number = 0;
  readonly #immutableSecret: string;

  // Private static field
  static #instanceCount = 0;

  constructor(secret: string) {
    this.#secretValue = secret;
    this.#immutableSecret = `immutable-${secret}`;
    SecureContainer.#instanceCount++;
  }

  // Private method
  #encrypt(value: string): string {
    return Buffer.from(value).toString("base64");
  }

  #decrypt(value: string): string {
    return Buffer.from(value, "base64").toString("utf-8");
  }

  // Public methods accessing private fields
  getEncryptedSecret(): string {
    return this.#encrypt(this.#secretValue);
  }

  updateSecret(newSecret: string): void {
    this.#secretValue = newSecret;
    this.#counter++;
  }

  getAccessCount(): number {
    return this.#counter;
  }

  static getInstanceCount(): number {
    return SecureContainer.#instanceCount;
  }

  // Private getter/setter
  get #internalValue(): string {
    return this.#secretValue;
  }

  set #internalValue(value: string) {
    this.#secretValue = value;
  }
}

/**
 * Derived class cannot access parent's private fields
 */
export class ExtendedContainer extends SecureContainer {
  #childSecret: string;

  constructor(parentSecret: string, childSecret: string) {
    super(parentSecret);
    this.#childSecret = childSecret;
  }

  getChildSecret(): string {
    return this.#childSecret;
  }
}

// ============================================================================
// STATIC BLOCKS
// ============================================================================

/**
 * Class with static initialization blocks
 */
export class DatabaseConnection {
  static connectionPool: Map<string, DatabaseConnection>;
  static defaultConfig: { host: string; port: number };
  static #privateStaticField: string;

  // Static block for complex initialization
  static {
    this.connectionPool = new Map();
    this.defaultConfig = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
    };
    this.#privateStaticField = "initialized";
    console.log("DatabaseConnection class initialized");
  }

  // Multiple static blocks are allowed
  static {
    // Additional initialization logic
    if (process.env.NODE_ENV === "development") {
      this.defaultConfig.host = "localhost";
    }
  }

  #connection: unknown;

  constructor(
    private host: string,
    private port: number
  ) {}

  static create(name: string): DatabaseConnection {
    if (!this.connectionPool.has(name)) {
      const conn = new DatabaseConnection(this.defaultConfig.host, this.defaultConfig.port);
      this.connectionPool.set(name, conn);
    }
    return this.connectionPool.get(name)!;
  }
}

/**
 * Static blocks with error handling
 */
export class ConfigLoader {
  static config: Record<string, unknown>;
  static loadError: Error | null = null;

  static {
    try {
      // Simulated config loading
      this.config = {
        loaded: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.loadError = error instanceof Error ? error : new Error(String(error));
      this.config = {};
    }
  }
}

// ============================================================================
// SATISFIES OPERATOR
// ============================================================================

/**
 * Using satisfies for type checking without widening
 */
type ColorConfig = Record<string, [number, number, number]>;

export const colors = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  // TypeScript knows this is specifically [255, 165, 0], not number[]
  orange: [255, 165, 0],
} satisfies ColorConfig;

// Access specific tuple - type is preserved as [number, number, number]
export const redColor = colors.red;

/**
 * Satisfies with complex types
 */
type Routes = Record<
  string,
  {
    path: string;
    component: string;
    auth?: boolean;
  }
>;

export const appRoutes = {
  home: { path: "/", component: "HomePage" },
  about: { path: "/about", component: "AboutPage" },
  dashboard: { path: "/dashboard", component: "DashboardPage", auth: true },
  // Specific keys are preserved
  settings: { path: "/settings", component: "SettingsPage", auth: true },
} satisfies Routes;

/**
 * Satisfies with union types
 */
type Status = "pending" | "active" | "completed" | "failed";
type StatusConfig = Record<Status, { label: string; color: string }>;

export const statusConfig = {
  pending: { label: "Pending", color: "yellow" },
  active: { label: "Active", color: "green" },
  completed: { label: "Completed", color: "blue" },
  failed: { label: "Failed", color: "red" },
} satisfies StatusConfig;

/**
 * Satisfies with readonly
 */
export const frozenConfig = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3,
} as const satisfies Record<string, string | number>;

// ============================================================================
// USING DECLARATIONS (Resource Management)
// ============================================================================

/**
 * Disposable interface implementation
 */
export class FileHandle implements Disposable {
  #closed = false;
  #path: string;

  constructor(path: string) {
    this.#path = path;
    console.log(`Opening file: ${path}`);
  }

  read(): string {
    if (this.#closed) throw new Error("File is closed");
    return `Content of ${this.#path}`;
  }

  write(content: string): void {
    if (this.#closed) throw new Error("File is closed");
    console.log(`Writing to ${this.#path}: ${content}`);
  }

  [Symbol.dispose](): void {
    if (!this.#closed) {
      this.#closed = true;
      console.log(`Closing file: ${this.#path}`);
    }
  }
}

/**
 * AsyncDisposable implementation
 */
export class AsyncConnection implements AsyncDisposable {
  #connected = false;

  async connect(): Promise<void> {
    this.#connected = true;
    console.log("Connected");
  }

  async query(sql: string): Promise<unknown[]> {
    if (!this.#connected) throw new Error("Not connected");
    return [{ sql }];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#connected) {
      this.#connected = false;
      console.log("Disconnected");
    }
  }
}

/**
 * Using declarations in functions
 */
export function processFile(path: string): string {
  using file = new FileHandle(path);
  return file.read();
  // file is automatically disposed when function exits
}

export async function runQuery(sql: string): Promise<unknown[]> {
  await using connection = new AsyncConnection();
  await connection.connect();
  return await connection.query(sql);
  // connection is automatically disposed when function exits
}

// ============================================================================
// COMPUTED PROPERTY NAMES
// ============================================================================

const dynamicKey = "dynamicProperty";
const symbolKey = Symbol("symbolProperty");
const computedMethod = "compute";

/**
 * Class with computed property names
 */
export class DynamicClass {
  [dynamicKey]: string = "dynamic value";
  [symbolKey]: number = 42;

  ["literal-key"]: boolean = true;
  [`template-${dynamicKey}`]: string = "template computed";

  [computedMethod + "Value"](): number {
    return this[symbolKey];
  }

  ["get" + "Data"](): string {
    return this[dynamicKey];
  }
}

/**
 * Object with computed properties
 */
export const dynamicObject = {
  [dynamicKey]: "value1",
  [symbolKey]: "value2",
  ["prefix-" + dynamicKey]: "value3",
  [`template-${dynamicKey}`]: "value4",
  [1 + 2]: "value5",
};

// ============================================================================
// SYMBOL TYPES
// ============================================================================

/**
 * Unique symbol types
 */
declare const brandSymbol: unique symbol;

export type BrandedId = string & { readonly [brandSymbol]: "BrandedId" };

export function createBrandedId(value: string): BrandedId {
  return value as BrandedId;
}

/**
 * Well-known symbols
 */
export class CustomIterator implements Iterable<number> {
  #values: number[];

  constructor(values: number[]) {
    this.#values = values;
  }

  *[Symbol.iterator](): Iterator<number> {
    for (const value of this.#values) {
      yield value;
    }
  }

  get [Symbol.toStringTag](): string {
    return "CustomIterator";
  }

  [Symbol.toPrimitive](hint: string): string | number {
    if (hint === "number") {
      return this.#values.length;
    }
    return `CustomIterator(${this.#values.length})`;
  }
}

/**
 * Symbol as property key
 */
export const ID_SYMBOL = Symbol("id");
export const NAME_SYMBOL = Symbol("name");

export interface SymbolKeyed {
  [ID_SYMBOL]: number;
  [NAME_SYMBOL]: string;
  regularProperty: boolean;
}

// ============================================================================
// TEMPLATE LITERAL TYPES
// ============================================================================

/**
 * Template literal type definitions
 */
export type EventName<T extends string> = `on${Capitalize<T>}`;
export type Getter<T extends string> = `get${Capitalize<T>}`;
export type Setter<T extends string> = `set${Capitalize<T>}`;

export type CSSValue<T extends string> = `${T}px` | `${T}em` | `${T}rem` | `${T}%`;

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type APIEndpoint<M extends HTTPMethod, P extends string> = `${M} ${P}`;

/**
 * Using template literal types
 */
export interface EventHandlers {
  onClick: () => void;
  onHover: () => void;
  onFocus: () => void;
}

export type AccessorMethods<T> = {
  [K in keyof T as Getter<string & K>]: () => T[K];
} & {
  [K in keyof T as Setter<string & K>]: (value: T[K]) => void;
};

export interface User {
  name: string;
  age: number;
}

// Type would be: { getName: () => string; getAge: () => number; setName: (value: string) => void; setAge: (value: number) => void; }
export type UserAccessors = AccessorMethods<User>;

// ============================================================================
// OVERRIDE KEYWORD
// ============================================================================

/**
 * Base class for override testing
 */
export abstract class BaseController {
  abstract handleRequest(req: unknown): Promise<unknown>;

  validate(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  protected log(message: string): void {
    console.log(`[${this.constructor.name}] ${message}`);
  }
}

/**
 * Derived class with override keyword
 */
export class UserController extends BaseController {
  override async handleRequest(req: unknown): Promise<{ user: string }> {
    this.log("Handling user request");
    return { user: "data" };
  }

  override validate(data: unknown): boolean {
    if (!super.validate(data)) return false;
    return typeof data === "object";
  }

  override protected log(message: string): void {
    console.log(`[USER] ${message}`);
  }
}

// ============================================================================
// ABSTRACT CLASSES AND MEMBERS
// ============================================================================

/**
 * Abstract class with various abstract members
 */
export abstract class Shape {
  abstract readonly name: string;
  abstract get area(): number;
  abstract get perimeter(): number;

  abstract draw(context: unknown): void;
  abstract clone(): Shape;

  // Concrete members
  protected color: string = "black";

  setColor(color: string): void {
    this.color = color;
  }

  describe(): string {
    return `${this.name} with area ${this.area}`;
  }
}

/**
 * Concrete implementation
 */
export class Circle extends Shape {
  readonly name = "Circle";

  constructor(private radius: number) {
    super();
  }

  get area(): number {
    return Math.PI * this.radius * this.radius;
  }

  get perimeter(): number {
    return 2 * Math.PI * this.radius;
  }

  draw(context: unknown): void {
    console.log(`Drawing circle with radius ${this.radius}`);
  }

  clone(): Circle {
    const circle = new Circle(this.radius);
    circle.setColor(this.color);
    return circle;
  }
}

// ============================================================================
// CONST TYPE PARAMETERS
// ============================================================================

/**
 * Function with const type parameter
 */
export function createTuple<const T extends readonly unknown[]>(items: T): T {
  return items;
}

// Usage - type is preserved as readonly ["a", "b", "c"]
export const tuple = createTuple(["a", "b", "c"] as const);

/**
 * Generic class with const type parameter
 */
export class ConstGeneric<const T extends readonly string[]> {
  constructor(private values: T) {}

  get first(): T[0] {
    return this.values[0];
  }

  includes<const U extends T[number]>(value: U): boolean {
    return this.values.includes(value);
  }
}

// ============================================================================
// ASSERTS AND TYPE PREDICATES
// ============================================================================

/**
 * Assertion functions
 */
export function assertIsDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Value must be defined");
  }
}

export function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError("Expected string");
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

/**
 * Type predicates
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}

// ============================================================================
// IMPORT ATTRIBUTES (formerly Import Assertions)
// ============================================================================

// Note: These are syntax examples - actual imports would need bundler support
// import data from "./data.json" with { type: "json" };
// import styles from "./styles.css" with { type: "css" };

/**
 * Dynamic import with attributes
 */
export async function loadJsonModule(path: string): Promise<unknown> {
  // const module = await import(path, { with: { type: "json" } });
  // return module.default;
  return { path };
}

// ============================================================================
// INFER IN CONDITIONAL TYPES
// ============================================================================

/**
 * Complex infer patterns
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

export type UnwrapArray<T> = T extends (infer U)[] ? U : T;

export type FirstArg<T> = T extends (first: infer F, ...args: unknown[]) => unknown ? F : never;

export type ReturnTypeAsync<T> = T extends (...args: unknown[]) => Promise<infer R> ? R : never;

export type ExtractRouteParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractRouteParams<Rest>
  : T extends `${string}:${infer Param}`
    ? Param
    : never;

// Type would be "userId" | "postId"
export type RouteParams = ExtractRouteParams<"/users/:userId/posts/:postId">;

// ============================================================================
// VARIANCE ANNOTATIONS
// ============================================================================

/**
 * Explicit variance with in/out keywords
 */
export interface Producer<out T> {
  produce(): T;
}

export interface Consumer<in T> {
  consume(value: T): void;
}

export interface Transformer<in I, out O> {
  transform(input: I): O;
}

export class StringProducer implements Producer<string> {
  produce(): string {
    return "produced";
  }
}

export class StringConsumer implements Consumer<string> {
  consume(value: string): void {
    console.log(value);
  }
}

// ============================================================================
// NOMINAL/BRANDED TYPES
// ============================================================================

declare const __brand: unique symbol;

export type Brand<T, B> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;
export type Email = Brand<string, "Email">;

export function createUserId(id: string): UserId {
  return id as UserId;
}

export function createOrderId(id: string): OrderId {
  return id as OrderId;
}

export function createEmail(email: string): Email {
  if (!email.includes("@")) {
    throw new Error("Invalid email");
  }
  return email as Email;
}

// These are type-incompatible despite both being strings
export function processUser(userId: UserId): void {
  console.log(`Processing user: ${userId}`);
}

export function processOrder(orderId: OrderId): void {
  console.log(`Processing order: ${orderId}`);
}
