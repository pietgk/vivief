/**
 * Sample TypeScript file for testing namespace, module, and declaration patterns.
 * This file covers:
 * - Namespace declarations
 * - Module augmentation
 * - Declaration merging
 * - Ambient declarations
 * - Re-exports with renaming
 * - Module patterns
 */

// ============================================================================
// NAMESPACE DECLARATIONS
// ============================================================================

/**
 * Basic namespace with nested members
 */
export namespace Geometry {
  export interface Point {
    x: number;
    y: number;
  }

  export interface Size {
    width: number;
    height: number;
  }

  export class Rectangle {
    constructor(
      public origin: Point,
      public size: Size
    ) {}

    get area(): number {
      return this.size.width * this.size.height;
    }

    contains(point: Point): boolean {
      return (
        point.x >= this.origin.x &&
        point.x <= this.origin.x + this.size.width &&
        point.y >= this.origin.y &&
        point.y <= this.origin.y + this.size.height
      );
    }
  }

  export function distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  export const ORIGIN: Point = { x: 0, y: 0 };
}

/**
 * Nested namespaces
 */
export namespace Company {
  export namespace Engineering {
    export namespace Backend {
      export interface Service {
        name: string;
        port: number;
        healthCheck(): Promise<boolean>;
      }

      export class ApiService implements Service {
        constructor(
          public name: string,
          public port: number
        ) {}

        async healthCheck(): Promise<boolean> {
          return true;
        }
      }
    }

    export namespace Frontend {
      export interface Component {
        render(): string;
      }

      export class Button implements Component {
        constructor(private label: string) {}

        render(): string {
          return `<button>${this.label}</button>`;
        }
      }
    }
  }

  export namespace HR {
    export interface Employee {
      id: number;
      name: string;
      department: string;
    }
  }
}

// ============================================================================
// DECLARATION MERGING
// ============================================================================

/**
 * Interface merging - multiple declarations merge together
 */
export interface MergedInterface {
  name: string;
  id: number;
}

export interface MergedInterface {
  email: string;
  createdAt: Date;
}

export interface MergedInterface {
  updateProfile(data: Partial<MergedInterface>): void;
}

/**
 * Namespace and class merging
 */
export class Album {
  constructor(
    public title: string,
    public artist: string
  ) {}
}

export namespace Album {
  export interface Track {
    name: string;
    duration: number;
  }

  export function create(title: string, artist: string): Album {
    return new Album(title, artist);
  }

  export const DEFAULT_ARTIST = "Unknown Artist";
}

/**
 * Namespace and function merging
 */
export function buildUrl(path: string): string {
  return `${buildUrl.baseUrl}/${path}`;
}

export namespace buildUrl {
  export let baseUrl = "https://api.example.com";

  export function withQuery(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    return `${buildUrl(path)}?${query}`;
  }
}

/**
 * Enum and namespace merging
 */
export enum Color {
  Red = "RED",
  Green = "GREEN",
  Blue = "BLUE",
}

export namespace Color {
  export function parse(value: string): Color | undefined {
    const normalized = value.toUpperCase();
    if (normalized === "RED") return Color.Red;
    if (normalized === "GREEN") return Color.Green;
    if (normalized === "BLUE") return Color.Blue;
    return undefined;
  }

  export function toHex(color: Color): string {
    switch (color) {
      case Color.Red:
        return "#FF0000";
      case Color.Green:
        return "#00FF00";
      case Color.Blue:
        return "#0000FF";
    }
  }
}

// ============================================================================
// MODULE AUGMENTATION
// ============================================================================

/**
 * Augmenting a local module (simulated)
 */
declare module "./sample-class" {
  interface UserService {
    additionalMethod(): void;
  }
}

/**
 * Augmenting global scope
 */
declare global {
  interface Window {
    customProperty: string;
    customMethod(): void;
  }

  interface Array<T> {
    customArrayMethod(): T[];
  }

  namespace NodeJS {
    interface ProcessEnv {
      CUSTOM_ENV_VAR: string;
    }
  }
}

// ============================================================================
// AMBIENT DECLARATIONS
// ============================================================================

/**
 * Ambient variable declarations
 */
declare const GLOBAL_CONFIG: {
  apiUrl: string;
  timeout: number;
};

declare let mutableGlobal: string;

declare function globalHelper(input: string): string;

/**
 * Ambient class declaration
 */
declare class ExternalLibrary {
  constructor(options: { key: string });
  initialize(): Promise<void>;
  getData<T>(): T;
}

/**
 * Ambient namespace
 */
declare namespace ExternalSDK {
  interface Config {
    apiKey: string;
    region: string;
  }

  function init(config: Config): void;
  function send(data: unknown): Promise<void>;

  class Client {
    constructor(config: Config);
    connect(): Promise<void>;
    disconnect(): void;
  }
}

/**
 * Ambient module declaration
 */
declare module "untyped-library" {
  export function doSomething(input: string): number;
  export const VERSION: string;

  export interface LibraryOptions {
    debug?: boolean;
    timeout?: number;
  }

  export default class Library {
    constructor(options?: LibraryOptions);
    run(): void;
  }
}

/**
 * Wildcard module declaration
 */
declare module "*.svg" {
  const content: React.FC<React.SVGProps<SVGSVGElement>>;
  export default content;
}

declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "*.json" {
  const value: unknown;
  export default value;
}

// ============================================================================
// RE-EXPORTS WITH RENAMING
// ============================================================================

/**
 * Named re-exports (simulated - actual imports would need real files)
 */
// export { UserService as User } from "./sample-class";
// export { default as DefaultClass } from "./sample-class";

/**
 * Export all with rename
 */
// export * as ClassExports from "./sample-class";
// export * as FunctionExports from "./sample-function";

/**
 * Local definitions for re-export testing
 */
const internalValue = 42;
const anotherValue = "hello";

export { internalValue as publicValue, anotherValue as greeting };

class InternalClass {
  getValue(): number {
    return 1;
  }
}

export { InternalClass as ExportedClass };

type InternalType = {
  x: number;
  y: number;
};

export type { InternalType as Point2D };

interface InternalInterface {
  id: string;
}

export type { InternalInterface as Identifiable };

// ============================================================================
// COMPLEX MODULE PATTERNS
// ============================================================================

/**
 * Barrel exports pattern (index.ts style)
 */
export const ModuleA = {
  name: "ModuleA",
  version: 1,
};

export const ModuleB = {
  name: "ModuleB",
  version: 2,
};

export const ModuleC = {
  name: "ModuleC",
  version: 3,
};

/**
 * Factory module pattern
 */
export namespace Factory {
  export type CreateFn<T> = () => T;
  export type ConfigureFn<T, C> = (config: C) => T;

  export interface Module<T> {
    create: CreateFn<T>;
    instance?: T;
  }

  export function createModule<T>(create: CreateFn<T>): Module<T> {
    return { create };
  }

  export function singleton<T>(create: CreateFn<T>): Module<T> {
    const module: Module<T> = {
      create: () => {
        if (!module.instance) {
          module.instance = create();
        }
        return module.instance;
      },
    };
    return module;
  }
}

/**
 * Plugin system pattern
 */
export interface Plugin {
  name: string;
  version: string;
  install(app: Application): void;
}

export interface Application {
  use(plugin: Plugin): this;
  plugins: Map<string, Plugin>;
}

export function createApplication(): Application {
  const app: Application = {
    plugins: new Map(),
    use(plugin: Plugin) {
      this.plugins.set(plugin.name, plugin);
      plugin.install(this);
      return this;
    },
  };
  return app;
}

/**
 * Conditional exports pattern
 */
export const isNode = typeof process !== "undefined" && process.versions?.node;
export const isBrowser = typeof window !== "undefined";

export const platformSpecific = isNode
  ? { platform: "node" as const, features: ["fs", "http", "crypto"] }
  : { platform: "browser" as const, features: ["dom", "fetch", "storage"] };

// ============================================================================
// NAMESPACE AS TYPE
// ============================================================================

/**
 * Using namespace as a type
 */
export namespace Config {
  export interface Database {
    host: string;
    port: number;
    name: string;
  }

  export interface Server {
    port: number;
    cors: boolean;
  }

  export interface Full {
    database: Database;
    server: Server;
  }
}

export function loadConfig(): Config.Full {
  return {
    database: {
      host: "localhost",
      port: 5432,
      name: "mydb",
    },
    server: {
      port: 3000,
      cors: true,
    },
  };
}

// Required for module augmentation to work
export {};
