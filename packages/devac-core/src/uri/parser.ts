/**
 * URI Parser
 *
 * Parses DevAC URIs, symbol paths, and entity IDs.
 *
 * New Format (ADR-0044 revision):
 * - Canonical URIs: devac://repo/package/file#Symbol.path?version=main&line=45
 * - Entity IDs: repo:package:kind:hash
 * - Symbol paths: #Class.method(), .function()
 *
 * Key changes from old format:
 * - No workspace in URI (inferred from context)
 * - Version moved to query param (?version=main instead of @main)
 * - Location moved to query params (?line=45&col=10 instead of #L45:C10)
 */

import type { EntityID, ParsedURI, SymbolPath, SymbolSegment, URIQueryParams } from "./types.js";
import { ENTITY_ID_SEPARATOR, ROOT_PACKAGE, URI_SCHEME } from "./types.js";

/**
 * Error thrown when parsing fails
 */
export class URIParseError extends Error {
  constructor(
    message: string,
    public readonly input: string,
    public readonly position?: number
  ) {
    super(`${message}: "${input}"${position !== undefined ? ` at position ${position}` : ""}`);
    this.name = "URIParseError";
  }
}

/**
 * Parse a canonical DevAC URI
 *
 * Format: devac://repo/package/file[#symbol][?params]
 *
 * @example
 * ```typescript
 * const result = parseCanonicalURI("devac://app/packages/core/src/auth.ts#AuthService.login()?version=main&line=45");
 * // {
 * //   uri: {
 * //     repo: "app",
 * //     package: "packages/core",
 * //     file: "src/auth.ts",
 * //     symbol: { segments: [...] },
 * //   },
 * //   params: { version: "main", line: 45 }
 * // }
 * ```
 */
export function parseCanonicalURI(uri: string): ParsedURI {
  if (!uri.startsWith(URI_SCHEME)) {
    throw new URIParseError(`URI must start with ${URI_SCHEME}`, uri);
  }

  // Remove scheme
  let remaining = uri.slice(URI_SCHEME.length);

  // Extract query params if present
  let params: URIQueryParams | undefined;
  const queryIndex = remaining.indexOf("?");
  if (queryIndex !== -1) {
    const queryString = remaining.slice(queryIndex + 1);
    params = parseQueryParams(queryString);
    remaining = remaining.slice(0, queryIndex);
  }

  // Extract symbol path if present (# that's not at the start)
  let symbol: SymbolPath | undefined;
  const symbolIndex = remaining.indexOf("#");
  if (symbolIndex !== -1) {
    const symbolStr = remaining.slice(symbolIndex);
    symbol = parseSymbolPath(symbolStr);
    remaining = remaining.slice(0, symbolIndex);
  }

  // Split path by /
  const parts = remaining.split("/").filter((p) => p.length > 0);

  if (parts.length < 1) {
    throw new URIParseError("URI must have at least a repo", uri);
  }

  // First part is repo
  const repo = parts[0]!;

  if (parts.length < 2) {
    // Repo-only URI
    return {
      uri: { repo, package: ROOT_PACKAGE },
      params,
    };
  }

  // Find where package ends and file begins
  // Package paths don't have file extensions, files do
  // Also, "." means root package
  let packagePath = ROOT_PACKAGE;
  let file: string | undefined;

  // Skip repo
  const pathParts = parts.slice(1);

  const firstPathPart = pathParts[0];
  if (pathParts.length > 0 && firstPathPart === ROOT_PACKAGE) {
    // Explicit root package: devac://repo/./src/file.ts
    packagePath = ROOT_PACKAGE;
    if (pathParts.length > 1) {
      file = pathParts.slice(1).join("/");
    }
  } else {
    // Need to determine package vs file boundary
    // Heuristic: Look for common file extensions or src/ prefix
    const fileExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".cs", ".go", ".rs", ".java"];

    let fileStartIndex = -1;
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]!;

      // Check if this part looks like a file
      if (fileExtensions.some((ext) => part.endsWith(ext))) {
        // This is definitely a file - package is everything before
        fileStartIndex = i;
        break;
      }

      // src/, lib/, test/ etc typically start file paths
      if (["src", "lib", "test", "tests", "__tests__", "dist"].includes(part)) {
        fileStartIndex = i;
        break;
      }
    }

    if (fileStartIndex === -1) {
      // No file detected - entire path is package
      packagePath = pathParts.join("/");
    } else if (fileStartIndex === 0) {
      // File starts immediately - use root package
      packagePath = ROOT_PACKAGE;
      file = pathParts.join("/");
    } else {
      // Split at boundary
      packagePath = pathParts.slice(0, fileStartIndex).join("/");
      file = pathParts.slice(fileStartIndex).join("/");
    }
  }

  return {
    uri: {
      repo,
      package: packagePath,
      file,
      symbol,
    },
    params,
  };
}

/**
 * Parse query parameters from a URI
 *
 * Supports: version, line, col, endLine, endCol
 */
export function parseQueryParams(queryString: string): URIQueryParams {
  const params: URIQueryParams = {};

  // Use simple parsing (URLSearchParams not available in all Node versions)
  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (!key || value === undefined) continue;

    const decodedKey = decodeURIComponent(key);
    const decodedValue = decodeURIComponent(value);

    switch (decodedKey) {
      case "version":
        params.version = decodedValue;
        break;
      case "line":
        params.line = Number.parseInt(decodedValue, 10);
        break;
      case "col":
        params.col = Number.parseInt(decodedValue, 10);
        break;
      case "endLine":
        params.endLine = Number.parseInt(decodedValue, 10);
        break;
      case "endCol":
        params.endCol = Number.parseInt(decodedValue, 10);
        break;
    }
  }

  return params;
}

/**
 * Parse an entity ID string
 *
 * Format: repo:package:kind:hash
 *
 * @example
 * ```typescript
 * const id = parseEntityID("app:packages/core:class:a1b2c3d4");
 * // { repo: "app", package: "packages/core", kind: "class", hash: "a1b2c3d4" }
 * ```
 */
export function parseEntityID(id: string): EntityID {
  const parts = id.split(ENTITY_ID_SEPARATOR);

  if (parts.length < 4) {
    throw new URIParseError(
      `Entity ID must have format repo${ENTITY_ID_SEPARATOR}package${ENTITY_ID_SEPARATOR}kind${ENTITY_ID_SEPARATOR}hash`,
      id
    );
  }

  // Handle package paths with colons (unlikely but possible)
  // Last two parts are always kind:hash
  const hash = parts[parts.length - 1]!;
  const kind = parts[parts.length - 2]!;
  const repo = parts[0]!;
  const pkg = parts.slice(1, -2).join(ENTITY_ID_SEPARATOR);

  return {
    repo,
    package: pkg || ROOT_PACKAGE,
    kind,
    hash,
  };
}

/**
 * Parse a symbol path string
 *
 * Format: #Type.term() or .term() or #Type
 *
 * @example
 * ```typescript
 * parseSymbolPath("#AuthService.login(string,string)");
 * // { segments: [
 * //   { kind: "type", name: "AuthService" },
 * //   { kind: "term", name: "login", isMethod: true, params: ["string", "string"] }
 * // ]}
 *
 * parseSymbolPath(".validateEmail()");
 * // { segments: [{ kind: "term", name: "validateEmail", isMethod: true }] }
 * ```
 */
export function parseSymbolPath(path: string): SymbolPath {
  if (!path.startsWith("#") && !path.startsWith(".")) {
    throw new URIParseError("Symbol path must start with # or .", path);
  }

  const segments: SymbolSegment[] = [];
  let remaining = path;

  while (remaining.length > 0) {
    // Determine kind from prefix
    let kind: "type" | "term";
    if (remaining.startsWith("#")) {
      kind = "type";
      remaining = remaining.slice(1);
    } else if (remaining.startsWith(".")) {
      kind = "term";
      remaining = remaining.slice(1);
    } else {
      break;
    }

    // Parse name (up to next delimiter: . # ( )
    let name = "";
    let isMethod = false;
    let params: string[] | undefined;

    while (remaining.length > 0) {
      const char = remaining[0];

      if (char === "(" || char === "." || char === "#") {
        break;
      }

      name += char;
      remaining = remaining.slice(1);
    }

    if (name.length === 0) {
      throw new URIParseError("Symbol segment must have a name", path);
    }

    // Check for method parentheses
    if (remaining.startsWith("(")) {
      isMethod = true;
      remaining = remaining.slice(1);

      // Parse parameters if any
      const closeIndex = remaining.indexOf(")");
      if (closeIndex === -1) {
        throw new URIParseError("Unclosed parentheses in symbol path", path);
      }

      const paramsStr = remaining.slice(0, closeIndex);
      remaining = remaining.slice(closeIndex + 1);

      if (paramsStr.length > 0) {
        params = paramsStr.split(",").map((p) => p.trim());
      }
    }

    segments.push({ kind, name, isMethod, params });
  }

  if (segments.length === 0) {
    throw new URIParseError("Symbol path must have at least one segment", path);
  }

  return { segments };
}

/**
 * Check if a string is a canonical DevAC URI
 */
export function isCanonicalURI(s: string): boolean {
  return s.startsWith(URI_SCHEME);
}

/**
 * Check if a string is an entity ID
 */
export function isEntityID(s: string): boolean {
  if (s.startsWith(URI_SCHEME)) {
    return false;
  }

  const parts = s.split(ENTITY_ID_SEPARATOR);
  return parts.length >= 4;
}

/**
 * Check if a string is a relative reference (same-file only)
 */
export function isRelativeRef(s: string): boolean {
  // Only same-file refs are supported (#Symbol or .term())
  return s.startsWith("#") || (s.startsWith(".") && !s.startsWith("./") && !s.startsWith(".."));
}

/**
 * Check if a string is a symbol path
 */
export function isSymbolPath(s: string): boolean {
  return s.startsWith("#") || (s.startsWith(".") && !s.startsWith("./") && !s.startsWith(".."));
}

/**
 * Try to parse any reference type
 *
 * Returns the type of reference detected along with the parsed result.
 */
export function detectReferenceType(
  s: string
):
  | { type: "canonical"; result: ParsedURI }
  | { type: "entity"; id: EntityID }
  | { type: "symbol"; path: SymbolPath }
  | { type: "unknown"; input: string } {
  if (isCanonicalURI(s)) {
    try {
      return { type: "canonical", result: parseCanonicalURI(s) };
    } catch {
      return { type: "unknown", input: s };
    }
  }

  if (isEntityID(s)) {
    try {
      return { type: "entity", id: parseEntityID(s) };
    } catch {
      return { type: "unknown", input: s };
    }
  }

  if (isSymbolPath(s)) {
    try {
      return { type: "symbol", path: parseSymbolPath(s) };
    } catch {
      return { type: "unknown", input: s };
    }
  }

  return { type: "unknown", input: s };
}
