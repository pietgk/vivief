/**
 * URI Resolution Tests
 *
 * Tests for the URI resolution helpers that enable devac:// URIs
 * in MCP tool parameters while maintaining backwards compatibility.
 */

import { isCanonicalURI, parseCanonicalURI } from "@pietgk/devac-core";
import { describe, expect, it } from "vitest";

/**
 * Resolve a file path or devac:// URI to a file path
 * (Duplicated from server.ts for unit testing)
 */
function resolveToFilePath(input: string): string {
  if (isCanonicalURI(input)) {
    const uri = parseCanonicalURI(input);
    if (uri.file) {
      return uri.package === "." ? uri.file : `${uri.package}/${uri.file}`;
    }
    return uri.package;
  }
  return input;
}

/**
 * Resolve an entity ID or devac:// URI to an entity identifier
 * (Duplicated from server.ts for unit testing)
 */
function resolveToEntityId(input: string): string {
  // For Phase 2, we pass through URIs as-is
  return input;
}

describe("resolveToFilePath", () => {
  describe("legacy file paths (backwards compatibility)", () => {
    it("passes through simple file paths unchanged", () => {
      expect(resolveToFilePath("src/index.ts")).toBe("src/index.ts");
    });

    it("passes through absolute file paths unchanged", () => {
      expect(resolveToFilePath("/Users/test/project/src/index.ts")).toBe(
        "/Users/test/project/src/index.ts"
      );
    });

    it("passes through relative file paths unchanged", () => {
      expect(resolveToFilePath("./src/index.ts")).toBe("./src/index.ts");
    });

    it("passes through paths with package prefixes unchanged", () => {
      expect(resolveToFilePath("packages/core/src/index.ts")).toBe("packages/core/src/index.ts");
    });
  });

  describe("devac:// URI resolution", () => {
    it("resolves URI with root package to file path", () => {
      const uri = "devac://ws/repo/./src/index.ts";
      expect(resolveToFilePath(uri)).toBe("src/index.ts");
    });

    it("resolves URI with package path to combined path", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts";
      expect(resolveToFilePath(uri)).toBe("packages/core/src/auth.ts");
    });

    it("resolves URI with nested package path", () => {
      const uri = "devac://mindlercare/app/packages/web/client/src/App.tsx";
      expect(resolveToFilePath(uri)).toBe("packages/web/client/src/App.tsx");
    });

    it("resolves URI with version tag", () => {
      const uri = "devac://ws/repo@main/packages/core/src/index.ts";
      expect(resolveToFilePath(uri)).toBe("packages/core/src/index.ts");
    });

    it("resolves package-only URI to package path", () => {
      const uri = "devac://ws/repo/packages/core";
      expect(resolveToFilePath(uri)).toBe("packages/core");
    });

    it("ignores symbol fragment when resolving to file path", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts#AuthService.login()";
      expect(resolveToFilePath(uri)).toBe("packages/core/src/auth.ts");
    });

    it("ignores location fragment when resolving to file path", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts#L45";
      expect(resolveToFilePath(uri)).toBe("packages/core/src/auth.ts");
    });

    it("ignores both symbol and location fragments", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts#AuthService#L45";
      expect(resolveToFilePath(uri)).toBe("packages/core/src/auth.ts");
    });
  });
});

describe("resolveToEntityId", () => {
  describe("legacy entity IDs (backwards compatibility)", () => {
    it("passes through entity IDs unchanged", () => {
      expect(resolveToEntityId("repo:packages/core:function:abc123")).toBe(
        "repo:packages/core:function:abc123"
      );
    });

    it("passes through entity IDs with root package", () => {
      expect(resolveToEntityId("repo:.:class:def456")).toBe("repo:.:class:def456");
    });
  });

  describe("devac:// URI handling (Phase 2)", () => {
    it("passes through URIs unchanged (full resolution is Phase 3+)", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts#AuthService";
      expect(resolveToEntityId(uri)).toBe(uri);
    });

    it("passes through URIs with method references", () => {
      const uri = "devac://ws/repo/packages/core/src/auth.ts#AuthService.login()";
      expect(resolveToEntityId(uri)).toBe(uri);
    });
  });
});

describe("isCanonicalURI detection", () => {
  it("identifies devac:// URIs", () => {
    expect(isCanonicalURI("devac://ws/repo/pkg/file.ts")).toBe(true);
  });

  it("rejects file paths", () => {
    expect(isCanonicalURI("src/index.ts")).toBe(false);
  });

  it("rejects entity IDs", () => {
    expect(isCanonicalURI("repo:pkg:kind:hash")).toBe(false);
  });

  it("rejects http URLs", () => {
    expect(isCanonicalURI("https://example.com")).toBe(false);
  });
});
