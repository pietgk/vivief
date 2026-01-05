/**
 * Hierarchical Effect Mapping Loader
 *
 * Loads and merges effect mappings from three levels:
 * 1. Package-level (.devac/effect-mappings.ts) - most specific
 * 2. Repo-level (.devac/effect-mappings.ts) - shared patterns
 * 3. Workspace-level (.devac/effect-mappings.ts) - global defaults
 *
 * More specific levels override less specific levels.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  CodeEffect,
  FunctionCallEffect,
  PackageEffectMappings,
  RetrieveEffectMapping,
  SendEffectMapping,
  StoreEffectMapping,
} from "../types/effects.js";
import {
  createRetrieveEffect,
  createSendEffect,
  createStoreEffect,
  findRetrieveMapping,
  findSendMapping,
  findStoreMapping,
} from "../types/effects.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Level of effect mapping source
 */
export type MappingLevel = "package" | "repo" | "workspace";

/**
 * Source of loaded mappings
 */
export interface MappingSource {
  level: MappingLevel;
  path: string;
}

/**
 * Result of loading and merging effect mappings
 */
export interface MappingResolutionResult {
  /** Merged mappings from all levels */
  mappings: PackageEffectMappings;
  /** Sources that contributed to the final mappings */
  sources: MappingSource[];
  /** Whether any mappings were found */
  hasMappings: boolean;
}

/**
 * Options for loading mappings
 */
export interface LoadMappingsOptions {
  /** Package path (required) */
  packagePath: string;
  /** Repository root path (optional, for repo-level mappings) */
  repoPath?: string;
  /** Workspace root path (optional, for workspace-level mappings) */
  workspacePath?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Relative path to effect mappings file within a directory
 */
const MAPPINGS_FILE_PATH = ".devac/effect-mappings.ts";

/**
 * Empty mappings template
 */
function createEmptyMappings(packageName = "unknown"): PackageEffectMappings {
  return {
    metadata: {
      package_name: packageName,
      verified: false,
    },
    store_operations: [],
    retrieve_operations: [],
    external_calls: [],
    request_handlers: [],
    groups: [],
  };
}

// =============================================================================
// Loading Functions
// =============================================================================

/**
 * Load effect mappings from a TypeScript file
 *
 * The file should export an `effectMappings` constant of type PackageEffectMappings.
 */
async function loadMappingsFromFile(filePath: string): Promise<PackageEffectMappings | null> {
  try {
    // Check if file exists
    await fs.access(filePath);

    // Read and parse the TypeScript file
    const content = await fs.readFile(filePath, "utf-8");

    // Parse the TypeScript to extract mappings
    // We use a simple regex-based approach to extract the object literal
    // A more robust solution would use ts-morph or babel parser
    const mappings = parseEffectMappingsTs(content);

    return mappings;
  } catch {
    // File doesn't exist or couldn't be read
    return null;
  }
}

/**
 * Parse effect mappings from TypeScript content
 *
 * This is a simplified parser that extracts the effectMappings export.
 * For production, consider using ts-morph for more robust parsing.
 */
function parseEffectMappingsTs(content: string): PackageEffectMappings | null {
  try {
    // Look for exported effectMappings
    // Pattern: export const effectMappings: PackageEffectMappings = { ... }

    // Simple approach: find the object literal and parse it
    // This handles basic cases but may need enhancement for complex scenarios

    const storeOps = extractMappingArray<StoreEffectMapping>(content, "store_operations");
    const retrieveOps = extractMappingArray<RetrieveEffectMapping>(content, "retrieve_operations");
    const externalCalls = extractMappingArray<SendEffectMapping>(content, "external_calls");

    // Extract metadata
    const packageNameMatch = content.match(/package_name:\s*["']([^"']+)["']/);
    const packageName = packageNameMatch?.[1] ?? "unknown";

    const verifiedMatch = content.match(/verified:\s*(true|false)/);
    const verified = verifiedMatch?.[1] === "true";

    return {
      metadata: {
        package_name: packageName,
        verified,
      },
      store_operations: storeOps,
      retrieve_operations: retrieveOps,
      external_calls: externalCalls,
      request_handlers: [],
      groups: [],
    };
  } catch {
    return null;
  }
}

/**
 * Extract a mapping array from TypeScript content
 */
function extractMappingArray<T>(content: string, arrayName: string): T[] {
  // Find the array in the content
  const arrayPattern = new RegExp(`${arrayName}:\\s*\\[([\\s\\S]*?)\\](?=,|\\s*\\}|\\s*$)`, "m");
  const match = content.match(arrayPattern);

  if (!match || !match[1]) {
    return [];
  }

  // Parse individual objects from the array
  const arrayContent = match[1];
  const objects: T[] = [];

  // Match object literals
  const objectPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let objectMatch = objectPattern.exec(arrayContent);

  while (objectMatch !== null) {
    try {
      const obj = parseObjectLiteral<T>(objectMatch[1] ?? "");
      if (obj) {
        objects.push(obj);
      }
    } catch {
      // Skip malformed objects
    }
    objectMatch = objectPattern.exec(arrayContent);
  }

  return objects;
}

/**
 * Parse an object literal string into an object
 */
function parseObjectLiteral<T>(content: string): T | null {
  try {
    // Extract key-value pairs
    const obj: Record<string, unknown> = {};

    // Match pattern: key: value or "key": value
    const propPattern = /["']?(\w+)["']?\s*:\s*(?:"([^"]*?)"|'([^']*?)'|(\w+)|(\d+))/g;
    let propMatch = propPattern.exec(content);

    while (propMatch !== null) {
      const key = propMatch[1];
      const value = propMatch[2] ?? propMatch[3] ?? propMatch[4] ?? propMatch[5];

      if (key && value !== undefined) {
        // Convert boolean strings
        if (value === "true") {
          obj[key] = true;
        } else if (value === "false") {
          obj[key] = false;
        } else if (!Number.isNaN(Number(value)) && value.match(/^\d+$/)) {
          obj[key] = Number(value);
        } else {
          obj[key] = value;
        }
      }
      propMatch = propPattern.exec(content);
    }

    return Object.keys(obj).length > 0 ? (obj as T) : null;
  } catch {
    return null;
  }
}

// =============================================================================
// Merging Functions
// =============================================================================

/**
 * Merge two mapping arrays, with later mappings taking precedence
 *
 * Mappings are merged by pattern - if the same pattern exists in both arrays,
 * the one from the more specific level (package > repo > workspace) wins.
 */
function mergeMappingArrays<T extends { pattern: string }>(base: T[], override: T[]): T[] {
  // Create a map of patterns from base
  const patternMap = new Map<string, T>();

  for (const mapping of base) {
    patternMap.set(mapping.pattern, mapping);
  }

  // Override with more specific mappings
  for (const mapping of override) {
    patternMap.set(mapping.pattern, mapping);
  }

  return Array.from(patternMap.values());
}

/**
 * Merge two PackageEffectMappings, with override taking precedence
 */
function mergeMappings(
  base: PackageEffectMappings,
  override: PackageEffectMappings
): PackageEffectMappings {
  return {
    metadata: {
      package_name: override.metadata.package_name || base.metadata.package_name,
      last_updated: override.metadata.last_updated || base.metadata.last_updated,
      verified: override.metadata.verified || base.metadata.verified,
    },
    store_operations: mergeMappingArrays(base.store_operations, override.store_operations),
    retrieve_operations: mergeMappingArrays(base.retrieve_operations, override.retrieve_operations),
    external_calls: mergeMappingArrays(base.external_calls, override.external_calls),
    request_handlers: mergeMappingArrays(base.request_handlers, override.request_handlers),
    groups: [...base.groups, ...override.groups],
  };
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Load effect mappings from package, repo, and workspace levels
 *
 * Resolution order (most specific to least specific):
 * 1. Package: <packagePath>/.devac/effect-mappings.ts
 * 2. Repo: <repoPath>/.devac/effect-mappings.ts
 * 3. Workspace: <workspacePath>/.devac/effect-mappings.ts
 *
 * Package-specific patterns override repo patterns, which override workspace patterns.
 */
export async function loadEffectMappings(
  options: LoadMappingsOptions
): Promise<MappingResolutionResult> {
  const { packagePath, repoPath, workspacePath } = options;
  const sources: MappingSource[] = [];
  let mappings = createEmptyMappings(path.basename(packagePath));

  // 1. Load workspace-level mappings (least specific)
  if (workspacePath) {
    const workspaceMappingsPath = path.join(workspacePath, MAPPINGS_FILE_PATH);
    const workspaceMappings = await loadMappingsFromFile(workspaceMappingsPath);

    if (workspaceMappings) {
      mappings = mergeMappings(mappings, workspaceMappings);
      sources.push({ level: "workspace", path: workspaceMappingsPath });
    }
  }

  // 2. Load repo-level mappings (medium specificity)
  if (repoPath && repoPath !== workspacePath) {
    const repoMappingsPath = path.join(repoPath, MAPPINGS_FILE_PATH);
    const repoMappings = await loadMappingsFromFile(repoMappingsPath);

    if (repoMappings) {
      mappings = mergeMappings(mappings, repoMappings);
      sources.push({ level: "repo", path: repoMappingsPath });
    }
  }

  // 3. Load package-level mappings (most specific)
  const packageMappingsPath = path.join(packagePath, MAPPINGS_FILE_PATH);
  const packageMappings = await loadMappingsFromFile(packageMappingsPath);

  if (packageMappings) {
    mappings = mergeMappings(mappings, packageMappings);
    sources.push({ level: "package", path: packageMappingsPath });
  }

  return {
    mappings,
    sources,
    hasMappings: sources.length > 0,
  };
}

/**
 * Apply effect mappings to classify raw FunctionCall effects
 *
 * Takes raw FunctionCall effects from the parser and applies effect mappings
 * to classify them into more specific effect types (Store, Retrieve, Send).
 *
 * Effects that don't match any mapping pattern remain as FunctionCall effects.
 */
export function applyMappings(
  rawEffects: CodeEffect[],
  mappings: PackageEffectMappings
): CodeEffect[] {
  const result: CodeEffect[] = [];

  for (const effect of rawEffects) {
    // Only process FunctionCall effects for classification
    if (effect.effect_type !== "FunctionCall") {
      result.push(effect);
      continue;
    }

    const functionCall = effect as FunctionCallEffect;
    const calleeName = functionCall.callee_name;

    // Try to match against Store patterns
    const storeMapping = findStoreMapping(calleeName, mappings.store_operations);
    if (storeMapping) {
      result.push(
        createStoreEffect({
          source_entity_id: functionCall.source_entity_id,
          source_file_path: functionCall.source_file_path,
          source_line: functionCall.source_line,
          source_column: functionCall.source_column,
          branch: functionCall.branch,
          store_type: storeMapping.store_type,
          operation: storeMapping.operation as
            | "insert"
            | "update"
            | "upsert"
            | "delete"
            | "write"
            | "publish",
          target_resource: storeMapping.target ?? calleeName,
          provider: storeMapping.provider,
          properties: {
            ...functionCall.properties,
            original_callee: calleeName,
            mapping_pattern: storeMapping.pattern,
          },
        })
      );
      continue;
    }

    // Try to match against Retrieve patterns
    const retrieveMapping = findRetrieveMapping(calleeName, mappings.retrieve_operations);
    if (retrieveMapping) {
      result.push(
        createRetrieveEffect({
          source_entity_id: functionCall.source_entity_id,
          source_file_path: functionCall.source_file_path,
          source_line: functionCall.source_line,
          source_column: functionCall.source_column,
          branch: functionCall.branch,
          retrieve_type: retrieveMapping.retrieve_type,
          operation: retrieveMapping.operation as
            | "select"
            | "get"
            | "read"
            | "fetch"
            | "receive"
            | "scan"
            | "query",
          target_resource: retrieveMapping.target ?? calleeName,
          provider: retrieveMapping.provider,
          properties: {
            ...functionCall.properties,
            original_callee: calleeName,
            mapping_pattern: retrieveMapping.pattern,
          },
        })
      );
      continue;
    }

    // Try to match against Send patterns
    const sendMapping = findSendMapping(calleeName, mappings.external_calls);
    if (sendMapping) {
      // Map "external" to "http" since SendEffect doesn't support "external" as a type
      // "external" in mappings indicates a generic external call, defaulting to HTTP semantics
      const sendType = sendMapping.send_type === "external" ? "http" : sendMapping.send_type;

      result.push(
        createSendEffect({
          source_entity_id: functionCall.source_entity_id,
          source_file_path: functionCall.source_file_path,
          source_line: functionCall.source_line,
          source_column: functionCall.source_column,
          branch: functionCall.branch,
          send_type: sendType,
          target: calleeName,
          is_third_party: sendMapping.is_third_party,
          service_name: sendMapping.service,
          properties: {
            ...functionCall.properties,
            original_callee: calleeName,
            mapping_pattern: sendMapping.pattern,
          },
        })
      );
      continue;
    }

    // No mapping found - keep as FunctionCall
    result.push(functionCall);
  }

  return result;
}

/**
 * Check if effect mappings exist for a package
 */
export async function hasMappings(packagePath: string): Promise<boolean> {
  const mappingsPath = path.join(packagePath, MAPPINGS_FILE_PATH);
  try {
    await fs.access(mappingsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to effect mappings file for a level
 */
export function getMappingsPath(basePath: string): string {
  return path.join(basePath, MAPPINGS_FILE_PATH);
}
