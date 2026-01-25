/**
 * URI Formatter
 *
 * Formats DevAC URIs, symbol paths, and entity IDs to strings.
 *
 * New Format (ADR-0044 revision):
 * - devac://repo/package/file#Symbol?version=main&line=45
 * - No workspace (inferred from context)
 * - Version and position as query params
 */

import type { CanonicalURI, EntityID, SymbolPath, SymbolSegment, URIQueryParams } from "./types.js";
import { ENTITY_ID_SEPARATOR, ROOT_PACKAGE, URI_SCHEME } from "./types.js";

/**
 * Format a canonical URI to string
 *
 * @example
 * ```typescript
 * formatCanonicalURI({
 *   repo: "app",
 *   package: "packages/core",
 *   file: "src/auth.ts",
 *   symbol: { segments: [{ kind: "type", name: "AuthService" }] },
 * }, { version: "main", line: 45 });
 * // "devac://app/packages/core/src/auth.ts#AuthService?version=main&line=45"
 * ```
 */
export function formatCanonicalURI(uri: CanonicalURI, params?: URIQueryParams): string {
  const parts: string[] = [URI_SCHEME];

  // Repo
  parts.push(uri.repo);

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

  // Query params
  if (params) {
    const queryString = formatQueryParams(params);
    if (queryString) {
      parts.push("?");
      parts.push(queryString);
    }
  }

  return parts.join("");
}

/**
 * Format query parameters to string
 *
 * @example
 * ```typescript
 * formatQueryParams({ version: "main", line: 45 });
 * // "version=main&line=45"
 * ```
 */
export function formatQueryParams(params: URIQueryParams): string {
  const pairs: string[] = [];

  if (params.version !== undefined) {
    pairs.push(`version=${encodeURIComponent(params.version)}`);
  }
  if (params.line !== undefined) {
    pairs.push(`line=${params.line}`);
  }
  if (params.col !== undefined) {
    pairs.push(`col=${params.col}`);
  }
  if (params.endLine !== undefined) {
    pairs.push(`endLine=${params.endLine}`);
  }
  if (params.endCol !== undefined) {
    pairs.push(`endCol=${params.endCol}`);
  }

  return pairs.join("&");
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
 * Create a canonical URI from components
 *
 * Convenience function that validates inputs and constructs a URI.
 */
export function createCanonicalURI(params: {
  repo: string;
  package?: string;
  file?: string;
  symbolName?: string;
  symbolKind?: "type" | "term";
  isMethod?: boolean;
  params?: string[];
}): CanonicalURI {
  const uri: CanonicalURI = {
    repo: params.repo,
    package: params.package || ROOT_PACKAGE,
  };

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
  repo: string;
  package: string;
  filePath: string;
  name: string;
  kind: string;
  qualifiedName?: string;
  startLine?: number;
  version?: string;
}): string {
  const uri: CanonicalURI = {
    repo: params.repo,
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

  // Build query params for version and line
  const queryParams: URIQueryParams = {};
  if (params.version) {
    queryParams.version = params.version;
  }
  if (params.startLine !== undefined) {
    queryParams.line = params.startLine;
  }

  return formatCanonicalURI(uri, Object.keys(queryParams).length > 0 ? queryParams : undefined);
}
