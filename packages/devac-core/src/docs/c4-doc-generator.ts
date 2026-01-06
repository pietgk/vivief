/**
 * C4 Doc Generator - Generate C4 PlantUML documentation with metadata
 *
 * Wraps the C4 generator functions to produce documentation files
 * with embedded metadata for change detection and verification tracking.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import type { C4ContainerDiagram, C4Context } from "../views/c4-generator.js";
import {
  exportContainersToLikeC4,
  exportContainersToPlantUML,
  exportContextToLikeC4,
  exportContextToPlantUML,
} from "../views/c4-generator.js";
import { generateDocMetadataForLikeC4, generateDocMetadataForPlantUML } from "./doc-metadata.js";

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
