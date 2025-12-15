/**
 * Unit tests for Entity ID Generation
 *
 * Entity IDs are critical for correctness - they must be:
 * - Stable (same input = same output)
 * - Unique (different entities = different IDs)
 * - Parseable (can extract components)
 */

import { describe, expect, it } from "vitest";
import {
  entityIdsMatch,
  generateEntityId,
  generateScopeHash,
  getKindFromEntityId,
  getPackagePathFromEntityId,
  getRepoFromEntityId,
  isValidEntityId,
  normalizeComponent,
  normalizePathComponent,
  parseEntityId,
} from "../src/analyzer/entity-id-generator.js";

describe("generateEntityId", () => {
  it("generates consistent IDs for same input", () => {
    const components = {
      repo: "my-repo",
      packagePath: "packages/core",
      kind: "function" as const,
      filePath: "src/utils.ts",
      scopedName: "calculateTotal",
    };

    const id1 = generateEntityId(components);
    const id2 = generateEntityId(components);

    expect(id1).toBe(id2);
  });

  it("generates different IDs for different functions", () => {
    const base = {
      repo: "my-repo",
      packagePath: "packages/core",
      kind: "function" as const,
      filePath: "src/utils.ts",
    };

    const id1 = generateEntityId({ ...base, scopedName: "functionA" });
    const id2 = generateEntityId({ ...base, scopedName: "functionB" });

    expect(id1).not.toBe(id2);
  });

  it("generates different IDs for same name in different files", () => {
    const base = {
      repo: "my-repo",
      packagePath: "packages/core",
      kind: "function" as const,
      scopedName: "helper",
    };

    const id1 = generateEntityId({ ...base, filePath: "src/a.ts" });
    const id2 = generateEntityId({ ...base, filePath: "src/b.ts" });

    expect(id1).not.toBe(id2);
  });

  it("generates different IDs for different kinds", () => {
    const base = {
      repo: "my-repo",
      packagePath: "packages/core",
      filePath: "src/user.ts",
      scopedName: "User",
    };

    const classId = generateEntityId({ ...base, kind: "class" as const });
    const interfaceId = generateEntityId({
      ...base,
      kind: "interface" as const,
    });

    expect(classId).not.toBe(interfaceId);
  });

  it("handles nested scoped names correctly", () => {
    const components = {
      repo: "my-repo",
      packagePath: "packages/core",
      kind: "method" as const,
      filePath: "src/service.ts",
      scopedName: "UserService.getUser",
    };

    const id = generateEntityId(components);
    expect(id).toContain("my-repo");
    expect(id).toContain("method");
  });

  it("normalizes path separators", () => {
    const withForwardSlash = generateEntityId({
      repo: "repo",
      packagePath: "packages/core",
      kind: "function" as const,
      filePath: "src/utils.ts",
      scopedName: "fn",
    });

    const withBackslash = generateEntityId({
      repo: "repo",
      packagePath: "packages\\core",
      kind: "function" as const,
      filePath: "src\\utils.ts",
      scopedName: "fn",
    });

    expect(withForwardSlash).toBe(withBackslash);
  });
});

describe("generateScopeHash", () => {
  it("generates consistent hashes", () => {
    const hash1 = generateScopeHash("src/utils.ts", "myFunction", "function");
    const hash2 = generateScopeHash("src/utils.ts", "myFunction", "function");

    expect(hash1).toBe(hash2);
  });

  it("generates different hashes for different inputs", () => {
    const hash1 = generateScopeHash("src/a.ts", "fn", "function");
    const hash2 = generateScopeHash("src/b.ts", "fn", "function");

    expect(hash1).not.toBe(hash2);
  });

  it("returns a fixed-length hash", () => {
    const hash = generateScopeHash("src/utils.ts", "myFunction", "function");

    // Should be truncated to reasonable length
    expect(hash.length).toBeLessThanOrEqual(16);
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe("parseEntityId", () => {
  it("parses a valid entity ID", () => {
    const id = generateEntityId({
      repo: "my-repo",
      packagePath: "packages/core",
      kind: "function" as const,
      filePath: "src/utils.ts",
      scopedName: "calculateTotal",
    });

    const parsed = parseEntityId(id);

    expect(parsed).not.toBeNull();
    expect(parsed?.repo).toBe("my-repo");
    expect(parsed?.packagePath).toBe("packages/core");
    expect(parsed?.kind).toBe("function");
  });

  it("returns null for invalid entity ID", () => {
    const parsed = parseEntityId("not-a-valid-id");
    expect(parsed).toBeNull();
  });

  it("returns null for empty string", () => {
    const parsed = parseEntityId("");
    expect(parsed).toBeNull();
  });
});

describe("isValidEntityId", () => {
  it("returns true for valid entity IDs", () => {
    const id = generateEntityId({
      repo: "repo",
      packagePath: "pkg",
      kind: "function" as const,
      filePath: "src/index.ts",
      scopedName: "main",
    });

    expect(isValidEntityId(id)).toBe(true);
  });

  it("returns false for invalid entity IDs", () => {
    expect(isValidEntityId("")).toBe(false);
    expect(isValidEntityId("invalid")).toBe(false);
    expect(isValidEntityId("a:b")).toBe(false);
  });
});

describe("entityIdsMatch", () => {
  it("returns true for identical IDs", () => {
    const id = generateEntityId({
      repo: "repo",
      packagePath: "pkg",
      kind: "function" as const,
      filePath: "src/index.ts",
      scopedName: "main",
    });

    expect(entityIdsMatch(id, id)).toBe(true);
  });

  it("returns false for different IDs", () => {
    const id1 = generateEntityId({
      repo: "repo",
      packagePath: "pkg",
      kind: "function" as const,
      filePath: "src/a.ts",
      scopedName: "fn1",
    });

    const id2 = generateEntityId({
      repo: "repo",
      packagePath: "pkg",
      kind: "function" as const,
      filePath: "src/b.ts",
      scopedName: "fn2",
    });

    expect(entityIdsMatch(id1, id2)).toBe(false);
  });
});

describe("normalizeComponent", () => {
  it("preserves case (per spec)", () => {
    expect(normalizeComponent("MyRepo")).toBe("MyRepo");
  });

  it("handles empty strings", () => {
    expect(normalizeComponent("")).toBe("");
  });

  it("preserves valid characters", () => {
    expect(normalizeComponent("my-repo_123")).toBe("my-repo_123");
  });

  it("trims whitespace", () => {
    expect(normalizeComponent("  MyRepo  ")).toBe("MyRepo");
  });
});

describe("normalizePathComponent", () => {
  it("normalizes forward slashes", () => {
    expect(normalizePathComponent("packages/core")).toBe("packages/core");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalizePathComponent("packages\\core")).toBe("packages/core");
  });

  it("preserves trailing slashes", () => {
    // Current implementation preserves trailing slashes
    expect(normalizePathComponent("packages/core/")).toBe("packages/core/");
  });

  it("trims whitespace", () => {
    expect(normalizePathComponent("  packages/core  ")).toBe("packages/core");
  });
});

describe("extraction helpers", () => {
  const id = generateEntityId({
    repo: "my-repo",
    packagePath: "packages/core",
    kind: "class" as const,
    filePath: "src/service.ts",
    scopedName: "UserService",
  });

  it("extracts repo from entity ID", () => {
    expect(getRepoFromEntityId(id)).toBe("my-repo");
  });

  it("extracts package path from entity ID", () => {
    expect(getPackagePathFromEntityId(id)).toBe("packages/core");
  });

  it("extracts kind from entity ID", () => {
    expect(getKindFromEntityId(id)).toBe("class");
  });

  it("returns null for invalid IDs", () => {
    expect(getRepoFromEntityId("invalid")).toBeNull();
    expect(getPackagePathFromEntityId("invalid")).toBeNull();
    expect(getKindFromEntityId("invalid")).toBeNull();
  });
});
