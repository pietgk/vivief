import { describe, expect, it } from "vitest";
import {
  // Types
  type CanonicalURI,
  type EntityID,
  // Constants
  ROOT_PACKAGE,
  type SymbolPath,
  type URIContext,
  URIParseError,
  type URIQueryParams,
  URI_SCHEME,
  buildURIFromNode,
  createCanonicalURI,
  createSymbolIndexEntry,
  detectReferenceType,
  // Formatter
  formatCanonicalURI,
  formatEntityID,
  formatQueryParams,
  formatSymbolPath,
  getParentURI,
  getRefSpecificity,
  // Parser
  parseCanonicalURI,
  parseEntityID,
  parseQueryParams,
  parseSymbolPath,
  // Relative
  resolveRelativeRef,
  toRelativeRef,
  urisEqual,
} from "../src/uri/index.js";
import { InMemorySymbolIndex } from "./helpers/InMemorySymbolIndex.js";

describe("URI Parser", () => {
  describe("parseCanonicalURI", () => {
    it("should parse a full canonical URI with query params", () => {
      const result = parseCanonicalURI(
        "devac://app/packages/core/src/auth.ts#AuthService.login()?version=main&line=45"
      );

      expect(result.uri.repo).toBe("app");
      expect(result.uri.package).toBe("packages/core");
      expect(result.uri.file).toBe("src/auth.ts");
      expect(result.uri.symbol).toBeDefined();
      expect(result.uri.symbol?.segments).toHaveLength(2);
      expect(result.uri.symbol?.segments[0]).toEqual({
        kind: "type",
        name: "AuthService",
        isMethod: false,
        params: undefined,
      });
      expect(result.uri.symbol?.segments[1]).toEqual({
        kind: "term",
        name: "login",
        isMethod: true,
        params: undefined,
      });
      expect(result.params?.version).toBe("main");
      expect(result.params?.line).toBe(45);
    });

    it("should parse a repo-only URI", () => {
      const result = parseCanonicalURI("devac://app");

      expect(result.uri.repo).toBe("app");
      expect(result.uri.package).toBe(ROOT_PACKAGE);
      expect(result.uri.file).toBeUndefined();
      expect(result.params).toBeUndefined();
    });

    it("should parse URI with root package marker", () => {
      const result = parseCanonicalURI("devac://app/./src/App.tsx");

      expect(result.uri.repo).toBe("app");
      expect(result.uri.package).toBe(ROOT_PACKAGE);
      expect(result.uri.file).toBe("src/App.tsx");
    });

    it("should parse URI with all query params", () => {
      const result = parseCanonicalURI(
        "devac://app/./src/auth.ts#AuthService?version=main&line=10&col=5&endLine=20&endCol=15"
      );

      expect(result.params).toEqual({
        version: "main",
        line: 10,
        col: 5,
        endLine: 20,
        endCol: 15,
      });
    });

    it("should throw on invalid URI scheme", () => {
      expect(() => parseCanonicalURI("http://example.com")).toThrow(URIParseError);
    });
  });

  describe("parseQueryParams", () => {
    it("should parse query parameters", () => {
      const params = parseQueryParams("version=main&line=45&col=10");
      expect(params).toEqual({
        version: "main",
        line: 45,
        col: 10,
      });
    });

    it("should handle URL-encoded values", () => {
      const params = parseQueryParams("version=feature%2Ftest");
      expect(params.version).toBe("feature/test");
    });

    it("should handle empty query string", () => {
      const params = parseQueryParams("");
      expect(params).toEqual({});
    });
  });

  describe("parseEntityID", () => {
    it("should parse a valid entity ID", () => {
      const id = parseEntityID("app:packages/core:class:a1b2c3d4");

      expect(id.repo).toBe("app");
      expect(id.package).toBe("packages/core");
      expect(id.kind).toBe("class");
      expect(id.hash).toBe("a1b2c3d4");
    });

    it("should parse entity ID with root package", () => {
      const id = parseEntityID("app:.:function:xyz123");

      expect(id.repo).toBe("app");
      expect(id.package).toBe(ROOT_PACKAGE);
      expect(id.kind).toBe("function");
      expect(id.hash).toBe("xyz123");
    });

    it("should throw on invalid entity ID", () => {
      expect(() => parseEntityID("invalid")).toThrow(URIParseError);
      expect(() => parseEntityID("only:two")).toThrow(URIParseError);
    });
  });

  describe("parseSymbolPath", () => {
    it("should parse a type symbol", () => {
      const path = parseSymbolPath("#AuthService");

      expect(path.segments).toHaveLength(1);
      expect(path.segments[0]).toEqual({
        kind: "type",
        name: "AuthService",
        isMethod: false,
        params: undefined,
      });
    });

    it("should parse a term symbol", () => {
      const path = parseSymbolPath(".validateEmail()");

      expect(path.segments).toHaveLength(1);
      expect(path.segments[0]).toEqual({
        kind: "term",
        name: "validateEmail",
        isMethod: true,
        params: undefined,
      });
    });

    it("should parse a chained symbol path", () => {
      const path = parseSymbolPath("#AuthService.login()");

      expect(path.segments).toHaveLength(2);
      expect(path.segments[0]).toEqual({
        kind: "type",
        name: "AuthService",
        isMethod: false,
        params: undefined,
      });
      expect(path.segments[1]).toEqual({
        kind: "term",
        name: "login",
        isMethod: true,
        params: undefined,
      });
    });

    it("should parse symbol with parameter types", () => {
      const path = parseSymbolPath("#AuthService.login(string,string)");

      expect(path.segments[1]).toEqual({
        kind: "term",
        name: "login",
        isMethod: true,
        params: ["string", "string"],
      });
    });

    it("should throw on invalid symbol path", () => {
      expect(() => parseSymbolPath("noPrefix")).toThrow(URIParseError);
    });
  });

  describe("detectReferenceType", () => {
    it("should detect canonical URIs", () => {
      const result = detectReferenceType("devac://app/packages/core");
      expect(result.type).toBe("canonical");
    });

    it("should detect entity IDs", () => {
      const result = detectReferenceType("app:pkg:class:hash");
      expect(result.type).toBe("entity");
    });

    it("should detect symbol paths", () => {
      const result = detectReferenceType("#AuthService");
      expect(result.type).toBe("symbol");
    });
  });
});

describe("URI Formatter", () => {
  describe("formatCanonicalURI", () => {
    it("should format a full URI with query params", () => {
      const uri: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: {
          segments: [
            { kind: "type", name: "AuthService" },
            { kind: "term", name: "login", isMethod: true },
          ],
        },
      };

      const params: URIQueryParams = { version: "main", line: 45 };

      expect(formatCanonicalURI(uri, params)).toBe(
        "devac://app/packages/core/src/auth.ts#AuthService.login()?version=main&line=45"
      );
    });

    it("should format repo-only URI", () => {
      const uri: CanonicalURI = {
        repo: "app",
        package: ROOT_PACKAGE,
      };

      expect(formatCanonicalURI(uri)).toBe("devac://app");
    });

    it("should format URI with root package", () => {
      const uri: CanonicalURI = {
        repo: "app",
        package: ROOT_PACKAGE,
        file: "src/App.tsx",
      };

      expect(formatCanonicalURI(uri)).toBe("devac://app/./src/App.tsx");
    });
  });

  describe("formatQueryParams", () => {
    it("should format query params", () => {
      const params: URIQueryParams = { version: "main", line: 45, col: 10 };
      expect(formatQueryParams(params)).toBe("version=main&line=45&col=10");
    });

    it("should URL-encode version", () => {
      const params: URIQueryParams = { version: "feature/test" };
      expect(formatQueryParams(params)).toBe("version=feature%2Ftest");
    });

    it("should return empty string for empty params", () => {
      const params: URIQueryParams = {};
      expect(formatQueryParams(params)).toBe("");
    });
  });

  describe("formatEntityID", () => {
    it("should format an entity ID", () => {
      const id: EntityID = {
        repo: "app",
        package: "packages/core",
        kind: "class",
        hash: "a1b2c3d4",
      };

      expect(formatEntityID(id)).toBe("app:packages/core:class:a1b2c3d4");
    });
  });

  describe("formatSymbolPath", () => {
    it("should format a symbol path", () => {
      const path: SymbolPath = {
        segments: [
          { kind: "type", name: "AuthService" },
          { kind: "term", name: "login", isMethod: true, params: ["string", "string"] },
        ],
      };

      expect(formatSymbolPath(path)).toBe("#AuthService.login(string,string)");
    });
  });

  describe("createCanonicalURI", () => {
    it("should create a URI with convenience function", () => {
      const uri = createCanonicalURI({
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbolName: "login",
        symbolKind: "term",
        isMethod: true,
      });

      expect(uri.repo).toBe("app");
      expect(uri.symbol?.segments[0]?.name).toBe("login");
    });
  });

  describe("buildURIFromNode", () => {
    it("should build URI from node data with version and line", () => {
      const uri = buildURIFromNode({
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "AuthService",
        kind: "class",
        startLine: 10,
        version: "main",
      });

      expect(uri).toBe("devac://app/packages/core/src/auth.ts#AuthService?version=main&line=10");
    });

    it("should build URI from qualified name", () => {
      const uri = buildURIFromNode({
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "login",
        qualifiedName: "AuthService.login",
        kind: "method",
      });

      expect(uri).toBe("devac://app/packages/core/src/auth.ts#AuthService.login()");
    });
  });
});

describe("URI Resolver", () => {
  describe("InMemorySymbolIndex", () => {
    it("should index and resolve symbols", () => {
      const index = new InMemorySymbolIndex();

      const entry = createSymbolIndexEntry({
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "AuthService",
        kind: "class",
        hash: "abc123",
        line: 10,
      });

      index.add(entry);

      // Resolve by URI
      const entityId = index.resolveURI(entry.uri);
      expect(entityId).toBeDefined();
      expect(entityId?.hash).toBe("abc123");

      // Resolve by entity ID
      const uri = index.getURI(entry.entityId);
      expect(uri).toBeDefined();
      expect(uri?.repo).toBe("app");
    });

    it("should find symbols by name", () => {
      const index = new InMemorySymbolIndex();

      index.add(
        createSymbolIndexEntry({
          repo: "app",
          package: "packages/core",
          filePath: "src/auth.ts",
          name: "AuthService",
          kind: "class",
          hash: "abc123",
          line: 10,
        })
      );

      index.add(
        createSymbolIndexEntry({
          repo: "app",
          package: "packages/core",
          filePath: "src/auth.ts",
          name: "AuthProvider",
          kind: "class",
          hash: "def456",
          line: 50,
        })
      );

      // Exact match
      const exact = index.findByName("AuthService");
      expect(exact).toHaveLength(1);

      // Wildcard match
      const wildcard = index.findByName("Auth*");
      expect(wildcard).toHaveLength(2);
    });

    it("should get file symbols", () => {
      const index = new InMemorySymbolIndex();

      const entry1 = createSymbolIndexEntry({
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "AuthService",
        kind: "class",
        hash: "abc123",
        line: 10,
      });

      const entry2 = createSymbolIndexEntry({
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "login",
        kind: "function",
        hash: "xyz789",
        line: 50,
      });

      index.add(entry1);
      index.add(entry2);

      const fileSymbols = index.getFileSymbols(entry1.uri);
      expect(fileSymbols).toHaveLength(2);
    });
  });

  describe("urisEqual", () => {
    it("should compare URIs correctly", () => {
      const uri1: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const uri2: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const uri3: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "OtherClass" }] },
      };

      expect(urisEqual(uri1, uri2)).toBe(true);
      expect(urisEqual(uri1, uri3)).toBe(false);
    });
  });

  describe("getParentURI", () => {
    it("should get parent URIs", () => {
      const symbolUri: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const fileUri = getParentURI(symbolUri);
      expect(fileUri?.file).toBe("src/auth.ts");
      expect(fileUri?.symbol).toBeUndefined();

      const packageUri = getParentURI(fileUri!);
      expect(packageUri?.package).toBe("packages/core");
      expect(packageUri?.file).toBeUndefined();

      const repoUri = getParentURI(packageUri!);
      expect(repoUri?.repo).toBe("app");
      expect(repoUri?.package).toBe(ROOT_PACKAGE);

      const noParent = getParentURI(repoUri!);
      expect(noParent).toBeNull();
    });
  });
});

describe("Relative References", () => {
  const context: URIContext = {
    repo: "app",
    package: "packages/core",
    file: "src/auth.ts",
  };

  describe("resolveRelativeRef", () => {
    it("should resolve symbol-only reference", () => {
      const uri = resolveRelativeRef("#AuthService.login()", context);

      expect(uri.repo).toBe("app");
      expect(uri.package).toBe("packages/core");
      expect(uri.file).toBe("src/auth.ts");
      expect(uri.symbol?.segments).toHaveLength(2);
    });

    it("should resolve canonical URI unchanged", () => {
      const canonical = "devac://other/./src/file.ts?version=v1.0.0";
      const uri = resolveRelativeRef(canonical, context);

      expect(uri.repo).toBe("other");
      expect(uri.file).toBe("src/file.ts");
    });

    it("should throw on cross-file relative refs", () => {
      expect(() => resolveRelativeRef("./user.ts#UserService", context)).toThrow(URIParseError);
      expect(() => resolveRelativeRef("../other/file.ts", context)).toThrow(URIParseError);
    });
  });

  describe("toRelativeRef", () => {
    it("should return symbol-only for same file", () => {
      const uri: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const ref = toRelativeRef(uri, context);
      expect(ref).toBe("#AuthService");
    });

    it("should return full URI for different file", () => {
      const uri: CanonicalURI = {
        repo: "app",
        package: "packages/core",
        file: "src/user.ts",
        symbol: { segments: [{ kind: "type", name: "UserService" }] },
      };

      const ref = toRelativeRef(uri, context);
      expect(ref.startsWith(URI_SCHEME)).toBe(true);
      expect(ref).toBe("devac://app/packages/core/src/user.ts#UserService");
    });

    it("should return full URI for different repo", () => {
      const uri: CanonicalURI = {
        repo: "other",
        package: "packages/core",
        file: "src/auth.ts",
      };

      const ref = toRelativeRef(uri, context);
      expect(ref.startsWith(URI_SCHEME)).toBe(true);
    });
  });

  describe("getRefSpecificity", () => {
    it("should return correct specificity levels", () => {
      expect(getRefSpecificity("devac://app/./file")).toBe(2);
      expect(getRefSpecificity("#Symbol")).toBe(1);
      expect(getRefSpecificity(".term()")).toBe(1);
      expect(getRefSpecificity("unknown")).toBe(0);
    });
  });
});

describe("Round-trip tests", () => {
  it("should round-trip canonical URIs", () => {
    const original =
      "devac://app/packages/core/src/auth.ts#AuthService.login(string,string)?version=main&line=45&col=10";
    const parsed = parseCanonicalURI(original);
    const formatted = formatCanonicalURI(parsed.uri, parsed.params);

    expect(formatted).toBe(original);
  });

  it("should round-trip entity IDs", () => {
    const original = "app:packages/core:class:a1b2c3d4e5f6";
    const parsed = parseEntityID(original);
    const formatted = formatEntityID(parsed);

    expect(formatted).toBe(original);
  });

  it("should round-trip symbol paths", () => {
    const original = "#AuthService.login(string,number)";
    const parsed = parseSymbolPath(original);
    const formatted = formatSymbolPath(parsed);

    expect(formatted).toBe(original);
  });
});
