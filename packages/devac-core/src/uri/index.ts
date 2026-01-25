/**
 * URI Module - Unified Addressing Scheme for DevAC
 *
 * Single Identity Model (ADR-0044):
 * - Entity ID is THE identity (repo:package:kind:hash)
 * - Canonical URIs are lookup keys that resolve to Entity IDs
 * - Relative refs are same-file only (#Symbol)
 *
 * URI Format: devac://repo/package/file#Symbol?version=main&line=45
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
 * const { uri, params } = parseCanonicalURI(
 *   "devac://app/packages/core/src/auth.ts#AuthService.login()?version=main&line=45"
 * );
 *
 * // Format back to string
 * const str = formatCanonicalURI(uri, params);
 *
 * // Resolve same-file relative reference
 * const context = { repo: "app", package: "packages/core", file: "src/user.ts" };
 * const resolved = resolveRelativeRef("#UserService", context);
 *
 * // Convert to shortest relative form (same-file only)
 * const relative = toRelativeRef(uri, context);
 * ```
 *
 * @module
 */

// Types
export type {
  CanonicalURI,
  EntityID,
  Location,
  ParsedURI,
  ParsedURIResult,
  SymbolIndex,
  SymbolIndexEntry,
  URIQueryParams,
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
  locationToQueryParams,
  parseCanonicalURI,
  parseEntityID,
  parseLocation,
  parseQueryParams,
  parseSymbolPath,
  queryParamsToLocation,
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
  formatQueryParams,
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
