/**
 * C4 Doc Generator - Generate C4 PlantUML documentation with metadata
 *
 * Wraps the C4 generator functions to produce documentation files
 * with embedded metadata for change detection and verification tracking.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 *
 * IMPORTANT: LikeC4 merges all .c4 files in a directory into a single model.
 * To avoid duplicate definition errors, we generate a single unified .c4 file
 * with one specification block, one model block, and multiple views.
 */

import * as path from "node:path";
import type { C4ContainerDiagram, C4Context } from "../views/c4-generator.js";
import {
  exportContainersToLikeC4,
  exportContainersToPlantUML,
  exportContextToLikeC4,
  exportContextToPlantUML,
  sanitizeLikeC4Id,
} from "../views/c4-generator.js";
import { generateDocMetadataForLikeC4, generateDocMetadataForPlantUML } from "./doc-metadata.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute relative path from docs/c4 directory to a source file.
 * LikeC4 requires relative paths for the link property.
 *
 * @param absolutePath - Absolute path to the source file
 * @param packagePath - Package root path (parent of docs/c4)
 * @param lineNumber - Optional line number to append as anchor (e.g., #L42)
 * @returns Relative path from docs/c4 to source file, or original path if not within package
 */
function computeRelativeLinkPath(
  absolutePath: string,
  packagePath: string | undefined,
  lineNumber?: number
): string {
  if (!packagePath) {
    // Even without package path, add line number if provided
    if (lineNumber && lineNumber > 0) {
      return `${absolutePath}#L${lineNumber}`;
    }
    return absolutePath;
  }

  // The C4 docs are at packagePath/docs/c4/
  const c4DocsDir = path.join(packagePath, "docs", "c4");

  // Compute relative path from c4DocsDir to the source file
  let relativePath = path.relative(c4DocsDir, absolutePath);

  // If the path goes outside the package (starts with too many ..), just use the filename
  if (
    relativePath.startsWith("..") &&
    relativePath.split("/").filter((p) => p === "..").length > 5
  ) {
    relativePath = `./${path.basename(absolutePath)}`;
  }

  // Add line number anchor if provided
  if (lineNumber && lineNumber > 0) {
    return `${relativePath}#L${lineNumber}`;
  }

  return relativePath;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Options for generating C4 documentation
 */
export interface GenerateC4DocOptions {
  /** Seed hash for change detection */
  seedHash: string;
  /** Whether effects have been verified */
  verified?: boolean;
  /** When verification was done */
  verifiedAt?: string;
  /** Package path */
  packagePath?: string;
}

/**
 * Result of generating C4 documentation
 */
export interface C4DocResult {
  /** Context diagram PlantUML */
  context: string;
  /** Container diagram PlantUML */
  containers: string;
  /** Context diagram LikeC4 */
  contextLikeC4: string;
  /** Container diagram LikeC4 */
  containersLikeC4: string;
  /** File names for the diagrams */
  files: {
    context: string;
    containers: string;
    contextLikeC4: string;
    containersLikeC4: string;
  };
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate C4 context diagram with metadata
 *
 * @param context - C4 context data
 * @param options - Generation options including seed hash
 * @returns PlantUML content with embedded metadata
 */
export function generateC4ContextDoc(context: C4Context, options: GenerateC4DocOptions): string {
  const { seedHash, verified = false, verifiedAt, packagePath } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  // Generate PlantUML content
  const plantuml = exportContextToPlantUML(context);

  // Insert metadata after @startuml line
  const lines = plantuml.split("\n");
  const startIndex = lines.findIndex((l) => l.startsWith("@startuml"));

  if (startIndex !== -1) {
    lines.splice(startIndex + 1, 0, "", metadata.trim());
  } else {
    // Fallback: prepend metadata
    return metadata + plantuml;
  }

  return lines.join("\n");
}

/**
 * Generate C4 context diagram in LikeC4 format with metadata
 *
 * @param context - C4 context data
 * @param options - Generation options including seed hash
 * @returns LikeC4 content with embedded metadata
 */
export function generateLikeC4ContextDoc(
  context: C4Context,
  options: GenerateC4DocOptions
): string {
  const { seedHash, verified = false, verifiedAt, packagePath } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  // Generate LikeC4 content
  const likec4 = exportContextToLikeC4(context);

  // Prepend metadata
  return metadata + likec4;
}

/**
 * Generate C4 container diagram with metadata
 *
 * @param diagram - C4 container diagram data
 * @param options - Generation options including seed hash
 * @returns PlantUML content with embedded metadata
 */
export function generateC4ContainersDoc(
  diagram: C4ContainerDiagram,
  options: GenerateC4DocOptions
): string {
  const { seedHash, verified = false, verifiedAt, packagePath } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  // Generate PlantUML content
  const plantuml = exportContainersToPlantUML(diagram);

  // Insert metadata after @startuml line
  const lines = plantuml.split("\n");
  const startIndex = lines.findIndex((l) => l.startsWith("@startuml"));

  if (startIndex !== -1) {
    lines.splice(startIndex + 1, 0, "", metadata.trim());
  } else {
    // Fallback: prepend metadata
    return metadata + plantuml;
  }

  return lines.join("\n");
}

/**
 * Generate C4 container diagram in LikeC4 format with metadata
 *
 * @param diagram - C4 container diagram data
 * @param options - Generation options including seed hash
 * @returns LikeC4 content with embedded metadata
 */
export function generateLikeC4ContainersDoc(
  diagram: C4ContainerDiagram,
  options: GenerateC4DocOptions
): string {
  const { seedHash, verified = false, verifiedAt, packagePath } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  // Generate LikeC4 content
  const likec4 = exportContainersToLikeC4(diagram);

  // Prepend metadata
  return metadata + likec4;
}

/**
 * Generate all C4 documentation files
 *
 * @param context - C4 context data
 * @param containers - C4 container diagram data
 * @param options - Generation options
 * @returns C4DocResult with all diagram content
 */
export function generateAllC4Docs(
  context: C4Context,
  containers: C4ContainerDiagram,
  options: GenerateC4DocOptions
): C4DocResult {
  return {
    context: generateC4ContextDoc(context, options),
    containers: generateC4ContainersDoc(containers, options),
    contextLikeC4: generateLikeC4ContextDoc(context, options),
    containersLikeC4: generateLikeC4ContainersDoc(containers, options),
    files: {
      context: "context.puml",
      containers: "containers.puml",
      contextLikeC4: "context.c4",
      containersLikeC4: "containers.c4",
    },
  };
}

/**
 * Generate a placeholder C4 context diagram when no effects are available
 *
 * @param systemName - Name of the system
 * @param options - Generation options
 * @returns PlantUML content with placeholder
 */
export function generateEmptyC4ContextDoc(
  systemName: string,
  options: GenerateC4DocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath,
  });

  const lines = [
    "@startuml C4_Context",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
    "",
    `title ${systemName} - System Context Diagram`,
    "",
    "' No effects extracted yet.",
    "' Run `devac analyze` to extract effects.",
    "' Then run `devac doc-sync` to regenerate this diagram.",
    "",
    `System(system, "${systemName}", "No effects extracted")`,
    "",
    "@enduml",
  ];

  return lines.join("\n");
}

/**
 * Generate a placeholder C4 container diagram when no effects are available
 *
 * @param systemName - Name of the system
 * @param options - Generation options
 * @returns PlantUML content with placeholder
 */
export function generateEmptyC4ContainersDoc(
  systemName: string,
  options: GenerateC4DocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath,
  });

  const lines = [
    "@startuml C4_Container",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
    "",
    `title ${systemName} - Container Diagram`,
    "",
    "' No effects extracted yet.",
    "' Run `devac analyze` to extract effects.",
    "' Then run `devac doc-sync` to regenerate this diagram.",
    "",
    `System_Boundary(system, "${systemName}") {`,
    `  Container(placeholder, "No containers", "", "Run devac analyze first")`,
    "}",
    "",
    "@enduml",
  ];

  return lines.join("\n");
}

/**
 * Generate a placeholder C4 context diagram in LikeC4 format
 */
export function generateEmptyLikeC4ContextDoc(
  systemName: string,
  options: GenerateC4DocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath,
  });

  const lines = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "}",
    "",
    "model {",
    `  system = system '${systemName}' {`,
    "    description 'No effects extracted yet'",
    "  }",
    "}",
    "",
    "views {",
    "  view context {",
    "    title 'System Context'",
    "    include *",
    "    autoLayout tb",
    "  }",
    "}",
  ];

  return lines.join("\n");
}

/**
 * Generate a placeholder C4 container diagram in LikeC4 format
 */
export function generateEmptyLikeC4ContainersDoc(
  systemName: string,
  options: GenerateC4DocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath,
  });

  const lines = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element container",
    "}",
    "",
    "model {",
    `  system = system '${systemName}' {`,
    "    description 'No effects extracted yet'",
    "    container placeholder {",
    "      description 'Run devac analyze first'",
    "    }",
    "  }",
    "}",
    "",
    "views {",
    "  view containers {",
    "    title 'Container Diagram'",
    "    include *",
    "    autoLayout tb",
    "  }",
    "}",
  ];

  return lines.join("\n");
}

/**
 * Get the standard file paths for C4 diagrams
 *
 * @param docsDir - Base docs directory (e.g., "docs/")
 * @returns File paths for each diagram type
 */
export function getC4FilePaths(docsDir: string): {
  context: string;
  containers: string;
  directory: string;
} {
  const c4Dir = `${docsDir}/c4`;
  return {
    directory: c4Dir,
    context: `${c4Dir}/context.puml`,
    containers: `${c4Dir}/containers.puml`,
  };
}

// ============================================================================
// Unified LikeC4 Generation (Single File)
// ============================================================================

/**
 * Generate a unified LikeC4 file with both context and container views.
 *
 * IMPORTANT: LikeC4 merges all .c4 files in a directory into a single model.
 * To avoid duplicate definition errors, this function generates a single file
 * with one specification block, one model, and multiple views.
 *
 * @param context - C4 context data
 * @param containers - C4 container diagram data
 * @param options - Generation options including seed hash
 * @returns Unified LikeC4 content
 */
export function generateUnifiedLikeC4Doc(
  context: C4Context,
  containers: C4ContainerDiagram,
  options: GenerateC4DocOptions
): string {
  const { seedHash, verified = false, verifiedAt, packagePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  // Collect all element kinds needed
  const elementKinds = new Set(["system"]);
  if (containers.containers.length > 0) {
    elementKinds.add("container");
    // Check if any containers have components
    for (const container of containers.containers) {
      if (container.components.length > 0) {
        elementKinds.add("component");
        break;
      }
    }
  }
  if (context.externalSystems.length > 0 || containers.externalSystems.length > 0) {
    elementKinds.add("external_system");
  }

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    ...Array.from(elementKinds).map((kind) => `  element ${kind}`),
    "}",
    "",
    "model {",
    `  system = system '${escapeString(context.systemName)}' {`,
    `    description '${escapeString(context.systemDescription ?? "Our system")}'`,
  ];

  // Add containers inside the system
  for (const container of containers.containers) {
    const safeContainerId = sanitizeLikeC4Id(container.id);
    // Skip containers with empty IDs (safety check)
    if (!safeContainerId || !container.name) {
      continue;
    }
    lines.push("");
    lines.push(`    ${safeContainerId} = container '${escapeString(container.name)}' {`);

    if (container.description) {
      lines.push(`      description '${escapeString(container.description)}'`);
    }
    if (container.technology) {
      lines.push(`      technology '${escapeString(container.technology)}'`);
    }

    // Add components
    for (const component of container.components) {
      const safeComponentId = sanitizeLikeC4Id(component.id);
      lines.push(`      ${safeComponentId} = component '${escapeString(component.name)}' {`);
      if (component.technology) {
        lines.push(`        technology '${escapeString(component.technology)}'`);
      }
      if (component.filePath) {
        // Include line number in link if available (e.g., file.ts#L42)
        const relativePath = computeRelativeLinkPath(
          component.filePath,
          packagePath,
          component.startLine
        );
        // LikeC4 link syntax: link <uri> [description] - URI should NOT be quoted
        lines.push(`        link ${relativePath}`);
      }
      lines.push("      }");
    }

    lines.push("    }");
  }

  lines.push("  }"); // End system
  lines.push("");

  // Add external systems (deduplicated)
  const externalSystemsMap = new Map<string, (typeof context.externalSystems)[0]>();
  for (const ext of context.externalSystems) {
    externalSystemsMap.set(ext.id, ext);
  }
  for (const ext of containers.externalSystems) {
    externalSystemsMap.set(ext.id, ext);
  }

  for (const ext of externalSystemsMap.values()) {
    const safeId = sanitizeLikeC4Id(ext.id);
    lines.push(`  ${safeId} = external_system '${escapeString(ext.name)}' {`);
    lines.push(`    description '${escapeString(ext.type)}'`);
    lines.push("  }");
  }

  lines.push("");

  // Add relationships from context
  for (const ext of context.externalSystems) {
    const labels = ext.relationships.map((r) => r.label).slice(0, 3);
    const label = labels.join(", ") + (labels.length < ext.relationships.length ? "..." : "");
    const safeId = sanitizeLikeC4Id(ext.id);
    lines.push(`  system -> ${safeId} '${escapeString(label)}'`);
  }

  // Add relationships from containers
  for (const container of containers.containers) {
    const safeContainerId = sanitizeLikeC4Id(container.id);
    for (const rel of container.relationships) {
      const safeToId = sanitizeLikeC4Id(rel.to);
      lines.push(`  system.${safeContainerId} -> ${safeToId} '${escapeString(rel.label)}'`);
    }
  }

  lines.push("}");
  lines.push("");

  // Views section with context, container, and per-container drill-down views
  lines.push("views {");
  lines.push("  view context {");
  lines.push("    title 'System Context'");
  lines.push("    include *");
  lines.push("    autoLayout TopBottom");
  lines.push("  }");
  lines.push("");
  lines.push("  view containers {");
  lines.push("    title 'Container Diagram'");
  lines.push("    include *");
  lines.push("    autoLayout TopBottom");
  lines.push("  }");

  // Generate scoped drill-down views for each container with components
  // These views show individual component relationships (not aggregated)
  for (const container of containers.containers) {
    const safeContainerId = sanitizeLikeC4Id(container.id);
    if (!safeContainerId || container.components.length === 0) {
      continue;
    }

    lines.push("");
    lines.push(`  view ${safeContainerId}_detail of system.${safeContainerId} {`);
    lines.push(`    title '${escapeString(container.name)} - Components'`);
    lines.push("    include *");
    lines.push("    autoLayout TopBottom");
    lines.push("  }");
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate a placeholder unified LikeC4 file when no effects are available
 */
export function generateEmptyUnifiedLikeC4Doc(
  systemName: string,
  options: GenerateC4DocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath,
  });

  const lines = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element container",
    "}",
    "",
    "model {",
    `  system = system '${escapeString(systemName)}' {`,
    "    description 'No effects extracted yet'",
    "",
    "    placeholder = container 'Placeholder' {",
    "      description 'Run devac analyze first'",
    "    }",
    "  }",
    "}",
    "",
    "views {",
    "  view context {",
    "    title 'System Context'",
    "    include *",
    "    autoLayout TopBottom",
    "  }",
    "",
    "  view containers {",
    "    title 'Container Diagram'",
    "    include *",
    "    autoLayout TopBottom",
    "  }",
    "}",
  ];

  return lines.join("\n");
}

/**
 * Escape single quotes in strings for LikeC4
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Get the file path for unified LikeC4 diagram
 */
export function getUnifiedLikeC4FilePath(docsDir: string): string {
  return `${docsDir}/c4/architecture.c4`;
}
