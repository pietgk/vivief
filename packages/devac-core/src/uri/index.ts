/**
 * URI Module - Unified Addressing Scheme for DevAC
 *
 * This module provides a consistent way to reference code artifacts:
 * - Canonical URIs: Human-readable `devac://workspace/repo@version/package/file#Symbol`
 * - Entity IDs: Stable internal `repo:package:kind:hash`
 * - Relative refs: Context-dependent shorthand `#Symbol`, `./file#Symbol`
 *
 * See ADR-0044 for design rationale.
 *
 * @example
 * ```typescript
 * import {
 *   parseCanonicalURI,
 *   formatCanonicalURI,
 *   resolveRelativeRef,
 *   toRelativeRef,
 * } from "@pietgk/devac-core/uri";
 *
 * // Parse a full URI
 * const uri = parseCanonicalURI("devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login()");
 *
 * // Format back to string
 * const str = formatCanonicalURI(uri);
 *
 * // Resolve relative reference
 * const context = { workspace: "mindlercare", repo: "app", package: "packages/core", file: "src/user.ts" };
 * const resolved = resolveRelativeRef("./auth.ts#AuthService", context);
 *
 * // Convert to shortest relative form
 * const relative = toRelativeRef(uri, context);
 * // "../auth.ts#AuthService"
 * ```
 *
 * @module
 */

// Types
export type {
  CanonicalURI,
  EntityID,
  Location,
  ParsedURIResult,
  SymbolIndex,
  SymbolIndexEntry,
  URISymbolKind,
  SymbolPath,
  SymbolSegment,
  URIContext,
} from "./types.js";

export {
  ENTITY_ID_SEPARATOR,
  KIND_TO_SEGMENT,
  METHOD_KINDS,
  ROOT_PACKAGE,
  URI_SCHEME,
} from "./types.js";

// Parser
export {
  detectReferenceType,
  isCanonicalURI,
  isEntityID,
  isRelativeRef as isRelativeRefString,
  isSymbolPath,
  parseCanonicalURI,
  parseEntityID,
  parseLocation,
  parseSymbolPath,
  URIParseError,
} from "./parser.js";

// Formatter
export {
  appendSymbolSegment,
  buildURIFromNode,
  createCanonicalURI,
  createEntityID,
  createSymbolPath,
  formatCanonicalURI,
  formatEntityID,
  formatLocation,
  formatSymbolPath,
  formatSymbolSegment,
  getQualifiedName,
  getSymbolName,
} from "./formatter.js";

// Resolver
export {
  buildURIFromParts,
  createSymbolIndexEntry,
  entityIdsEqual,
  getParentURI,
  getURIDepth,
  getURIFromEntityID,
  InMemorySymbolIndex,
  resolveURIToEntityID,
  symbolPathsEqual,
  uriMatchesContext,
  urisEqual,
} from "./resolver.js";

// Relative references
export {
  getRefSpecificity,
  isRelativeRef,
  normalizeRef,
  resolveRelativeRef,
  toRelativeRef,
} from "./relative.js";
