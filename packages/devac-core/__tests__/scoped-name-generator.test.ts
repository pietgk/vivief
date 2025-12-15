/**
 * Unit tests for Scoped Name Generation
 *
 * Scoped names are critical for stable entity IDs.
 * They must be:
 * - Stable (not dependent on line numbers)
 * - Unique within a file
 * - Human-readable for debugging
 */

import { describe, expect, it } from "vitest";
import {
  type SymbolInfo,
  createScopeContext,
  generateScopedName,
  popScope,
  pushScope,
} from "../src/parsers/scoped-name-generator.js";

describe("generateScopedName", () => {
  describe("top-level declarations", () => {
    it("generates name for top-level function", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "calculateTotal",
        kind: "function",
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("calculateTotal");
    });

    it("generates name for top-level class", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "UserService",
        kind: "class",
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService");
    });

    it("generates name for top-level arrow function", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "fetchData",
        kind: "arrow",
        isTopLevel: true,
        variableName: "fetchData",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("fetchData");
    });

    it("generates name for top-level interface", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "UserConfig",
        kind: "class", // interfaces use class kind
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserConfig");
    });
  });

  describe("class members", () => {
    it("generates name for class method", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "UserService");

      const symbol: SymbolInfo = {
        name: "getUser",
        kind: "method",
        isTopLevel: false,
        parentName: "UserService",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService.getUser");
    });

    it("generates name for static method", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "UserService");

      const symbol: SymbolInfo = {
        name: "createDefault",
        kind: "static_method",
        isTopLevel: false,
        parentName: "UserService",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService.createDefault");
    });

    it("generates name for class property", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "UserService");

      const symbol: SymbolInfo = {
        name: "users",
        kind: "property",
        isTopLevel: false,
        parentName: "UserService",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService.users");
    });

    it("generates name for static property", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "UserService");

      const symbol: SymbolInfo = {
        name: "version",
        kind: "static_property",
        isTopLevel: false,
        parentName: "UserService",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService.version");
    });

    it("generates name for constructor", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "UserService");

      const symbol: SymbolInfo = {
        name: "constructor",
        kind: "method",
        isTopLevel: false,
        parentName: "UserService",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("UserService.constructor");
    });
  });

  describe("nested structures", () => {
    it("generates name for nested class method", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "OuterClass");
      pushScope(ctx, "InnerClass");

      const symbol: SymbolInfo = {
        name: "innerMethod",
        kind: "method",
        isTopLevel: false,
        parentName: "InnerClass",
      };

      const scopedName = generateScopedName(symbol, ctx);

      // Should include full scope chain
      expect(scopedName).toContain("InnerClass");
      expect(scopedName).toContain("innerMethod");
    });

    it("generates name for function inside function", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "outerFunction");

      const symbol: SymbolInfo = {
        name: "innerFunction",
        kind: "function",
        isTopLevel: false,
        parentName: "outerFunction",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("outerFunction.innerFunction");
    });
  });

  describe("anonymous and special cases", () => {
    it("handles anonymous arrow function with variable name", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "",
        kind: "arrow",
        isTopLevel: true,
        variableName: "handler",
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("handler");
    });

    it("generates unique name for callback in method", () => {
      const ctx = createScopeContext();

      const symbol: SymbolInfo = {
        name: null,
        kind: "callback",
        isTopLevel: false,
        callExpression: "users.forEach",
        argumentIndex: 0,
      };

      const scopedName = generateScopedName(symbol, ctx);

      // Should include call expression and arg index
      expect(scopedName).toBe("users.forEach.$arg0");
    });
  });

  describe("scope context management", () => {
    it("pushScope adds to parent scopes", () => {
      const ctx = createScopeContext();

      expect(ctx.parentScopes).toHaveLength(0);

      pushScope(ctx, "ClassA");
      expect(ctx.parentScopes).toHaveLength(1);
      expect(ctx.parentScopes[0]).toBe("ClassA");

      pushScope(ctx, "methodB");
      expect(ctx.parentScopes).toHaveLength(2);
      expect(ctx.parentScopes[1]).toBe("methodB");
    });

    it("popScope removes from parent scopes", () => {
      const ctx = createScopeContext();
      pushScope(ctx, "ClassA");
      pushScope(ctx, "methodB");

      expect(ctx.parentScopes).toHaveLength(2);

      popScope(ctx);
      expect(ctx.parentScopes).toHaveLength(1);
      expect(ctx.parentScopes[0]).toBe("ClassA");

      popScope(ctx);
      expect(ctx.parentScopes).toHaveLength(0);
    });

    it("popScope on empty stack is safe", () => {
      const ctx = createScopeContext();

      expect(() => popScope(ctx)).not.toThrow();
      expect(ctx.parentScopes).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("handles symbols with special characters in names", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "$private",
        kind: "property",
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toBe("$private");
    });

    it("handles empty name gracefully", () => {
      const ctx = createScopeContext();
      const symbol: SymbolInfo = {
        name: "",
        kind: "function",
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      // Should return something, not crash
      expect(typeof scopedName).toBe("string");
    });

    it("handles very long names", () => {
      const ctx = createScopeContext();
      const longName = "a".repeat(200);
      const symbol: SymbolInfo = {
        name: longName,
        kind: "function",
        isTopLevel: true,
      };

      const scopedName = generateScopedName(symbol, ctx);

      expect(scopedName).toContain(longName);
    });
  });
});

describe("scoped name stability", () => {
  it("generates same name regardless of call order", () => {
    // First call
    const ctx1 = createScopeContext();
    pushScope(ctx1, "MyClass");
    const name1 = generateScopedName(
      {
        name: "myMethod",
        kind: "method",
        isTopLevel: false,
        parentName: "MyClass",
      },
      ctx1
    );

    // Second call with fresh context
    const ctx2 = createScopeContext();
    pushScope(ctx2, "MyClass");
    const name2 = generateScopedName(
      {
        name: "myMethod",
        kind: "method",
        isTopLevel: false,
        parentName: "MyClass",
      },
      ctx2
    );

    expect(name1).toBe(name2);
  });

  it("different parent classes produce different scoped names", () => {
    const ctx1 = createScopeContext();
    pushScope(ctx1, "ClassA");
    const name1 = generateScopedName(
      {
        name: "process",
        kind: "method",
        isTopLevel: false,
        parentName: "ClassA",
      },
      ctx1
    );

    const ctx2 = createScopeContext();
    pushScope(ctx2, "ClassB");
    const name2 = generateScopedName(
      {
        name: "process",
        kind: "method",
        isTopLevel: false,
        parentName: "ClassB",
      },
      ctx2
    );

    expect(name1).not.toBe(name2);
  });
});
