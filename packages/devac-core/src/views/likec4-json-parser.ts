/**
 * LikeC4 JSON Parser
 *
 * Parses LikeC4 model exported via `likec4 export json` command.
 * Used for comparing validated architecture against generated architecture
 * to compute gap metrics for the improvement loop.
 *
 * @see docs/plans/gap-metrics.md
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// =============================================================================
// Types for LikeC4 JSON Export
// =============================================================================

/**
 * Element from LikeC4 JSON export
 */
export interface LikeC4Element {
  /** Fully qualified name (e.g., "devac.core.analyzer") */
  id: string;
  /** Element kind from specification */
  kind: string;
  /** Display title */
  title: string;
  /** Optional description */
  description?: string;
  /** Technology tag */
  technology?: string;
  /** Tags */
  tags?: string[];
  /** Link to source */
  link?: string;
  /** Parent element ID */
  parent?: string;
}

/**
 * Relationship from LikeC4 JSON export
 */
export interface LikeC4Relationship {
  /** Unique ID */
  id: string;
  /** Source element ID */
  source: string;
  /** Target element ID */
  target: string;
  /** Relationship kind from specification */
  kind?: string;
  /** Label/description */
  title?: string;
  /** Technology used */
  technology?: string;
  /** Tags */
  tags?: string[];
}

/**
 * View from LikeC4 JSON export
 */
export interface LikeC4View {
  /** View ID */
  id: string;
  /** View title */
  title?: string;
  /** View description */
  description?: string;
  /** Elements included in view */
  nodes?: string[];
  /** Relationships included in view */
  edges?: string[];
}

/**
 * Full LikeC4 model from JSON export
 */
export interface LikeC4Model {
  /** All elements in the model */
  elements: LikeC4Element[];
  /** All relationships in the model */
  relationships: LikeC4Relationship[];
  /** All views in the model */
  views: LikeC4View[];
}

/**
 * Parsed model ready for comparison
 */
export interface ParsedC4Model {
  /** Container elements (top-level groupings) */
  containers: Map<string, LikeC4Element>;
  /** Component elements (within containers) */
  components: Map<string, LikeC4Element>;
  /** External system elements */
  externals: Map<string, LikeC4Element>;
  /** All relationships indexed by source */
  relationshipsBySource: Map<string, LikeC4Relationship[]>;
  /** All relationships indexed by target */
  relationshipsByTarget: Map<string, LikeC4Relationship[]>;
  /** Raw model */
  raw: LikeC4Model;
}

// =============================================================================
// JSON Export Execution
// =============================================================================

/**
 * Run `likec4 export json` on a directory and return parsed model
 *
 * @param c4Dir - Directory containing .c4 files
 * @returns Parsed LikeC4 model
 */
export async function exportLikeC4ToJson(c4Dir: string): Promise<LikeC4Model> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["likec4", "export", "json"], {
      cwd: c4Dir,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`likec4 export json failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const model = JSON.parse(stdout) as LikeC4Model;
        resolve(model);
      } catch (err) {
        reject(new Error(`Failed to parse LikeC4 JSON output: ${err}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn likec4: ${err.message}`));
    });
  });
}

// =============================================================================
// Model Parsing
// =============================================================================

/**
 * Element kinds that represent containers (top-level groupings)
 */
const CONTAINER_KINDS = new Set(["container", "system", "softwareSystem", "layer"]);

/**
 * Element kinds that represent external systems
 */
const EXTERNAL_KINDS = new Set(["external", "externalSystem", "database", "queue", "storage"]);

/**
 * Parse LikeC4 model into structured form for comparison
 *
 * @param model - Raw LikeC4 JSON model
 * @returns Parsed model with indexed lookups
 */
export function parseModel(model: LikeC4Model): ParsedC4Model {
  const containers = new Map<string, LikeC4Element>();
  const components = new Map<string, LikeC4Element>();
  const externals = new Map<string, LikeC4Element>();
  const relationshipsBySource = new Map<string, LikeC4Relationship[]>();
  const relationshipsByTarget = new Map<string, LikeC4Relationship[]>();

  // Classify elements
  for (const element of model.elements) {
    const kindLower = element.kind.toLowerCase();

    if (EXTERNAL_KINDS.has(kindLower) || element.tags?.includes("external")) {
      externals.set(element.id, element);
    } else if (CONTAINER_KINDS.has(kindLower) || !element.parent) {
      // Top-level or container-typed elements are containers
      containers.set(element.id, element);
    } else {
      // Nested elements are components
      components.set(element.id, element);
    }
  }

  // Index relationships
  for (const rel of model.relationships) {
    // By source
    const sourceRels = relationshipsBySource.get(rel.source) ?? [];
    sourceRels.push(rel);
    relationshipsBySource.set(rel.source, sourceRels);

    // By target
    const targetRels = relationshipsByTarget.get(rel.target) ?? [];
    targetRels.push(rel);
    relationshipsByTarget.set(rel.target, targetRels);
  }

  return {
    containers,
    components,
    externals,
    relationshipsBySource,
    relationshipsByTarget,
    raw: model,
  };
}

// =============================================================================
// File-based Parsing
// =============================================================================

/**
 * Parse a .c4 file or directory into a structured model
 *
 * @param c4Path - Path to .c4 file or directory containing .c4 files
 * @returns Parsed C4 model
 */
export async function parseLikeC4(c4Path: string): Promise<ParsedC4Model> {
  const model = await exportLikeC4ToJson(c4Path);
  return parseModel(model);
}

/**
 * Parse both validated and generated .c4 files from a package
 *
 * Each subdirectory (generated/, validated/) is a separate LikeC4 project
 * with its own spec.c4 and likec4.config.json.
 *
 * @param packagePath - Path to package (e.g., packages/devac-core)
 * @returns Both parsed models for comparison
 */
export async function parsePackageC4Files(
  packagePath: string
): Promise<{ validated: ParsedC4Model | null; generated: ParsedC4Model | null }> {
  const c4Dir = path.join(packagePath, "docs", "c4");
  const validatedDir = path.join(c4Dir, "validated");
  const generatedDir = path.join(c4Dir, "generated");

  let validated: ParsedC4Model | null = null;
  let generated: ParsedC4Model | null = null;

  // Parse validated directory as a complete LikeC4 project
  if (await c4DirExists(validatedDir)) {
    try {
      validated = await parseLikeC4(validatedDir);
    } catch {
      validated = null;
    }
  }

  // Parse generated directory as a complete LikeC4 project
  if (await c4DirExists(generatedDir)) {
    try {
      generated = await parseLikeC4(generatedDir);
    } catch {
      generated = null;
    }
  }

  return { validated, generated };
}

/**
 * Check if a directory exists
 */
async function c4DirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get container ID for an element (finds parent container)
 */
export function getContainerId(element: LikeC4Element, model: ParsedC4Model): string | null {
  if (model.containers.has(element.id)) {
    return element.id;
  }

  let current = element;
  while (current.parent) {
    if (model.containers.has(current.parent)) {
      return current.parent;
    }
    const parent = model.raw.elements.find((e) => e.id === current.parent);
    if (!parent) break;
    current = parent;
  }

  return null;
}

/**
 * Get all components within a container
 */
export function getContainerComponents(containerId: string, model: ParsedC4Model): LikeC4Element[] {
  const components: LikeC4Element[] = [];

  for (const component of model.components.values()) {
    if (getContainerId(component, model) === containerId) {
      components.push(component);
    }
  }

  return components;
}
