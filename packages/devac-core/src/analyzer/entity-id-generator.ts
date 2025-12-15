/**
 * Entity ID Generator
 *
 * Generates globally unique entity IDs for code symbols.
 * Based on DevAC v2.0 spec Section 4.4.
 *
 * Entity ID format: {repo}:{package_path}:{kind}:{scope_hash}
 * Where scope_hash = sha256(filePath + scopedName + kind).slice(0, 8)
 */

import * as crypto from "node:crypto";

/**
 * Components required to generate an entity ID
 */
export interface EntityIdComponents {
  /** Repository name */
  repo: string;
  /** Package path relative to repo root */
  packagePath: string;
  /** Node kind (function, class, method, etc.) */
  kind: string;
  /** File path relative to package root */
  filePath: string;
  /** Scoped name of the symbol */
  scopedName: string;
}

/**
 * Parsed entity ID components
 */
export interface ParsedEntityId {
  repo: string;
  packagePath: string;
  kind: string;
  scopeHash: string;
}

/**
 * Generate a globally unique entity ID
 *
 * Format: {repo}:{package_path}:{kind}:{scope_hash}
 *
 * @param components - Entity ID components
 * @returns Globally unique entity ID
 */
export function generateEntityId(components: EntityIdComponents): string {
  const { repo, packagePath, kind, filePath, scopedName } = components;

  // Normalize all components
  const normalizedRepo = normalizeComponent(repo);
  const normalizedPackagePath = normalizePathComponent(packagePath);
  const normalizedKind = normalizeComponent(kind);

  // Generate scope hash
  const scopeHash = generateScopeHash(filePath, scopedName, kind);

  // Concatenate with colon separator
  return `${normalizedRepo}:${normalizedPackagePath}:${normalizedKind}:${scopeHash}`;
}

/**
 * Generate a scope hash from file path, scoped name, and kind
 *
 * Per spec: scope_hash = sha256(filePath + scopedName + kind).slice(0, 8)
 *
 * @param filePath - Relative file path
 * @param scopedName - Scoped name of the symbol
 * @param kind - Node kind
 * @returns 8-character hex hash
 */
export function generateScopeHash(filePath: string, scopedName: string, kind: string): string {
  // Normalize inputs per spec
  const normalizedFilePath = normalizePathComponent(filePath);
  const normalizedScopedName = normalizeComponent(scopedName);
  const normalizedKind = normalizeComponent(kind);

  // Combine with null separator to avoid collisions
  const combined = [normalizedFilePath, normalizedScopedName, normalizedKind].join("\x00");

  const hash = crypto.createHash("sha256");
  hash.update(combined, "utf8");
  return hash.digest("hex").slice(0, 8);
}

/**
 * Normalize a string component for entity ID
 *
 * Per spec:
 * - UTF-8 normalized (NFC form)
 * - Whitespace trimmed
 * - Case preserved
 */
export function normalizeComponent(value: string): string {
  return value.normalize("NFC").trim();
}

/**
 * Normalize a path component for entity ID
 *
 * Per spec:
 * - Convert path separators to forward slash
 * - UTF-8 normalized (NFC form)
 * - Whitespace trimmed
 */
export function normalizePathComponent(pathValue: string): string {
  return pathValue.replace(/\\/g, "/").normalize("NFC").trim();
}

/**
 * Parse an entity ID into its components
 *
 * @param entityId - Entity ID string
 * @returns Parsed components or null if invalid
 */
export function parseEntityId(entityId: string): ParsedEntityId | null {
  const parts = entityId.split(":");

  if (parts.length < 4) {
    return null;
  }

  // Handle case where package path contains colons (unlikely but possible)
  const repo = parts[0] ?? "";
  const scopeHash = parts[parts.length - 1] ?? "";
  const kind = parts[parts.length - 2] ?? "";
  const packagePath = parts.slice(1, parts.length - 2).join(":");

  return {
    repo,
    packagePath,
    kind,
    scopeHash,
  };
}

/**
 * Validate an entity ID format
 *
 * @param entityId - Entity ID to validate
 * @returns true if valid format
 */
export function isValidEntityId(entityId: string): boolean {
  const parsed = parseEntityId(entityId);
  if (!parsed) return false;

  // Check scope hash is 8 hex characters
  if (!/^[0-9a-f]{8}$/.test(parsed.scopeHash)) {
    return false;
  }

  // Check required components are non-empty
  if (!parsed.repo || !parsed.kind) {
    return false;
  }

  return true;
}

/**
 * Check if two entity IDs refer to the same entity
 * (ignoring branch differences)
 */
export function entityIdsMatch(id1: string, id2: string): boolean {
  return id1 === id2;
}

/**
 * Extract the repository name from an entity ID
 */
export function getRepoFromEntityId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  return parsed?.repo ?? null;
}

/**
 * Extract the package path from an entity ID
 */
export function getPackagePathFromEntityId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  return parsed?.packagePath ?? null;
}

/**
 * Extract the kind from an entity ID
 */
export function getKindFromEntityId(entityId: string): string | null {
  const parsed = parseEntityId(entityId);
  return parsed?.kind ?? null;
}

/**
 * Create an entity ID generator bound to a specific repo and package
 */
export function createEntityIdGenerator(
  repo: string,
  packagePath: string
): (kind: string, filePath: string, scopedName: string) => string {
  const normalizedRepo = normalizeComponent(repo);
  const normalizedPackagePath = normalizePathComponent(packagePath);

  return (kind: string, filePath: string, scopedName: string): string => {
    const normalizedKind = normalizeComponent(kind);
    const scopeHash = generateScopeHash(filePath, scopedName, kind);
    return `${normalizedRepo}:${normalizedPackagePath}:${normalizedKind}:${scopeHash}`;
  };
}

/**
 * Generate entity IDs for multiple symbols in a file
 *
 * @param repo - Repository name
 * @param packagePath - Package path
 * @param filePath - File path relative to package
 * @param symbols - Array of { kind, scopedName } for each symbol
 * @returns Map of scoped name to entity ID
 */
export function generateEntityIdsForFile(
  repo: string,
  packagePath: string,
  filePath: string,
  symbols: Array<{ kind: string; scopedName: string }>
): Map<string, string> {
  const generator = createEntityIdGenerator(repo, packagePath);
  const result = new Map<string, string>();

  for (const symbol of symbols) {
    const entityId = generator(symbol.kind, filePath, symbol.scopedName);
    result.set(symbol.scopedName, entityId);
  }

  return result;
}

/**
 * Derive entity ID for a contained symbol (e.g., method in class)
 *
 * @param parentEntityId - Entity ID of the parent
 * @param childKind - Kind of the child symbol
 * @param childName - Name of the child symbol
 * @param filePath - File path
 * @returns Entity ID for the child
 */
export function deriveChildEntityId(
  parentEntityId: string,
  childKind: string,
  childName: string,
  filePath: string
): string {
  const parsed = parseEntityId(parentEntityId);
  if (!parsed) {
    throw new Error(`Invalid parent entity ID: ${parentEntityId}`);
  }

  // Derive scoped name from parent's scope hash and child name
  // This ensures nested symbols have stable IDs
  const scopedName = `${parsed.scopeHash}.${childName}`;

  return generateEntityId({
    repo: parsed.repo,
    packagePath: parsed.packagePath,
    kind: childKind,
    filePath,
    scopedName,
  });
}
