/**
 * Relative Reference Handling
 *
 * Resolves and formats relative references within a context.
 *
 * SIMPLIFIED (ADR-0044 revision):
 * Only same-file references are supported:
 * - `#Symbol` - type in current file
 * - `.term()` - term in current file
 *
 * Cross-file refs like `./file#Symbol` are NO LONGER supported.
 * Use full URIs for cross-file references.
 */

import { formatCanonicalURI } from "./formatter.js";
import { URIParseError, parseCanonicalURI, parseSymbolPath } from "./parser.js";
import type { CanonicalURI, SymbolPath, URIContext } from "./types.js";
import { URI_SCHEME } from "./types.js";

/**
 * Resolve a relative reference to a canonical URI
 *
 * Only same-file references (#Symbol, .term()) are supported.
 * For cross-file references, use full URIs.
 *
 * @example
 * ```typescript
 * const context: URIContext = {
 *   repo: "app",
 *   package: "packages/core",
 *   file: "src/auth.ts"
 * };
 *
 * resolveRelativeRef("#AuthService.login()", context);
 * // { repo: "app", package: "packages/core", file: "src/auth.ts",
 * //   symbol: { segments: [...] } }
 * ```
 */
export function resolveRelativeRef(ref: string, context: URIContext): CanonicalURI {
  // Already a canonical URI? Parse directly
  if (ref.startsWith(URI_SCHEME)) {
    const parsed = parseCanonicalURI(ref);
    return parsed.uri;
  }

  // Symbol-only reference (#Symbol)
  if (ref.startsWith("#")) {
    if (!context.file) {
      throw new URIParseError("Symbol reference requires file context", ref);
    }

    const symbol = parseSymbolPath(ref);
    return {
      repo: context.repo,
      package: context.package,
      file: context.file,
      symbol,
    };
  }

  // Term-only reference (.function())
  if (ref.startsWith(".") && !ref.startsWith("./") && !ref.startsWith("..")) {
    if (!context.file) {
      throw new URIParseError("Term reference requires file context", ref);
    }

    const symbol = parseSymbolPath(ref);
    return {
      repo: context.repo,
      package: context.package,
      file: context.file,
      symbol,
    };
  }

  // Cross-file refs are no longer supported
  if (ref.startsWith("./") || ref.startsWith("../")) {
    throw new URIParseError(
      "Cross-file relative refs are not supported. Use full URIs for cross-file references",
      ref
    );
  }

  throw new URIParseError(
    "Invalid relative reference. Only same-file refs (#Symbol, .term()) are supported",
    ref
  );
}

/**
 * Convert a canonical URI to a relative reference
 *
 * Returns the shortest possible reference given the context.
 * Only same-file references are returned as relative refs.
 * All other references are returned as full URIs.
 *
 * @example
 * ```typescript
 * const uri: CanonicalURI = {
 *   repo: "app",
 *   package: "packages/core",
 *   file: "src/auth.ts",
 *   symbol: { segments: [{ kind: "type", name: "AuthService" }] }
 * };
 *
 * // Same file - return symbol only
 * toRelativeRef(uri, { repo: "app", package: "packages/core", file: "src/auth.ts" });
 * // "#AuthService"
 *
 * // Different file - return full URI
 * toRelativeRef(uri, { repo: "app", package: "packages/core", file: "src/user.ts" });
 * // "devac://app/packages/core/src/auth.ts#AuthService"
 * ```
 */
export function toRelativeRef(uri: CanonicalURI, context: URIContext): string {
  // Only same-file refs are supported
  // All other cases return full URI
  if (
    uri.repo === context.repo &&
    uri.package === context.package &&
    uri.file === context.file &&
    uri.symbol
  ) {
    // Same file - return symbol only
    return formatSymbolPathRef(uri.symbol);
  }

  // All other cases - return full URI
  return formatCanonicalURI(uri);
}

/**
 * Format a symbol path for a relative reference
 */
function formatSymbolPathRef(path: SymbolPath): string {
  return path.segments
    .map((seg) => {
      const prefix = seg.kind === "type" ? "#" : ".";
      let result = prefix + seg.name;
      if (seg.isMethod) {
        result += "(";
        if (seg.params && seg.params.length > 0) {
          result += seg.params.join(",");
        }
        result += ")";
      }
      return result;
    })
    .join("");
}

/**
 * Check if a reference is a same-file relative reference
 */
export function isRelativeRef(ref: string): boolean {
  // Only same-file refs are considered relative
  return (
    ref.startsWith("#") || (ref.startsWith(".") && !ref.startsWith("./") && !ref.startsWith(".."))
  );
}

/**
 * Get the specificity level of a reference
 *
 * Higher numbers mean more specific (closer to the symbol).
 *
 * 2 = Full canonical URI
 * 1 = Same-file symbol reference
 * 0 = Unknown
 */
export function getRefSpecificity(ref: string): number {
  if (ref.startsWith(URI_SCHEME)) {
    return 2; // Fully qualified
  }

  if (
    ref.startsWith("#") ||
    (ref.startsWith(".") && !ref.startsWith("./") && !ref.startsWith(".."))
  ) {
    return 1; // Symbol only (same-file)
  }

  return 0; // Unknown
}

/**
 * Normalize a reference to a consistent format
 *
 * Resolves and re-formats the reference to ensure consistent output.
 */
export function normalizeRef(ref: string, context: URIContext): string {
  const uri = resolveRelativeRef(ref, context);
  return toRelativeRef(uri, context);
}
