import { describe, expect, it } from "vitest";
import {
  // Types
  type CanonicalURI,
  type EntityID,
  type SymbolPath,
  type URIContext,
  // Constants
  ROOT_PACKAGE,
  URI_SCHEME,
  // Parser
  parseCanonicalURI,
  parseEntityID,
  parseSymbolPath,
  parseLocation,
  isCanonicalURI,
  isEntityID,
  detectReferenceType,
  URIParseError,
  // Formatter
  formatCanonicalURI,
  formatEntityID,
  formatSymbolPath,
  formatLocation,
  createCanonicalURI,
  createEntityID,
  buildURIFromNode,
  getQualifiedName,
  // Resolver
  InMemorySymbolIndex,
  createSymbolIndexEntry,
  urisEqual,
  entityIdsEqual,
  getParentURI,
  // Relative
  resolveRelativeRef,
  toRelativeRef,
  getRefSpecificity,
} from "../src/uri/index.js";

describe("URI Parser", () => {
  describe("parseCanonicalURI", () => {
    it("should parse a full canonical URI", () => {
      const uri = parseCanonicalURI(
        "devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login()#L45"
      );

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.repo).toBe("app");
      expect(uri.version).toBe("main");
      expect(uri.package).toBe("packages/core");
      expect(uri.file).toBe("src/auth.ts");
      expect(uri.symbol).toBeDefined();
      expect(uri.symbol?.segments).toHaveLength(2);
      expect(uri.symbol?.segments[0]).toEqual({
        kind: "type",
        name: "AuthService",
        isMethod: false,
        params: undefined,
      });
      expect(uri.symbol?.segments[1]).toEqual({
        kind: "term",
        name: "login",
        isMethod: true,
        params: undefined,
      });
      expect(uri.location).toEqual({ line: 45 });
    });

    it("should parse a workspace-only URI", () => {
      const uri = parseCanonicalURI("devac://mindlercare");

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.repo).toBe("");
      expect(uri.package).toBe(ROOT_PACKAGE);
    });

    it("should parse a repo URI with version", () => {
      const uri = parseCanonicalURI("devac://mindlercare/app@v2.1.0");

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.repo).toBe("app");
      expect(uri.version).toBe("v2.1.0");
      expect(uri.package).toBe(ROOT_PACKAGE);
    });

    it("should parse URI with root package marker", () => {
      const uri = parseCanonicalURI("devac://mindlercare/app@main/./src/App.tsx");

      expect(uri.package).toBe(ROOT_PACKAGE);
      expect(uri.file).toBe("src/App.tsx");
    });

    it("should parse URI with location range", () => {
      const uri = parseCanonicalURI(
        "devac://mindlercare/app@main/./src/auth.ts#AuthService#L10:C5-L20:C15"
      );

      expect(uri.location).toEqual({
        line: 10,
        column: 5,
        endLine: 20,
        endColumn: 15,
      });
    });

    it("should throw on invalid URI scheme", () => {
      expect(() => parseCanonicalURI("http://example.com")).toThrow(URIParseError);
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

  describe("parseLocation", () => {
    it("should parse line only", () => {
      expect(parseLocation("L10")).toEqual({ line: 10 });
      expect(parseLocation("10")).toEqual({ line: 10 });
    });

    it("should parse line and column", () => {
      expect(parseLocation("L10:C5")).toEqual({ line: 10, column: 5 });
      expect(parseLocation("L10:5")).toEqual({ line: 10, column: 5 });
    });

    it("should parse line range", () => {
      expect(parseLocation("L10-L20")).toEqual({ line: 10, endLine: 20 });
      expect(parseLocation("L10-20")).toEqual({ line: 10, endLine: 20 });
    });

    it("should parse full range", () => {
      expect(parseLocation("L10:C5-L20:C15")).toEqual({
        line: 10,
        column: 5,
        endLine: 20,
        endColumn: 15,
      });
    });
  });

  describe("detectReferenceType", () => {
    it("should detect canonical URIs", () => {
      const result = detectReferenceType("devac://mindlercare/app");
      expect(result.type).toBe("canonical");
    });

    it("should detect entity IDs", () => {
      const result = detectReferenceType("app:pkg:class:hash");
      expect(result.type).toBe("entity");
    });

    it("should detect relative refs", () => {
      const result = detectReferenceType("./file.ts");
      expect(result.type).toBe("relative");
    });

    it("should detect symbol paths", () => {
      const result = detectReferenceType("#AuthService");
      expect(result.type).toBe("symbol");
    });
  });
});

describe("URI Formatter", () => {
  describe("formatCanonicalURI", () => {
    it("should format a full URI", () => {
      const uri: CanonicalURI = {
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: {
          segments: [
            { kind: "type", name: "AuthService" },
            { kind: "term", name: "login", isMethod: true },
          ],
        },
        location: { line: 45 },
      };

      expect(formatCanonicalURI(uri)).toBe(
        "devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login()#L45"
      );
    });

    it("should format workspace-only URI", () => {
      const uri: CanonicalURI = {
        workspace: "mindlercare",
        repo: "",
        package: ROOT_PACKAGE,
      };

      expect(formatCanonicalURI(uri)).toBe("devac://mindlercare");
    });

    it("should format URI with root package", () => {
      const uri: CanonicalURI = {
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: ROOT_PACKAGE,
        file: "src/App.tsx",
      };

      expect(formatCanonicalURI(uri)).toBe("devac://mindlercare/app@main/./src/App.tsx");
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

  describe("formatLocation", () => {
    it("should format location with line only", () => {
      expect(formatLocation({ line: 10 })).toBe("L10");
    });

    it("should format location with column", () => {
      expect(formatLocation({ line: 10, column: 5 })).toBe("L10:C5");
    });

    it("should format location range", () => {
      expect(formatLocation({ line: 10, endLine: 20 })).toBe("L10-L20");
    });
  });

  describe("createCanonicalURI", () => {
    it("should create a URI with convenience function", () => {
      const uri = createCanonicalURI({
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: "packages/core",
        file: "src/auth.ts",
        symbolName: "login",
        symbolKind: "term",
        isMethod: true,
        line: 45,
      });

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.symbol?.segments[0].name).toBe("login");
      expect(uri.location?.line).toBe(45);
    });
  });

  describe("buildURIFromNode", () => {
    it("should build URI from node data", () => {
      const uri = buildURIFromNode({
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "AuthService",
        kind: "class",
        startLine: 10,
      });

      expect(uri).toBe("devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService#L10");
    });

    it("should build URI from qualified name", () => {
      const uri = buildURIFromNode({
        workspace: "mindlercare",
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "login",
        qualifiedName: "AuthService.login",
        kind: "method",
      });

      expect(uri).toBe("devac://mindlercare/app/packages/core/src/auth.ts#AuthService.login()");
    });
  });
});

describe("URI Resolver", () => {
  describe("InMemorySymbolIndex", () => {
    it("should index and resolve symbols", () => {
      const index = new InMemorySymbolIndex();

      const entry = createSymbolIndexEntry({
        workspace: "mindlercare",
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
      expect(uri?.workspace).toBe("mindlercare");
    });

    it("should find symbols by name", () => {
      const index = new InMemorySymbolIndex();

      index.add(
        createSymbolIndexEntry({
          workspace: "mindlercare",
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
          workspace: "mindlercare",
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
        workspace: "mindlercare",
        repo: "app",
        package: "packages/core",
        filePath: "src/auth.ts",
        name: "AuthService",
        kind: "class",
        hash: "abc123",
        line: 10,
      });

      const entry2 = createSymbolIndexEntry({
        workspace: "mindlercare",
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
        workspace: "mindlercare",
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const uri2: CanonicalURI = {
        workspace: "mindlercare",
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
        location: { line: 10 }, // Location difference ignored
      };

      const uri3: CanonicalURI = {
        workspace: "mindlercare",
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
        workspace: "mindlercare",
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

      const workspaceUri = getParentURI(repoUri!);
      expect(workspaceUri?.workspace).toBe("mindlercare");
      expect(workspaceUri?.repo).toBe("");

      const noParent = getParentURI(workspaceUri!);
      expect(noParent).toBeNull();
    });
  });
});

describe("Relative References", () => {
  const context: URIContext = {
    workspace: "mindlercare",
    repo: "app",
    version: "main",
    package: "packages/core",
    file: "src/auth.ts",
  };

  describe("resolveRelativeRef", () => {
    it("should resolve symbol-only reference", () => {
      const uri = resolveRelativeRef("#AuthService.login()", context);

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.repo).toBe("app");
      expect(uri.package).toBe("packages/core");
      expect(uri.file).toBe("src/auth.ts");
      expect(uri.symbol?.segments).toHaveLength(2);
    });

    it("should resolve relative file path", () => {
      const uri = resolveRelativeRef("./user.ts#UserService", context);

      expect(uri.file).toBe("src/user.ts");
      expect(uri.symbol?.segments[0].name).toBe("UserService");
    });

    it("should resolve canonical URI unchanged", () => {
      const canonical = "devac://mindlercare/other@v1.0.0/./src/file.ts";
      const uri = resolveRelativeRef(canonical, context);

      expect(uri.workspace).toBe("mindlercare");
      expect(uri.repo).toBe("other");
      expect(uri.version).toBe("v1.0.0");
    });
  });

  describe("toRelativeRef", () => {
    it("should return symbol-only for same file", () => {
      const uri: CanonicalURI = {
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: "packages/core",
        file: "src/auth.ts",
        symbol: { segments: [{ kind: "type", name: "AuthService" }] },
      };

      const ref = toRelativeRef(uri, context);
      expect(ref).toBe("#AuthService");
    });

    it("should return relative path for different file", () => {
      const uri: CanonicalURI = {
        workspace: "mindlercare",
        repo: "app",
        version: "main",
        package: "packages/core",
        file: "src/user.ts",
        symbol: { segments: [{ kind: "type", name: "UserService" }] },
      };

      const ref = toRelativeRef(uri, context);
      expect(ref).toBe("./user.ts#UserService");
    });

    it("should return full URI for different workspace", () => {
      const uri: CanonicalURI = {
        workspace: "other",
        repo: "app",
        package: "packages/core",
        file: "src/auth.ts",
      };

      const ref = toRelativeRef(uri, context);
      expect(ref.startsWith(URI_SCHEME)).toBe(true);
    });
  });

  describe("getRefSpecificity", () => {
    it("should return correct specificity levels", () => {
      expect(getRefSpecificity("devac://ws/repo/./file")).toBe(5);
      expect(getRefSpecificity("repo@version/pkg/file")).toBe(4);
      expect(getRefSpecificity("pkg/file")).toBe(3);
      expect(getRefSpecificity("./file")).toBe(2);
      expect(getRefSpecificity("#Symbol")).toBe(1);
      expect(getRefSpecificity("unknown")).toBe(0);
    });
  });
});

describe("Round-trip tests", () => {
  it("should round-trip canonical URIs", () => {
    const original = "devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login(string,string)#L45:C10";
    const parsed = parseCanonicalURI(original);
    const formatted = formatCanonicalURI(parsed);

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
