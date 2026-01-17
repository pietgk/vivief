/**
 * Scoped Name Generator
 *
 * Generates stable scoped names for code symbols.
 * Based on DevAC v2.0 spec Section 4.5.
 *
 * Scoped names are used instead of line numbers to ensure entity IDs
 * remain stable when code above/below a symbol changes.
 */

/**
 * Scoped name generation context
 */
export interface ScopeContext {
  /** Parent scope names (e.g., ["ModuleName", "ClassName"]) */
  parentScopes: string[];
  /** Counters for anonymous functions at each call site */
  callbackCounters: Map<string, number>;
  /** Counters for reassigned variables */
  reassignmentCounters: Map<string, number>;
  /** Counters for IIFEs */
  iifeCounter: number;
  /** Counters for anonymous symbols by kind */
  anonymousCounters: Map<string, number>;
}

/**
 * Create a new scope context
 */
export function createScopeContext(): ScopeContext {
  return {
    parentScopes: [],
    callbackCounters: new Map(),
    reassignmentCounters: new Map(),
    iifeCounter: 0,
    anonymousCounters: new Map(),
  };
}

/**
 * Symbol information for scoped name generation
 */
export interface SymbolInfo {
  /** Symbol name (may be null for anonymous) */
  name: string | null;
  /** Symbol kind */
  kind: SymbolKind;
  /** Is this a top-level symbol? */
  isTopLevel: boolean;
  /** Parent symbol name (for class members, nested functions) */
  parentName?: string;
  /** For callbacks: the call expression name */
  callExpression?: string;
  /** For callbacks: argument index */
  argumentIndex?: number;
  /** For array elements: array name */
  arrayName?: string;
  /** For array elements: index */
  arrayIndex?: number;
  /** For computed properties: the key expression as string */
  computedKey?: string;
  /** Variable name if arrow function assigned to variable */
  variableName?: string;
  /** Is this an IIFE? */
  isIIFE?: boolean;
}

/**
 * Symbol kinds that affect scoped name generation
 */
export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "property"
  | "variable"
  | "arrow"
  | "callback"
  | "getter"
  | "setter"
  | "constructor"
  | "static_method"
  | "static_property"
  | "jsx_component"
  | "html_element";

/**
 * Generate a scoped name for a symbol
 *
 * Rules per spec Section 4.5:
 * - Top-level function/class: name only ("handleLogin")
 * - Class member: "ClassName.memberName"
 * - Nested function: "outer.inner"
 * - Arrow in variable: variable name ("fetchUser")
 * - Callback: "callExpr.$arg0", "users.map.$arg0"
 * - Array element: "arrayName.$0"
 * - Computed property: "ClassName.[keyExpr]"
 * - IIFE: "$iife_0"
 * - Reassigned: "varName$0", "varName$1"
 *
 * @param symbol - Symbol information
 * @param context - Current scope context
 * @returns Scoped name string
 */
export function generateScopedName(symbol: SymbolInfo, context: ScopeContext): string {
  // 1. IIFE
  if (symbol.isIIFE) {
    const index = context.iifeCounter++;
    return `$iife_${index}`;
  }

  // 2. Named top-level symbol
  if (symbol.isTopLevel && symbol.name) {
    return handleReassignment(symbol.name, context);
  }

  // 3. Class member (method, property, getter, setter)
  if (symbol.parentName && isClassMember(symbol.kind)) {
    const memberName = symbol.name ?? generateAnonymousName(symbol.kind, context);
    if (symbol.computedKey) {
      return `${symbol.parentName}.[${symbol.computedKey}]`;
    }
    return `${symbol.parentName}.${memberName}`;
  }

  // 4. Nested function with name
  if (symbol.parentName && symbol.name && symbol.kind === "function") {
    return `${symbol.parentName}.${symbol.name}`;
  }

  // 5. Arrow function assigned to variable
  if (symbol.kind === "arrow" && symbol.variableName) {
    return handleReassignment(symbol.variableName, context);
  }

  // 6. Callback/argument function
  if (symbol.callExpression !== undefined && symbol.argumentIndex !== undefined) {
    const callKey = symbol.callExpression;
    const argIndex = symbol.argumentIndex;
    return `${callKey}.$arg${argIndex}`;
  }

  // 7. Array element
  if (symbol.arrayName && symbol.arrayIndex !== undefined) {
    return `${symbol.arrayName}.$${symbol.arrayIndex}`;
  }

  // 8. Named symbol with parent scope
  if (symbol.name && context.parentScopes.length > 0) {
    const parentScope = context.parentScopes.join(".");
    return handleReassignment(`${parentScope}.${symbol.name}`, context);
  }

  // 9. Named symbol without parent
  if (symbol.name) {
    return handleReassignment(symbol.name, context);
  }

  // 10. Anonymous fallback
  return generateAnonymousName(symbol.kind, context);
}

/**
 * Check if a kind represents a class member
 */
function isClassMember(kind: SymbolKind): boolean {
  return [
    "method",
    "property",
    "getter",
    "setter",
    "constructor",
    "static_method",
    "static_property",
  ].includes(kind);
}

/**
 * Handle variable reassignment by appending index
 */
function handleReassignment(name: string, context: ScopeContext): string {
  const count = context.reassignmentCounters.get(name) ?? 0;
  context.reassignmentCounters.set(name, count + 1);

  if (count === 0) {
    return name;
  }
  return `${name}$${count}`;
}

/**
 * Generate a name for anonymous symbols
 */
function generateAnonymousName(kind: SymbolKind, context: ScopeContext): string {
  const count = context.anonymousCounters.get(kind) ?? 0;
  context.anonymousCounters.set(kind, count + 1);
  return `$anon_${kind}_${count}`;
}

/**
 * Push a scope onto the context
 */
export function pushScope(context: ScopeContext, scopeName: string): void {
  context.parentScopes.push(scopeName);
}

/**
 * Pop a scope from the context
 */
export function popScope(context: ScopeContext): string | undefined {
  return context.parentScopes.pop();
}

/**
 * Get the current scope path as a string
 */
export function getCurrentScopePath(context: ScopeContext): string {
  return context.parentScopes.join(".");
}

/**
 * Create a child scope context
 */
export function createChildContext(parent: ScopeContext, scopeName: string): ScopeContext {
  return {
    parentScopes: [...parent.parentScopes, scopeName],
    callbackCounters: new Map(parent.callbackCounters),
    reassignmentCounters: new Map(), // Reset for new scope
    iifeCounter: parent.iifeCounter,
    anonymousCounters: new Map(), // Reset for new scope
  };
}

/**
 * Generate scoped name for a callback at a specific call site
 */
export function generateCallbackScopedName(
  callExpression: string,
  argumentIndex: number,
  context: ScopeContext
): string {
  const key = `${callExpression}:${argumentIndex}`;
  const count = context.callbackCounters.get(key) ?? 0;
  context.callbackCounters.set(key, count + 1);

  const baseName = `${callExpression}.$arg${argumentIndex}`;
  if (count === 0) {
    return baseName;
  }
  return `${baseName}_${count}`;
}

/**
 * Examples of scoped name generation:
 *
 * // Top-level function
 * function handleLogin() {} → "handleLogin"
 *
 * // Class method
 * class AuthService {
 *   login() {} → "AuthService.login"
 * }
 *
 * // Nested function
 * function outer() {
 *   function inner() {} → "outer.inner"
 * }
 *
 * // Arrow in variable
 * const fetchUser = () => {} → "fetchUser"
 *
 * // Callback
 * users.map((u) => u.id) → "users.map.$arg0"
 *
 * // Array element
 * const callbacks = [() => {}, () => {}] → "callbacks.$0", "callbacks.$1"
 *
 * // Computed property
 * class Foo {
 *   [key]() {} → "Foo.[key]"
 * }
 *
 * // IIFE
 * (function() {})() → "$iife_0"
 *
 * // Reassigned variable
 * let handler = () => {} → "handler"
 * handler = () => {}     → "handler$1"
 */
