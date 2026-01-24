/**
 * Relative Reference Handling
 *
 * Resolves and formats relative references within a context.
 *
 * Relative reference types:
 * - `#Symbol` - symbol in current file
 * - `./file#Symbol` - relative file path from current package
 * - `repo@version/./file#Symbol` - repo with root package
 * - `app/packages/core/src/file#Symbol` - workspace-relative
 */

import type { CanonicalURI, SymbolPath, URIContext } from "./types.js";
import { formatCanonicalURI } from "./formatter.js";
import { parseCanonicalURI, parseSymbolPath, URIParseError } from "./parser.js";
import { ROOT_PACKAGE, URI_SCHEME } from "./types.js";

/**
 * Resolve a relative reference to a canonical URI
 *
 * @example
 * ```typescript
 * const context: URIContext = {
 *   workspace: "mindlercare",
 *   repo: "app",
 *   version: "main",
 *   package: "packages/core",
 *   file: "src/auth.ts"
 * };
 *
 * resolveRelativeRef("#AuthService.login()", context);
 * // { workspace: "mindlercare", repo: "app", version: "main",
 * //   package: "packages/core", file: "src/auth.ts",
 * //   symbol: { segments: [...] } }
 *
 * resolveRelativeRef("./src/user.ts#UserService", context);
 * // { workspace: "mindlercare", repo: "app", version: "main",
 * //   package: "packages/core", file: "src/user.ts",
 * //   symbol: { segments: [...] } }
 * ```
 */
export function resolveRelativeRef(ref: string, context: URIContext): CanonicalURI {
  // Already a canonical URI? Parse directly
  if (ref.startsWith(URI_SCHEME)) {
    return parseCanonicalURI(ref);
  }

  // Symbol-only reference (#Symbol)
  if (ref.startsWith("#")) {
    if (!context.file) {
      throw new URIParseError("Symbol reference requires file context", ref);
    }

    const symbol = parseSymbolPath(ref);
    return {
      workspace: context.workspace,
      repo: context.repo,
      version: context.version,
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
      workspace: context.workspace,
      repo: context.repo,
      version: context.version,
      package: context.package,
      file: context.file,
      symbol,
    };
  }

  // Relative path (./ or ../)
  if (ref.startsWith("./") || ref.startsWith("../")) {
    return resolveRelativePath(ref, context);
  }

  // Repo-relative path (repo@version/package/file)
  if (ref.includes("/") && !ref.includes("://")) {
    return resolveRepoRelativePath(ref, context);
  }

  throw new URIParseError("Cannot resolve reference", ref);
}

/**
 * Resolve a relative file path reference
 *
 * Format: ./file#Symbol or ../dir/file#Symbol
 */
function resolveRelativePath(ref: string, context: URIContext): CanonicalURI {
  // Extract symbol if present
  let filePath = ref;
  let symbol: SymbolPath | undefined;

  const hashIndex = ref.indexOf("#");
  if (hashIndex !== -1) {
    filePath = ref.slice(0, hashIndex);
    symbol = parseSymbolPath(ref.slice(hashIndex));
  }

  // Resolve the path relative to current file or package
  let resolvedPath: string;

  if (context.file) {
    // Resolve relative to current file's directory
    const currentDir = context.file.includes("/")
      ? context.file.slice(0, context.file.lastIndexOf("/"))
      : "";
    resolvedPath = resolvePath(currentDir, filePath);
  } else {
    // Resolve relative to package root
    resolvedPath = resolvePath("", filePath);
  }

  return {
    workspace: context.workspace,
    repo: context.repo,
    version: context.version,
    package: context.package,
    file: resolvedPath,
    symbol,
  };
}

/**
 * Resolve a repo-relative path
 *
 * Format: repo@version/package/file#Symbol
 *       or repo/package/file#Symbol
 *       or package/file#Symbol (same repo)
 */
function resolveRepoRelativePath(ref: string, context: URIContext): CanonicalURI {
  // Extract symbol if present
  let pathPart = ref;
  let symbol: SymbolPath | undefined;

  const hashIndex = ref.indexOf("#");
  if (hashIndex !== -1) {
    pathPart = ref.slice(0, hashIndex);
    symbol = parseSymbolPath(ref.slice(hashIndex));
  }

  const parts = pathPart.split("/");
  const firstPart = parts[0] ?? "";

  // Check if first part includes version (@)
  let repo: string;
  let version: string | undefined;
  let startIndex: number;

  const atIndex = firstPart.indexOf("@");
  if (atIndex !== -1) {
    // First part is repo@version
    repo = firstPart.slice(0, atIndex);
    version = firstPart.slice(atIndex + 1);
    startIndex = 1;
  } else if (firstPart !== ROOT_PACKAGE && !looksLikePackagePath(firstPart)) {
    // First part might be a repo name
    repo = firstPart;
    version = context.version;
    startIndex = 1;
  } else {
    // No repo specified, use context
    repo = context.repo;
    version = context.version;
    startIndex = 0;
  }

  // Handle remaining parts as package/file
  const remaining = parts.slice(startIndex);

  if (remaining.length === 0) {
    // Just repo, no file
    return {
      workspace: context.workspace,
      repo,
      version,
      package: ROOT_PACKAGE,
      symbol,
    };
  }

  // Check for explicit root package marker
  if (remaining[0] === ROOT_PACKAGE) {
    const file = remaining.slice(1).join("/");
    return {
      workspace: context.workspace,
      repo,
      version,
      package: ROOT_PACKAGE,
      file: file || undefined,
      symbol,
    };
  }

  // Determine package vs file boundary
  // Use same heuristics as the main parser
  const fileExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".cs", ".go", ".rs", ".java"];
  const srcDirs = ["src", "lib", "test", "tests", "__tests__", "dist"];

  let fileStartIndex = -1;
  for (let i = 0; i < remaining.length; i++) {
    const part = remaining[i]!;

    if (fileExtensions.some((ext) => part.endsWith(ext))) {
      fileStartIndex = i;
      break;
    }

    if (srcDirs.includes(part)) {
      fileStartIndex = i;
      break;
    }
  }

  let pkg: string;
  let file: string | undefined;

  if (fileStartIndex === -1) {
    // No file detected - entire path is package
    pkg = remaining.join("/");
  } else if (fileStartIndex === 0) {
    // File starts immediately - use root package
    pkg = ROOT_PACKAGE;
    file = remaining.join("/");
  } else {
    // Split at boundary
    pkg = remaining.slice(0, fileStartIndex).join("/");
    file = remaining.slice(fileStartIndex).join("/");
  }

  return {
    workspace: context.workspace,
    repo,
    version,
    package: pkg,
    file,
    symbol,
  };
}

/**
 * Check if a string looks like a package path (not a repo name)
 */
function looksLikePackagePath(s: string): boolean {
  // Package paths typically have certain patterns
  const packagePatterns = ["packages/", "libs/", "apps/", "src", "lib", "test"];
  return packagePatterns.some((p) => s.startsWith(p) || s === p.replace("/", ""));
}

/**
 * Resolve a relative path against a base path
 */
function resolvePath(base: string, relative: string): string {
  // Handle ./
  if (relative.startsWith("./")) {
    relative = relative.slice(2);
  }

  // Handle ../
  const baseParts = base ? base.split("/") : [];
  const relativeParts = relative.split("/");

  for (const part of relativeParts) {
    if (part === "..") {
      if (baseParts.length > 0) {
        baseParts.pop();
      }
    } else if (part !== "." && part !== "") {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}

/**
 * Convert a canonical URI to a relative reference
 *
 * Returns the shortest possible reference given the context.
 *
 * @example
 * ```typescript
 * const uri: CanonicalURI = {
 *   workspace: "mindlercare",
 *   repo: "app",
 *   version: "main",
 *   package: "packages/core",
 *   file: "src/auth.ts",
 *   symbol: { segments: [{ kind: "type", name: "AuthService" }] }
 * };
 *
 * // Same file - return symbol only
 * toRelativeRef(uri, { ...context, file: "src/auth.ts" });
 * // "#AuthService"
 *
 * // Same package - return file and symbol
 * toRelativeRef(uri, { ...context, file: "src/user.ts" });
 * // "./auth.ts#AuthService"
 *
 * // Different repo - return full canonical URI
 * toRelativeRef(uri, { ...context, repo: "other" });
 * // "devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService"
 * ```
 */
export function toRelativeRef(uri: CanonicalURI, context: URIContext): string {
  // Different workspace - must use full URI
  if (uri.workspace !== context.workspace) {
    return formatCanonicalURI(uri);
  }

  // Different repo - use repo-relative path
  if (uri.repo !== context.repo) {
    let result = uri.repo;
    if (uri.version) {
      result += `@${uri.version}`;
    }

    result += `/${uri.package === ROOT_PACKAGE ? ROOT_PACKAGE : uri.package}`;

    if (uri.file) {
      result += `/${uri.file}`;
    }

    if (uri.symbol) {
      result += formatSymbolPathRef(uri.symbol);
    }

    return result;
  }

  // Same repo, different package - use package path
  if (uri.package !== context.package) {
    let result = `${uri.package === ROOT_PACKAGE ? ROOT_PACKAGE : uri.package}`;

    if (uri.file) {
      result += `/${uri.file}`;
    }

    if (uri.symbol) {
      result += formatSymbolPathRef(uri.symbol);
    }

    return result;
  }

  // Same package, different file - use relative file path
  if (uri.file !== context.file) {
    let result = "";

    if (uri.file) {
      // Calculate relative path
      if (context.file) {
        const contextDir = context.file.includes("/")
          ? context.file.slice(0, context.file.lastIndexOf("/"))
          : "";
        const targetDir = uri.file.includes("/")
          ? uri.file.slice(0, uri.file.lastIndexOf("/"))
          : "";

        if (contextDir === targetDir) {
          // Same directory
          result = `./${uri.file.slice(uri.file.lastIndexOf("/") + 1)}`;
        } else {
          // Different directory - use full relative path from package root
          result = `./${uri.file}`;
        }
      } else {
        result = `./${uri.file}`;
      }
    }

    if (uri.symbol) {
      result += formatSymbolPathRef(uri.symbol);
    }

    return result;
  }

  // Same file - return symbol only
  if (uri.symbol) {
    return formatSymbolPathRef(uri.symbol);
  }

  // Same file, no symbol - return empty or minimal reference
  return `./${uri.file || ""}`;
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
 * Check if a reference is relative (not a canonical URI)
 */
export function isRelativeRef(ref: string): boolean {
  return !ref.startsWith(URI_SCHEME);
}

/**
 * Get the specificity level of a reference
 *
 * Higher numbers mean more specific (closer to the symbol).
 */
export function getRefSpecificity(ref: string): number {
  if (ref.startsWith(URI_SCHEME)) {
    return 5; // Fully qualified
  }

  // Check relative file paths BEFORE generic path check (since "./" contains "/")
  if (ref.startsWith("./") || ref.startsWith("../")) {
    return 2; // Relative file path
  }

  if (ref.includes("/")) {
    if (ref.includes("@")) {
      return 4; // Repo with version
    }
    return 3; // Repo or package path
  }

  if (ref.startsWith("#") || ref.startsWith(".")) {
    return 1; // Symbol only
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
