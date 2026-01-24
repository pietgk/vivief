/**
 * URI Parser
 *
 * Parses DevAC URIs, symbol paths, and entity IDs.
 *
 * Supports:
 * - Canonical URIs: devac://workspace/repo@version/package/file#Symbol#L10:C5
 * - Entity IDs: repo:package:kind:hash
 * - Symbol paths: #Class.method(), .function()
 * - Locations: #L10, #L10:C5, #L10-L20
 */

import type {
  CanonicalURI,
  EntityID,
  Location,
  SymbolPath,
  SymbolSegment,
} from "./types.js";
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
 * Format: devac://workspace/repo[@version]/package/file[#symbol][#location]
 *
 * @example
 * ```typescript
 * const uri = parseCanonicalURI("devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login()#L45");
 * // {
 * //   workspace: "mindlercare",
 * //   repo: "app",
 * //   version: "main",
 * //   package: "packages/core",
 * //   file: "src/auth.ts",
 * //   symbol: { segments: [...] },
 * //   location: { line: 45 }
 * // }
 * ```
 */
export function parseCanonicalURI(uri: string): CanonicalURI {
  if (!uri.startsWith(URI_SCHEME)) {
    throw new URIParseError(`URI must start with ${URI_SCHEME}`, uri);
  }

  // Remove scheme
  let remaining = uri.slice(URI_SCHEME.length);

  // Extract location fragment if present (last #L... pattern)
  // Handles formats: #L10, #L10:C5, #L10:5, #L10-L20, #L10:C5-L20:C15
  let location: Location | undefined;
  const locationMatch = remaining.match(/#(L\d+(?::C?\d+)?(?:-L?\d+(?::C?\d+)?)?)$/);
  if (locationMatch && locationMatch[1]) {
    location = parseLocation(locationMatch[1]);
    remaining = remaining.slice(0, -locationMatch[0].length);
  }

  // Extract symbol path if present (first # that's not a location)
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
    throw new URIParseError("URI must have at least a workspace", uri);
  }

  // First part is workspace
  const workspace = parts[0]!;

  if (parts.length < 2) {
    // Workspace-only URI
    return { workspace, repo: "", package: ROOT_PACKAGE };
  }

  // Second part is repo[@version]
  let repo = parts[1]!;
  let version: string | undefined;

  const atIndex = repo.indexOf("@");
  if (atIndex !== -1) {
    version = repo.slice(atIndex + 1);
    repo = repo.slice(0, atIndex);
  }

  if (parts.length < 3) {
    // Repo-level URI
    return { workspace, repo, version, package: ROOT_PACKAGE };
  }

  // Find where package ends and file begins
  // Package paths don't have file extensions, files do
  // Also, "." means root package
  let packagePath = ROOT_PACKAGE;
  let file: string | undefined;

  // Skip workspace and repo
  const pathParts = parts.slice(2);

  const firstPathPart = pathParts[0];
  if (pathParts.length > 0 && firstPathPart === ROOT_PACKAGE) {
    // Explicit root package: devac://ws/repo/./src/file.ts
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
    workspace,
    repo,
    version,
    package: packagePath,
    file,
    symbol,
    location,
  };
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
 * Parse a location string
 *
 * Formats:
 * - L10 - line only
 * - L10:C5 - line and column
 * - L10-L20 or L10-20 - line range
 * - L10:C5-L20:C10 - full range
 *
 * @example
 * ```typescript
 * parseLocation("L10");        // { line: 10 }
 * parseLocation("L10:C5");     // { line: 10, column: 5 }
 * parseLocation("L10-L20");    // { line: 10, endLine: 20 }
 * parseLocation("L10:C5-L20:C10"); // { line: 10, column: 5, endLine: 20, endColumn: 10 }
 * ```
 */
export function parseLocation(loc: string): Location {
  // Remove leading L if present
  let s = loc.startsWith("L") ? loc.slice(1) : loc;

  // Check for range
  const rangeSep = s.indexOf("-");
  if (rangeSep !== -1) {
    const start = s.slice(0, rangeSep);
    let end = s.slice(rangeSep + 1);

    // End might have L prefix
    if (end.startsWith("L")) {
      end = end.slice(1);
    }

    const startLoc = parseLocationPart(start);
    const endLoc = parseLocationPart(end);

    return {
      line: startLoc.line,
      column: startLoc.column,
      endLine: endLoc.line,
      endColumn: endLoc.column,
    };
  }

  // Single location
  return parseLocationPart(s);
}

/**
 * Parse a single location part (line or line:column)
 */
function parseLocationPart(s: string): { line: number; column?: number } {
  const colonIndex = s.indexOf(":");
  if (colonIndex !== -1) {
    // Line and column
    let colStr = s.slice(colonIndex + 1);
    // Remove C prefix if present
    if (colStr.startsWith("C")) {
      colStr = colStr.slice(1);
    }

    const line = parseInt(s.slice(0, colonIndex), 10);
    const column = parseInt(colStr, 10);

    if (isNaN(line) || isNaN(column)) {
      throw new URIParseError("Invalid location format", s);
    }

    return { line, column };
  }

  // Line only
  const line = parseInt(s, 10);
  if (isNaN(line)) {
    throw new URIParseError("Invalid line number", s);
  }

  return { line };
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
 * Check if a string is a relative reference
 */
export function isRelativeRef(s: string): boolean {
  return s.startsWith("#") || s.startsWith("./") || s.startsWith("../");
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
): { type: "canonical"; uri: CanonicalURI } | { type: "entity"; id: EntityID } | { type: "relative"; ref: string } | { type: "symbol"; path: SymbolPath } | { type: "unknown"; input: string } {
  if (isCanonicalURI(s)) {
    try {
      return { type: "canonical", uri: parseCanonicalURI(s) };
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

  if (s.startsWith("./") || s.startsWith("../")) {
    return { type: "relative", ref: s };
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
