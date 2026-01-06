/**
 * Repo C4 Generator - Generate repo-level C4 PlantUML diagrams
 *
 * Generates C4 diagrams at the repository level, showing packages as
 * containers and their relationships with external systems.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import * as path from "node:path";

import { generateDocMetadataForLikeC4, generateDocMetadataForPlantUML } from "./doc-metadata.js";
import type { AggregatedPattern, RepoEffectsData } from "./repo-effects-generator.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for generating repo-level C4 documentation
 */
export interface GenerateRepoC4DocOptions {
  /** Combined seed hash from all packages */
  seedHash: string;
  /** Repository path */
  repoPath?: string;
  /** Maximum number of external systems to show */
  maxExternalSystems?: number;
}

/**
 * Result of generating repo-level C4 documentation
 */
export interface RepoC4DocResult {
  /** Context diagram PlantUML showing repo and external systems */
  context: string;
  /** Container diagram PlantUML showing packages as containers */
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
// Helper Functions
// ============================================================================

/**
 * Sanitize a name for use in PlantUML identifiers
 */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

/**
 * Extract external system names from patterns
 */
function extractExternalSystems(
  patterns: AggregatedPattern[]
): Array<{ name: string; count: number; packages: string[] }> {
  const systems = new Map<string, { count: number; packages: Set<string> }>();

  for (const p of patterns) {
    // Extract service name from pattern (e.g., "axios.get" -> "http-client")
    const serviceName = inferServiceFromPattern(p.pattern);
    const existing = systems.get(serviceName);

    if (existing) {
      existing.count += p.totalCount;
      for (const pkg of p.packages) {
        existing.packages.add(pkg.name);
      }
    } else {
      systems.set(serviceName, {
        count: p.totalCount,
        packages: new Set(p.packages.map((pkg) => pkg.name)),
      });
    }
  }

  return Array.from(systems.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      packages: Array.from(data.packages),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Infer external service name from a pattern
 */
function inferServiceFromPattern(pattern: string): string {
  const lower = pattern.toLowerCase();

  // HTTP/REST
  if (lower.includes("axios") || lower.includes("fetch") || lower.includes("http")) {
    return "HTTP Client";
  }

  // AWS Services
  if (lower.includes("s3")) return "AWS S3";
  if (lower.includes("dynamodb")) return "AWS DynamoDB";
  if (lower.includes("sqs")) return "AWS SQS";
  if (lower.includes("sns")) return "AWS SNS";
  if (lower.includes("lambda")) return "AWS Lambda";

  // Database
  if (lower.includes("mysql") || lower.includes("pg") || lower.includes("postgres")) {
    return "Database";
  }
  if (lower.includes("redis") || lower.includes("cache")) {
    return "Cache";
  }
  if (lower.includes("mongo")) {
    return "MongoDB";
  }

  // File System
  if (lower.includes("fs.") || lower.includes("readfile") || lower.includes("writefile")) {
    return "File System";
  }

  // Other common services
  if (lower.includes("stripe")) return "Stripe";
  if (lower.includes("email") || lower.includes("sendgrid") || lower.includes("nodemailer")) {
    return "Email Service";
  }

  return "External Service";
}

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate repo-level C4 context diagram
 *
 * Shows the repository as a system with its external dependencies.
 *
 * @param data - Aggregated repo effects data
 * @param options - Generation options
 * @returns PlantUML content with embedded metadata
 */
export function generateRepoC4ContextDoc(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath, maxExternalSystems = 10 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  // Extract external systems from patterns
  const externalSystems = extractExternalSystems(data.aggregatedPatterns.externalPatterns);

  const lines: string[] = [
    "@startuml C4_Context",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
    "",
    `title ${data.repoName} - System Context Diagram`,
    "",
    "' System Context: Shows the repository and its external dependencies",
    "",
  ];

  // Add the main system (repository)
  const pkgCount = data.packages.length;
  const totalEffects =
    data.totalCounts.store +
    data.totalCounts.retrieve +
    data.totalCounts.external +
    data.totalCounts.other;
  lines.push(
    `System(${sanitizeId(data.repoName)}, "${data.repoName}", "${pkgCount} packages, ${totalEffects} effects")`
  );
  lines.push("");

  // Add external systems
  if (externalSystems.length > 0) {
    lines.push("' External Systems");
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const id = sanitizeId(sys.name);
      lines.push(
        `System_Ext(${id}, "${sys.name}", "${sys.count} calls from ${sys.packages.length} packages")`
      );
    }
    if (externalSystems.length > maxExternalSystems) {
      lines.push(`' ... and ${externalSystems.length - maxExternalSystems} more external systems`);
    }
    lines.push("");

    // Add relationships
    lines.push("' Relationships");
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const sysId = sanitizeId(sys.name);
      lines.push(`Rel(${sanitizeId(data.repoName)}, ${sysId}, "Uses")`);
    }
  } else {
    lines.push("' No external systems detected");
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Generate repo-level C4 container diagram
 *
 * Shows packages as containers within the repository boundary.
 *
 * @param data - Aggregated repo effects data
 * @param options - Generation options
 * @returns PlantUML content with embedded metadata
 */
export function generateRepoC4ContainersDoc(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath, maxExternalSystems = 8 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  // Extract external systems
  const externalSystems = extractExternalSystems(data.aggregatedPatterns.externalPatterns);

  const lines: string[] = [
    "@startuml C4_Container",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
    "",
    `title ${data.repoName} - Container Diagram`,
    "",
    "' Container Diagram: Shows packages as containers within the repository",
    "",
  ];

  // Add external systems first (outside boundary)
  if (externalSystems.length > 0) {
    lines.push("' External Systems");
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const id = sanitizeId(sys.name);
      lines.push(`System_Ext(${id}, "${sys.name}", "${sys.count} calls")`);
    }
    lines.push("");
  }

  // Add system boundary with packages as containers
  lines.push(`System_Boundary(${sanitizeId(data.repoName)}, "${data.repoName}") {`);
  lines.push("");

  for (const pkg of data.packages) {
    const pkgId = sanitizeId(pkg.name);
    const totalEffects =
      pkg.effectCounts.store +
      pkg.effectCounts.retrieve +
      pkg.effectCounts.external +
      pkg.effectCounts.other;

    const technology = "TypeScript"; // Could be inferred from package.json
    const description =
      totalEffects > 0
        ? `${totalEffects} effects (S:${pkg.effectCounts.store} R:${pkg.effectCounts.retrieve} E:${pkg.effectCounts.external})`
        : "No effects";

    lines.push(`  Container(${pkgId}, "${pkg.name}", "${technology}", "${description}")`);
  }

  lines.push("}");
  lines.push("");

  // Add relationships from packages to external systems
  if (externalSystems.length > 0) {
    lines.push("' Relationships to external systems");
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const sysId = sanitizeId(sys.name);
      // Find which packages use this system
      for (const pkgName of sys.packages) {
        const pkg = data.packages.find((p) => p.name === pkgName);
        if (pkg && pkg.effectCounts.external > 0) {
          const pkgId = sanitizeId(pkg.name);
          lines.push(`Rel(${pkgId}, ${sysId}, "Uses")`);
        }
      }
    }
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Generate repo-level C4 context diagram in LikeC4 format
 */
export function generateRepoLikeC4ContextDoc(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath, maxExternalSystems = 10 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  // Extract external systems
  const externalSystems = extractExternalSystems(data.aggregatedPatterns.externalPatterns);

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element external_system",
    "}",
    "",
    "model {",
    `  system = system '${data.repoName}' {`,
    `    description '${data.packages.length} packages, ${data.totalCounts.store + data.totalCounts.retrieve + data.totalCounts.external + data.totalCounts.other} effects'`,
    "  }",
    "",
  ];

  // Add external systems
  if (externalSystems.length > 0) {
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      lines.push(`  ${sanitizeId(sys.name)} = external_system '${sys.name}' {`);
      lines.push(`    description '${sys.count} calls from ${sys.packages.length} packages'`);
      lines.push("  }");
    }
    lines.push("");

    // Add relationships
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      lines.push(`  system -> ${sanitizeId(sys.name)} 'Uses'`);
    }
  }

  lines.push("}");
  lines.push("");
  lines.push("views {");
  lines.push("  view context {");
  lines.push("    title 'System Context'");
  lines.push("    include *");
  lines.push("    autoLayout tb");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate repo-level C4 container diagram in LikeC4 format
 */
export function generateRepoLikeC4ContainersDoc(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath, maxExternalSystems = 8 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  // Extract external systems
  const externalSystems = extractExternalSystems(data.aggregatedPatterns.externalPatterns);

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element container",
    "  element external_system",
    "}",
    "",
    "model {",
    `  system = system '${data.repoName}' {`,
  ];

  // Add packages as containers
  for (const pkg of data.packages) {
    const pkgId = sanitizeId(pkg.name);
    const totalEffects =
      pkg.effectCounts.store +
      pkg.effectCounts.retrieve +
      pkg.effectCounts.external +
      pkg.effectCounts.other;

    lines.push(`    ${pkgId} = container '${pkg.name}' {`);
    lines.push("      technology 'TypeScript'");
    if (totalEffects > 0) {
      lines.push(`      description '${totalEffects} effects'`);
    }
    // Link to package directory
    lines.push(`      link '${pkg.packagePath}'`);
    lines.push("    }");
  }
  lines.push("  }"); // End system

  lines.push("");

  // Add external systems
  if (externalSystems.length > 0) {
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      lines.push(`  ${sanitizeId(sys.name)} = external_system '${sys.name}' {`);
      lines.push(`    description '${sys.count} calls'`);
      lines.push("  }");
    }
    lines.push("");

    // Add relationships
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const sysId = sanitizeId(sys.name);
      for (const pkgName of sys.packages) {
        const pkg = data.packages.find((p) => p.name === pkgName);
        if (pkg && pkg.effectCounts.external > 0) {
          const pkgId = sanitizeId(pkg.name);
          lines.push(`  system.${pkgId} -> ${sysId} 'Uses'`);
        }
      }
    }
  }

  lines.push("}");
  lines.push("");
  lines.push("views {");
  lines.push("  view containers {");
  lines.push("    title 'Container Diagram'");
  lines.push("    include *");
  lines.push("    autoLayout tb");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate all repo-level C4 documentation files
 *
 * @param data - Aggregated repo effects data
 * @param options - Generation options
 * @returns RepoC4DocResult with all diagram content
 */
export function generateAllRepoC4Docs(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): RepoC4DocResult {
  return {
    context: generateRepoC4ContextDoc(data, options),
    containers: generateRepoC4ContainersDoc(data, options),
    contextLikeC4: generateRepoLikeC4ContextDoc(data, options),
    containersLikeC4: generateRepoLikeC4ContainersDoc(data, options),
    files: {
      context: "context.puml",
      containers: "containers.puml",
      contextLikeC4: "context.c4",
      containersLikeC4: "containers.c4",
    },
  };
}

/**
 * Generate empty repo C4 context diagram
 */
export function generateEmptyRepoC4ContextDoc(
  repoName: string,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const lines = [
    "@startuml C4_Context",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
    "",
    `title ${repoName} - System Context Diagram`,
    "",
    "' No effects extracted yet.",
    "' Run `devac analyze` on packages to extract effects.",
    "' Then run `devac doc-sync --repo` to regenerate this diagram.",
    "",
    `System(system, "${repoName}", "No effects extracted")`,
    "",
    "@enduml",
  ];

  return lines.join("\n");
}

/**
 * Generate empty repo C4 container diagram
 */
export function generateEmptyRepoC4ContainersDoc(
  repoName: string,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForPlantUML({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const lines = [
    "@startuml C4_Container",
    "",
    metadata.trim(),
    "",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
    "",
    `title ${repoName} - Container Diagram`,
    "",
    "' No effects extracted yet.",
    "' Run `devac analyze` on packages to extract effects.",
    "' Then run `devac doc-sync --repo` to regenerate this diagram.",
    "",
    `System_Boundary(system, "${repoName}") {`,
    `  Container(placeholder, "No packages", "", "Run devac analyze first")`,
    "}",
    "",
    "@enduml",
  ];

  return lines.join("\n");
}

/**
 * Generate empty repo C4 context diagram in LikeC4 format
 */
export function generateEmptyRepoLikeC4ContextDoc(
  repoName: string,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const lines = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "}",
    "",
    "model {",
    `  system = system '${repoName}' {`,
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
 * Generate empty repo C4 container diagram in LikeC4 format
 */
export function generateEmptyRepoLikeC4ContainersDoc(
  repoName: string,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
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
    `  system = system '${repoName}' {`,
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
 * Get the standard file paths for repo-level C4 diagrams
 */
export function getRepoC4FilePaths(repoPath: string): {
  context: string;
  containers: string;
  directory: string;
} {
  const c4Dir = path.join(repoPath, "docs", "c4");
  return {
    directory: c4Dir,
    context: path.join(c4Dir, "context.puml"),
    containers: path.join(c4Dir, "containers.puml"),
  };
}

// ============================================================================
// Unified LikeC4 Generation (Single File)
// ============================================================================

/**
 * Generate a unified repo-level LikeC4 file with both context and container views.
 *
 * IMPORTANT: LikeC4 merges all .c4 files in a directory into a single model.
 * To avoid duplicate definition errors, this function generates a single file
 * with one specification block, one model, and multiple views.
 */
export function generateUnifiedRepoLikeC4Doc(
  data: RepoEffectsData,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath, maxExternalSystems = 10 } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
  });

  const externalSystems = extractExternalSystems(data.aggregatedPatterns.externalPatterns);

  const lines: string[] = [
    metadata.trim(),
    "",
    "specification {",
    "  element system",
    "  element container",
  ];

  if (externalSystems.length > 0) {
    lines.push("  element external_system");
  }

  lines.push("}");
  lines.push("");
  lines.push("model {");
  lines.push(`  system = system '${data.repoName}' {`);
  lines.push(
    `    description '${data.packages.length} packages, ${data.totalCounts.store + data.totalCounts.retrieve + data.totalCounts.external + data.totalCounts.other} effects'`
  );
  lines.push("");

  // Add packages as containers
  for (const pkg of data.packages) {
    const pkgId = sanitizeId(pkg.name);
    const totalEffects =
      pkg.effectCounts.store +
      pkg.effectCounts.retrieve +
      pkg.effectCounts.external +
      pkg.effectCounts.other;

    lines.push(`    ${pkgId} = container '${pkg.name}' {`);
    lines.push("      technology 'TypeScript'");
    if (totalEffects > 0) {
      lines.push(`      description '${totalEffects} effects'`);
    }
    lines.push(`      link '${pkg.packagePath}'`);
    lines.push("    }");
  }

  lines.push("  }"); // End system
  lines.push("");

  // Add external systems
  if (externalSystems.length > 0) {
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      lines.push(`  ${sanitizeId(sys.name)} = external_system '${sys.name}' {`);
      lines.push(`    description '${sys.count} calls from ${sys.packages.length} packages'`);
      lines.push("  }");
    }
    lines.push("");

    // Add relationships from system (context level)
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      lines.push(`  system -> ${sanitizeId(sys.name)} 'Uses'`);
    }

    // Add relationships from packages (container level)
    for (const sys of externalSystems.slice(0, maxExternalSystems)) {
      const sysId = sanitizeId(sys.name);
      for (const pkgName of sys.packages) {
        const pkg = data.packages.find((p) => p.name === pkgName);
        if (pkg && pkg.effectCounts.external > 0) {
          const pkgId = sanitizeId(pkg.name);
          lines.push(`  system.${pkgId} -> ${sysId} 'Uses'`);
        }
      }
    }
  }

  lines.push("}");
  lines.push("");

  // Views section with both context and container views
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
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate empty unified repo-level LikeC4 file
 */
export function generateEmptyUnifiedRepoLikeC4Doc(
  repoName: string,
  options: GenerateRepoC4DocOptions
): string {
  const { seedHash, repoPath } = options;

  const metadata = generateDocMetadataForLikeC4({
    seedHash,
    verified: false,
    packagePath: repoPath,
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
    `  system = system '${repoName}' {`,
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
 * Get the file path for unified repo-level LikeC4 diagram
 */
export function getUnifiedRepoLikeC4FilePath(repoPath: string): string {
  return path.join(repoPath, "docs", "c4", "architecture.c4");
}
