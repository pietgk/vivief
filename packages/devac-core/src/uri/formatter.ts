/**
 * URI Formatter
 *
 * Formats DevAC URIs, symbol paths, and entity IDs to strings.
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
 * Format a canonical URI to string
 *
 * @example
 * ```typescript
 * formatCanonicalURI({
 *   workspace: "mindlercare",
 *   repo: "app",
 *   version: "main",
 *   package: "packages/core",
 *   file: "src/auth.ts",
 *   symbol: { segments: [{ kind: "type", name: "AuthService" }] },
 *   location: { line: 45 }
 * });
 * // "devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService#L45"
 * ```
 */
export function formatCanonicalURI(uri: CanonicalURI): string {
  const parts: string[] = [URI_SCHEME];

  // Workspace
  parts.push(uri.workspace);

  // Repo with optional version
  if (uri.repo) {
    parts.push("/");
    parts.push(uri.repo);
    if (uri.version) {
      parts.push("@");
      parts.push(uri.version);
    }
  }

  // Package
  if (uri.package && uri.package !== ROOT_PACKAGE) {
    parts.push("/");
    parts.push(uri.package);
  } else if (uri.file) {
    // Root package with file - need explicit ./
    parts.push("/");
    parts.push(ROOT_PACKAGE);
  }

  // File
  if (uri.file) {
    parts.push("/");
    parts.push(uri.file);
  }

  // Symbol
  if (uri.symbol) {
    parts.push(formatSymbolPath(uri.symbol));
  }

  // Location
  if (uri.location) {
    parts.push("#");
    parts.push(formatLocation(uri.location));
  }

  return parts.join("");
}

/**
 * Format an entity ID to string
 *
 * @example
 * ```typescript
 * formatEntityID({
 *   repo: "app",
 *   package: "packages/core",
 *   kind: "class",
 *   hash: "a1b2c3d4"
 * });
 * // "app:packages/core:class:a1b2c3d4"
 * ```
 */
export function formatEntityID(id: EntityID): string {
  return [id.repo, id.package, id.kind, id.hash].join(ENTITY_ID_SEPARATOR);
}

/**
 * Format a symbol path to string
 *
 * @example
 * ```typescript
 * formatSymbolPath({
 *   segments: [
 *     { kind: "type", name: "AuthService" },
 *     { kind: "term", name: "login", isMethod: true, params: ["string", "string"] }
 *   ]
 * });
 * // "#AuthService.login(string,string)"
 * ```
 */
export function formatSymbolPath(path: SymbolPath): string {
  return path.segments.map(formatSymbolSegment).join("");
}

/**
 * Format a single symbol segment
 */
export function formatSymbolSegment(segment: SymbolSegment): string {
  const prefix = segment.kind === "type" ? "#" : ".";
  let result = prefix + segment.name;

  if (segment.isMethod) {
    result += "(";
    if (segment.params && segment.params.length > 0) {
      result += segment.params.join(",");
    }
    result += ")";
  }

  return result;
}

/**
 * Format a location to string
 *
 * @example
 * ```typescript
 * formatLocation({ line: 10 });                    // "L10"
 * formatLocation({ line: 10, column: 5 });         // "L10:C5"
 * formatLocation({ line: 10, endLine: 20 });       // "L10-L20"
 * formatLocation({ line: 10, column: 5, endLine: 20, endColumn: 10 });  // "L10:C5-L20:C10"
 * ```
 */
export function formatLocation(loc: Location): string {
  let result = `L${loc.line}`;

  if (loc.column !== undefined) {
    result += `:C${loc.column}`;
  }

  if (loc.endLine !== undefined) {
    result += `-L${loc.endLine}`;
    if (loc.endColumn !== undefined) {
      result += `:C${loc.endColumn}`;
    }
  }

  return result;
}

/**
 * Create a canonical URI from components
 *
 * Convenience function that validates inputs and constructs a URI.
 */
export function createCanonicalURI(params: {
  workspace: string;
  repo?: string;
  version?: string;
  package?: string;
  file?: string;
  symbolName?: string;
  symbolKind?: "type" | "term";
  isMethod?: boolean;
  params?: string[];
  line?: number;
  column?: number;
}): CanonicalURI {
  const uri: CanonicalURI = {
    workspace: params.workspace,
    repo: params.repo || "",
    package: params.package || ROOT_PACKAGE,
  };

  if (params.version) {
    uri.version = params.version;
  }

  if (params.file) {
    uri.file = params.file;
  }

  if (params.symbolName) {
    uri.symbol = {
      segments: [
        {
          kind: params.symbolKind || "term",
          name: params.symbolName,
          isMethod: params.isMethod,
          params: params.params,
        },
      ],
    };
  }

  if (params.line !== undefined) {
    uri.location = { line: params.line };
    if (params.column !== undefined) {
      uri.location.column = params.column;
    }
  }

  return uri;
}

/**
 * Create an entity ID from components
 */
export function createEntityID(params: {
  repo: string;
  package?: string;
  kind: string;
  hash: string;
}): EntityID {
  return {
    repo: params.repo,
    package: params.package || ROOT_PACKAGE,
    kind: params.kind,
    hash: params.hash,
  };
}

/**
 * Create a symbol path from a single segment
 */
export function createSymbolPath(
  name: string,
  kind: "type" | "term",
  options?: { isMethod?: boolean; params?: string[] }
): SymbolPath {
  return {
    segments: [
      {
        kind,
        name,
        isMethod: options?.isMethod,
        params: options?.params,
      },
    ],
  };
}

/**
 * Append a segment to a symbol path
 */
export function appendSymbolSegment(
  path: SymbolPath,
  name: string,
  kind: "type" | "term",
  options?: { isMethod?: boolean; params?: string[] }
): SymbolPath {
  return {
    segments: [
      ...path.segments,
      {
        kind,
        name,
        isMethod: options?.isMethod,
        params: options?.params,
      },
    ],
  };
}

/**
 * Get the last segment name from a symbol path
 */
export function getSymbolName(path: SymbolPath): string {
  if (path.segments.length === 0) {
    return "";
  }
  const lastSegment = path.segments[path.segments.length - 1];
  return lastSegment ? lastSegment.name : "";
}

/**
 * Get the qualified name from a symbol path (e.g., "AuthService.login")
 */
export function getQualifiedName(path: SymbolPath): string {
  return path.segments.map((s) => s.name).join(".");
}

/**
 * Build a URI string from a ParsedNode-like object
 *
 * This is a convenience function to create URIs from existing node data.
 */
export function buildURIFromNode(params: {
  workspace: string;
  repo: string;
  version?: string;
  package: string;
  filePath: string;
  name: string;
  kind: string;
  qualifiedName?: string;
  startLine?: number;
}): string {
  const uri: CanonicalURI = {
    workspace: params.workspace,
    repo: params.repo,
    version: params.version,
    package: params.package,
    file: params.filePath,
  };

  // Determine symbol kind from node kind
  const typeKinds = ["class", "interface", "type", "enum", "namespace", "module", "jsx_component"];
  const segmentKind: "type" | "term" = typeKinds.includes(params.kind) ? "type" : "term";

  // Build symbol path from qualified name
  const parts = (params.qualifiedName || params.name).split(".");
  const methodKinds = ["function", "method", "hook"];
  const isMethod = methodKinds.includes(params.kind);

  if (parts.length === 1) {
    // Simple symbol
    const symbolName = parts[0] ?? params.name;
    uri.symbol = {
      segments: [{ kind: segmentKind, name: symbolName, isMethod }],
    };
  } else {
    // Qualified symbol (e.g., Class.method)
    const segments: SymbolSegment[] = [];
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const partName = parts[i]!;
      segments.push({
        kind: isLast ? segmentKind : "type",
        name: partName,
        isMethod: isLast && isMethod,
      });
    }
    uri.symbol = { segments };
  }

  if (params.startLine !== undefined) {
    uri.location = { line: params.startLine };
  }

  return formatCanonicalURI(uri);
}
