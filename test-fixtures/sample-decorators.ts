/**
 * Sample TypeScript file for testing decorator parsing
 * Tests: class decorators, method decorators, property decorators,
 *        parameter decorators, decorator factories, multiple decorators
 */

// =============================================================================
// Decorator Definitions
// =============================================================================

/**
 * Simple class decorator
 */
function Component(target: Function) {
  console.log(`Component: ${target.name}`);
  return target;
}

/**
 * Class decorator factory with options
 */
function Injectable(options: { providedIn: "root" | "platform" | "any" }) {
  return function (target: Function) {
    Reflect.defineMetadata("injectable", options, target);
    return target;
  };
}

/**
 * Class decorator with metadata
 */
function Entity(tableName: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      __tableName = tableName;
    };
  };
}

/**
 * Method decorator for logging
 */
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with args:`, args);
    const result = originalMethod.apply(this, args);
    console.log(`${propertyKey} returned:`, result);
    return result;
  };
  return descriptor;
}

/**
 * Method decorator factory with options
 */
function Throttle(ms: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    let lastCall = 0;
    descriptor.value = function (...args: any[]) {
      const now = Date.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        return originalMethod.apply(this, args);
      }
    };
    return descriptor;
  };
}

/**
 * Async method decorator
 */
function CatchErrors(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    try {
      return await originalMethod.apply(this, args);
    } catch (error) {
      console.error(`Error in ${propertyKey}:`, error);
      throw error;
    }
  };
  return descriptor;
}

/**
 * Property decorator
 */
function Observable(target: any, propertyKey: string) {
  let value: any;
  const getter = () => value;
  const setter = (newValue: any) => {
    console.log(`Property ${propertyKey} changed to:`, newValue);
    value = newValue;
  };
  Object.defineProperty(target, propertyKey, {
    get: getter,
    set: setter,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Property decorator factory
 */
function Validate(validator: (value: any) => boolean) {
  return function (target: any, propertyKey: string) {
    let value: any;
    Object.defineProperty(target, propertyKey, {
      get: () => value,
      set: (newValue: any) => {
        if (!validator(newValue)) {
          throw new Error(`Invalid value for ${propertyKey}`);
        }
        value = newValue;
      },
      enumerable: true,
      configurable: true,
    });
  };
}

/**
 * Parameter decorator
 */
function Required(target: any, propertyKey: string, parameterIndex: number) {
  const requiredParams: number[] = Reflect.getMetadata("required", target, propertyKey) || [];
  requiredParams.push(parameterIndex);
  Reflect.defineMetadata("required", requiredParams, target, propertyKey);
}

/**
 * Accessor decorator
 */
function Memoize(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalGetter = descriptor.get;
  const memoKey = Symbol(`__memoized_${propertyKey}`);

  descriptor.get = function () {
    if (!(this as any)[memoKey]) {
      (this as any)[memoKey] = originalGetter?.call(this);
    }
    return (this as any)[memoKey];
  };

  return descriptor;
}

// =============================================================================
// Classes Using Decorators
// =============================================================================

/**
 * Class with single decorator
 */
@Component
export class SimpleComponent {
  name = "Simple";

  render() {
    return `<${this.name}/>`;
  }
}

/**
 * Class with decorator factory
 */
@Injectable({ providedIn: "root" })
export class UserService {
  private users: string[] = [];

  getUsers(): string[] {
    return this.users;
  }

  addUser(name: string): void {
    this.users.push(name);
  }
}

/**
 * Class with multiple decorators
 */
@Component
@Injectable({ providedIn: "root" })
@Entity("users")
export class UserComponent {
  @Observable
  currentUser: string | null = null;

  @Validate((v) => typeof v === "number" && v > 0)
  userId: number = 1;

  render() {
    return `User: ${this.currentUser}`;
  }
}

/**
 * Class with method decorators
 */
@Component
export class ApiService {
  @Log
  fetchData(url: string): Promise<any> {
    return fetch(url).then((r) => r.json());
  }

  @Throttle(1000)
  handleClick(): void {
    console.log("Clicked!");
  }

  @CatchErrors
  async riskyOperation(): Promise<void> {
    throw new Error("Something went wrong");
  }

  @Log
  @Throttle(500)
  combinedDecorators(value: number): number {
    return value * 2;
  }
}

/**
 * Class with parameter decorators
 */
export class ValidationService {
  validateUser(@Required name: string, @Required email: string, age?: number): boolean {
    return name.length > 0 && email.includes("@");
  }

  processData(@Required data: any): void {
    console.log("Processing:", data);
  }
}

/**
 * Class with accessor decorators
 */
export class ExpensiveCalculation {
  private data: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  @Memoize
  get sum(): number {
    console.log("Calculating sum...");
    return this.data.reduce((a, b) => a + b, 0);
  }

  @Memoize
  get average(): number {
    console.log("Calculating average...");
    return this.sum / this.data.length;
  }
}

/**
 * Abstract class with decorators
 */
@Component
export abstract class BaseController {
  @Log
  abstract handleRequest(req: any): Promise<any>;

  @Observable
  protected state: any = {};
}

/**
 * Concrete class extending decorated abstract
 */
@Injectable({ providedIn: "root" })
export class UserController extends BaseController {
  @Log
  async handleRequest(req: any): Promise<any> {
    return { user: "test" };
  }
}

// =============================================================================
// Decorator Composition Example
// =============================================================================

/**
 * Compose multiple decorators into one
 */
function compose(...decorators: MethodDecorator[]): MethodDecorator {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    return decorators.reduceRight((desc, decorator) => {
      return (decorator(target, propertyKey, desc) as PropertyDescriptor) || desc;
    }, descriptor);
  };
}

const LogAndThrottle = compose(Log, Throttle(1000));

export class ComposedDecoratorsExample {
  @LogAndThrottle
  heavyOperation(): void {
    console.log("Heavy operation executed");
  }
}

// Default export
export default UserService;
