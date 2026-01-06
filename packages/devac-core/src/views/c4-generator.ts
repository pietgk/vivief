/**
 * C4 Diagram Generator
 *
 * Generates C4 architecture diagrams from domain effects.
 * Implements the Vision→View pipeline from DevAC v3.0 Foundation.
 *
 * C4 Model Levels:
 * - Context: System and its external relationships
 * - Container: Applications/services within the system
 * - Component: Components within a container
 * - Code: Implementation details (not typically generated)
 */

import type { DomainEffect } from "../rules/rule-engine.js";
import {
  exportSpecificationToLikeC4,
  generateElementTags,
  generateLikeC4Specification,
  getExternalElementKind,
  getRelationshipKind,
} from "./likec4-spec-generator.js";

// =============================================================================
// C4 Model Types
// =============================================================================

/**
 * External system that interacts with our system
 */
export interface C4ExternalSystem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** System type (e.g., "payment", "database", "messaging") */
  type: string;
  /** Provider (e.g., "stripe", "aws-dynamodb") */
  provider?: string;
  /** Relationships from our system to this external system */
  relationships: C4Relationship[];
}

/**
 * Container (application/service) within our system
 */
export interface C4Container {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Technology stack */
  technology?: string;
  /** Description */
  description?: string;
  /** Effects produced by this container */
  effects: string[];
  /** Components within this container */
  components: C4Component[];
  /** Relationships to other containers or external systems */
  relationships: C4Relationship[];
}

/**
 * Component within a container
 */
export interface C4Component {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Source entity ID */
  sourceEntityId: string;
  /** File path */
  filePath: string;
  /** Technology/framework */
  technology?: string;
  /** Effects produced by this component */
  effects: string[];
  /** Relationships to other components or external systems */
  relationships: C4Relationship[];
}

/**
 * Relationship between elements
 */
export interface C4Relationship {
  /** Source element ID */
  from: string;
  /** Target element ID */
  to: string;
  /** Relationship label */
  label: string;
  /** Technology/protocol used */
  technology?: string;
  /** Direction */
  direction: "outbound" | "inbound" | "bidirectional";
}

/**
 * C4 Context diagram (system level)
 */
export interface C4Context {
  /** System name */
  systemName: string;
  /** System description */
  systemDescription?: string;
  /** External systems */
  externalSystems: C4ExternalSystem[];
  /** Summary of domains */
  domains: DomainSummary[];
  /** Total effect count */
  effectCount: number;
}

/**
 * C4 Container diagram (application level)
 */
export interface C4ContainerDiagram {
  /** System name */
  systemName: string;
  /** Containers within the system */
  containers: C4Container[];
  /** External systems */
  externalSystems: C4ExternalSystem[];
}

/**
 * Summary of a domain
 */
export interface DomainSummary {
  /** Domain name */
  domain: string;
  /** Actions in this domain */
  actions: string[];
  /** Effect count */
  count: number;
}

/**
 * Generation options
 */
export interface C4GeneratorOptions {
  /** System name */
  systemName: string;
  /** System description */
  systemDescription?: string;
  /** Group components by file path prefix */
  containerGrouping?: "directory" | "package" | "flat";
  /** Include effects with no external relationships */
  includeInternalOnly?: boolean;
}

// =============================================================================
// C4 Generator Implementation
// =============================================================================

/**
 * Generate C4 Context diagram from domain effects
 */
export function generateC4Context(effects: DomainEffect[], options: C4GeneratorOptions): C4Context {
  const { systemName, systemDescription } = options;

  // Group effects by domain
  const domainMap = new Map<string, Map<string, number>>();
  for (const effect of effects) {
    if (!domainMap.has(effect.domain)) {
      domainMap.set(effect.domain, new Map());
    }
    const actionMap = domainMap.get(effect.domain);
    if (actionMap) {
      actionMap.set(effect.action, (actionMap.get(effect.action) ?? 0) + 1);
    }
  }

  // Create domain summaries
  const domains: DomainSummary[] = [];
  for (const [domain, actionMap] of domainMap) {
    domains.push({
      domain,
      actions: Array.from(actionMap.keys()),
      count: Array.from(actionMap.values()).reduce((a, b) => a + b, 0),
    });
  }
  domains.sort((a, b) => b.count - a.count);

  // Extract external systems from effects
  const externalSystems = extractExternalSystems(effects);

  return {
    systemName,
    systemDescription,
    externalSystems,
    domains,
    effectCount: effects.length,
  };
}

/**
 * Generate C4 Container diagram from domain effects
 */
export function generateC4Containers(
  effects: DomainEffect[],
  options: C4GeneratorOptions
): C4ContainerDiagram {
  const { systemName, containerGrouping = "directory" } = options;

  // Group effects by container (based on file path)
  const containerMap = new Map<string, DomainEffect[]>();
  for (const effect of effects) {
    const containerId = getContainerId(effect.filePath, containerGrouping);
    if (!containerMap.has(containerId)) {
      containerMap.set(containerId, []);
    }
    containerMap.get(containerId)?.push(effect);
  }

  // Create containers
  const containers: C4Container[] = [];
  for (const [containerId, containerEffects] of containerMap) {
    const container = createContainer(containerId, containerEffects);
    containers.push(container);
  }

  // Extract external systems
  const externalSystems = extractExternalSystems(effects);

  // Add relationships between containers and external systems
  for (const container of containers) {
    for (const effect of containerMap.get(container.id) ?? []) {
      const externalTarget = getExternalTarget(effect);
      if (externalTarget) {
        container.relationships.push({
          from: container.id,
          to: externalTarget.id,
          label: `${effect.domain}:${effect.action}`,
          direction: "outbound",
        });
      }
    }
  }

  return {
    systemName,
    containers,
    externalSystems,
  };
}

/**
 * Extract container ID from file path
 */
function getContainerId(filePath: string, grouping: "directory" | "package" | "flat"): string {
  switch (grouping) {
    case "directory": {
      // Group by top-level directory (e.g., src/api -> api)
      // Filter out empty parts to handle absolute paths like /Users/...
      const parts = filePath.split("/").filter((p) => p.length > 0);
      if (parts.length >= 2) {
        // Skip 'src' or similar common prefixes
        const idx = parts[0] === "src" || parts[0] === "lib" ? 1 : 0;
        return parts[idx] ?? "root";
      }
      return parts[0] ?? "root";
    }
    case "package": {
      // Group by package path (from entity ID)
      const match = filePath.match(/packages?\/([^/]+)/);
      return match?.[1] ?? "main";
    }
    default:
      return "main";
  }
}

/**
 * Create a container from effects
 */
function createContainer(id: string, effects: DomainEffect[]): C4Container {
  // Collect unique effect types
  const effectSet = new Set<string>();
  const componentMap = new Map<string, DomainEffect[]>();

  for (const effect of effects) {
    effectSet.add(`${effect.domain}:${effect.action}`);

    // Group by source entity for components
    if (!componentMap.has(effect.sourceEntityId)) {
      componentMap.set(effect.sourceEntityId, []);
    }
    componentMap.get(effect.sourceEntityId)?.push(effect);
  }

  // Create components
  const components: C4Component[] = [];
  for (const [entityId, entityEffects] of componentMap) {
    const firstEffect = entityEffects[0];
    if (!firstEffect) continue;

    components.push({
      id: entityId,
      name: extractComponentName(entityId),
      sourceEntityId: entityId,
      filePath: firstEffect.filePath,
      effects: entityEffects.map((e) => `${e.domain}:${e.action}`),
      relationships: [],
    });
  }

  return {
    id,
    name: formatContainerName(id),
    effects: Array.from(effectSet),
    components,
    relationships: [],
  };
}

/**
 * Extract external systems from domain effects
 */
function extractExternalSystems(effects: DomainEffect[]): C4ExternalSystem[] {
  const systemMap = new Map<string, C4ExternalSystem>();

  for (const effect of effects) {
    if (!effect.metadata?.isExternal) continue;

    const provider = (effect.metadata?.provider as string) ?? "unknown";
    const systemId = `external:${effect.domain}:${provider}`;

    if (!systemMap.has(systemId)) {
      systemMap.set(systemId, {
        id: systemId,
        name: formatExternalSystemName(effect.domain, provider),
        type: effect.domain.toLowerCase(),
        provider,
        relationships: [],
      });
    }

    // Add relationship
    const system = systemMap.get(systemId);
    system?.relationships.push({
      from: effect.sourceEntityId,
      to: systemId,
      label: effect.action,
      direction: "outbound",
    });
  }

  return Array.from(systemMap.values());
}

/**
 * Get external target from effect if it exists
 */
function getExternalTarget(effect: DomainEffect): C4ExternalSystem | null {
  if (!effect.metadata?.isExternal) return null;

  const provider = (effect.metadata?.provider as string) ?? "unknown";
  return {
    id: `external:${effect.domain}:${provider}`,
    name: formatExternalSystemName(effect.domain, provider),
    type: effect.domain.toLowerCase(),
    provider,
    relationships: [],
  };
}

/**
 * Extract component name from entity ID
 */
function extractComponentName(entityId: string): string {
  // Entity ID format: repo:package:kind:hash
  const parts = entityId.split(":");
  if (parts.length >= 3) {
    // Try to extract a meaningful name from the hash portion
    const hash = parts[parts.length - 1] ?? "";
    // If it looks like a function name was encoded, use it
    return hash.length > 8 ? hash.slice(0, 8) : hash;
  }
  return entityId.slice(0, 20);
}

/**
 * Format container name for display
 */
function formatContainerName(id: string): string {
  return id
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format external system name for display
 */
function formatExternalSystemName(domain: string, provider: string): string {
  const formattedProvider = provider
    .replace(/^aws-/, "AWS ")
    .replace(/^gcp-/, "GCP ")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return `${formattedProvider} (${domain})`;
}

// =============================================================================
// PlantUML Export
// =============================================================================

/**
 * Export C4 Context to PlantUML format
 */
export function exportContextToPlantUML(context: C4Context): string {
  const lines: string[] = [
    "@startuml C4_Context",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
    "",
    `title ${context.systemName} - System Context Diagram`,
    "",
    `System(system, "${context.systemName}", "${context.systemDescription ?? "Our system"}")`,
    "",
  ];

  // Add external systems
  for (const ext of context.externalSystems) {
    const type = ext.type === "database" ? "System_Ext" : "System_Ext";
    lines.push(`${type}(${sanitizeId(ext.id)}, "${ext.name}", "${ext.type}")`);
  }

  lines.push("");

  // Add relationships
  for (const ext of context.externalSystems) {
    const labels = ext.relationships.map((r) => r.label).slice(0, 3);
    const label = labels.join(", ") + (labels.length < ext.relationships.length ? "..." : "");
    lines.push(`Rel(system, ${sanitizeId(ext.id)}, "${label}")`);
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Export C4 Containers to PlantUML format
 */
export function exportContainersToPlantUML(diagram: C4ContainerDiagram): string {
  const lines: string[] = [
    "@startuml C4_Container",
    "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
    "",
    `title ${diagram.systemName} - Container Diagram`,
    "",
    `System_Boundary(system, "${diagram.systemName}") {`,
  ];

  // Add containers
  for (const container of diagram.containers) {
    const effectSummary = container.effects.slice(0, 3).join(", ");
    lines.push(
      `  Container(${sanitizeId(container.id)}, "${container.name}", "", "${effectSummary}")`
    );
  }

  lines.push("}");
  lines.push("");

  // Add external systems
  for (const ext of diagram.externalSystems) {
    lines.push(`System_Ext(${sanitizeId(ext.id)}, "${ext.name}", "${ext.type}")`);
  }

  lines.push("");

  // Add relationships
  for (const container of diagram.containers) {
    for (const rel of container.relationships) {
      lines.push(`Rel(${sanitizeId(container.id)}, ${sanitizeId(rel.to)}, "${rel.label}")`);
    }
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n");
}

/**
 * Sanitize ID for PlantUML
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

// =============================================================================
// LikeC4 Export
// =============================================================================

/**
 * Export C4 Context to LikeC4 format
 */
export function exportContextToLikeC4(context: C4Context): string {
  const lines: string[] = [
    "specification {",
    "  element system",
    "  element external_system",
    "}",
    "",
    "model {",
    `  system = system '${context.systemName}' {`,
    `    description '${context.systemDescription ?? "Our system"}'`,
    "  }",
    "",
  ];

  // Add external systems
  for (const ext of context.externalSystems) {
    lines.push(`  ${sanitizeLikeC4Id(ext.id)} = external_system '${ext.name}' {`);
    lines.push(`    description '${ext.type}'`);
    lines.push("  }");
  }

  lines.push("");

  // Add relationships
  for (const ext of context.externalSystems) {
    const labels = ext.relationships.map((r) => r.label).slice(0, 3);
    const label = labels.join(", ") + (labels.length < ext.relationships.length ? "..." : "");
    lines.push(`  system -> ${sanitizeLikeC4Id(ext.id)} '${label}'`);
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
 * Export C4 Containers to LikeC4 format
 */
export function exportContainersToLikeC4(diagram: C4ContainerDiagram): string {
  const lines: string[] = [
    "specification {",
    "  element system",
    "  element container",
    "  element component",
    "  element external_system",
    "}",
    "",
    "model {",
    `  system = system '${diagram.systemName}' {`,
  ];

  // Add containers
  for (const container of diagram.containers) {
    lines.push(`    ${sanitizeLikeC4Id(container.id)} = container '${container.name}' {`);
    if (container.description) {
      lines.push(`      description '${container.description}'`);
    }
    if (container.technology) {
      lines.push(`      technology '${container.technology}'`);
    }

    // Add components (Level 3) - LikeC4 allows zooming in!
    if (container.components.length > 0) {
      for (const component of container.components) {
        lines.push(`      ${sanitizeLikeC4Id(component.id)} = component '${component.name}' {`);
        if (component.technology) {
          lines.push(`        technology '${component.technology}'`);
        }
        // Add link to source code
        if (component.filePath) {
          lines.push(`        link '${component.filePath}'`);
        }
        lines.push("      }");
      }
    }

    lines.push("    }");
  }
  lines.push("  }"); // End system

  lines.push("");

  // Add external systems
  for (const ext of diagram.externalSystems) {
    lines.push(`  ${sanitizeLikeC4Id(ext.id)} = external_system '${ext.name}' {`);
    lines.push(`    description '${ext.type}'`);
    lines.push("  }");
  }

  lines.push("");

  // Add relationships
  for (const container of diagram.containers) {
    for (const rel of container.relationships) {
      lines.push(
        `  system.${sanitizeLikeC4Id(container.id)} -> ${sanitizeLikeC4Id(rel.to)} '${rel.label}'`
      );
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
 * Sanitize ID for LikeC4
 */
export function sanitizeLikeC4Id(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    return `_${sanitized}`;
  }
  return sanitized;
}

// =============================================================================
// Enhanced LikeC4 Export (with custom specification)
// =============================================================================

/**
 * Options for enhanced LikeC4 export
 */
export interface EnhancedLikeC4Options {
  /** Domain effects for generating specification */
  domainEffects?: DomainEffect[];
  /** Include source code links with line numbers */
  includeSourceLinks?: boolean;
  /** Base path to prepend to source links */
  sourceBasePath?: string;
}

/**
 * Export C4 Context to enhanced LikeC4 format with custom specification
 *
 * Features:
 * - Custom element kinds based on detected domains
 * - Tags for domain categorization
 * - Rich relationship types
 * - External system type mapping
 */
export function exportContextToEnhancedLikeC4(
  context: C4Context,
  options: EnhancedLikeC4Options = {}
): string {
  const { domainEffects = [] } = options;

  // Generate specification from effects
  const spec = generateLikeC4Specification(domainEffects, context.externalSystems);
  const specBlock = exportSpecificationToLikeC4(spec);

  const lines: string[] = [specBlock, "", "model {"];

  // System definition
  lines.push(`  system = system '${escapeString(context.systemName)}' {`);
  lines.push(`    description '${escapeString(context.systemDescription ?? "Our system")}'`);

  // Add domain summary as metadata
  if (context.domains.length > 0) {
    lines.push("    metadata {");
    lines.push(`      domains '${context.domains.map((d) => d.domain).join(", ")}'`);
    lines.push(`      effect_count '${context.effectCount}'`);
    lines.push("    }");
  }
  lines.push("  }");
  lines.push("");

  // External systems with proper element kinds
  for (const ext of context.externalSystems) {
    const elementKind = getExternalElementKind(ext.provider, ext.type);
    const safeId = sanitizeLikeC4Id(ext.id);

    lines.push(`  ${safeId} = ${elementKind} '${escapeString(ext.name)}' {`);
    lines.push(`    description '${escapeString(ext.type)}'`);

    // Add provider link if available
    if (ext.provider) {
      const providerLink = getProviderDocLink(ext.provider);
      if (providerLink) {
        lines.push(`    link ${providerLink} 'Documentation'`);
      }
    }

    lines.push("  }");
  }

  lines.push("");

  // Relationships with proper relationship kinds
  for (const ext of context.externalSystems) {
    // Group relationships by action for cleaner output
    const actionGroups = new Map<string, number>();
    for (const rel of ext.relationships) {
      actionGroups.set(rel.label, (actionGroups.get(rel.label) ?? 0) + 1);
    }

    const sortedActions = Array.from(actionGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const label = sortedActions.map((a) => a[0]).join(", ");
    const safeId = sanitizeLikeC4Id(ext.id);

    // Determine relationship kind from first action
    const firstAction = ext.relationships[0]?.label ?? "";
    const [domain, action] = firstAction.split(":");
    const relKind = domain && action ? getRelationshipKind(domain, action) : "calls";

    lines.push(`  system -[${relKind}]-> ${safeId} '${label}'`);
  }

  lines.push("}");
  lines.push("");

  // Views section
  lines.push("views {");
  lines.push("  view context {");
  lines.push(`    title '${escapeString(context.systemName)} - System Context'`);
  lines.push("    include *");
  lines.push("    autoLayout TopBottom");
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Export C4 Containers to enhanced LikeC4 format with custom specification
 *
 * Features:
 * - Custom element kinds based on detected domains
 * - Tags for domain categorization (#Payment, #Database)
 * - Source code links with line numbers
 * - Rich relationship types
 * - navigateTo support for drill-down
 */
export function exportContainersToEnhancedLikeC4(
  diagram: C4ContainerDiagram,
  options: EnhancedLikeC4Options = {}
): string {
  const { domainEffects = [], includeSourceLinks = true, sourceBasePath = "./" } = options;

  // Generate specification from effects
  const spec = generateLikeC4Specification(domainEffects, diagram.externalSystems);
  const specBlock = exportSpecificationToLikeC4(spec);

  const lines: string[] = [specBlock, "", "model {"];

  // System with containers
  lines.push(`  system = system '${escapeString(diagram.systemName)}' {`);
  lines.push(`    description 'System boundary'`);
  lines.push("");

  // Containers
  for (const container of diagram.containers) {
    const safeContainerId = sanitizeLikeC4Id(container.id);

    // Determine container element kind from effects
    const containerEffects = domainEffects.filter(
      (e) => getContainerId(e.filePath, "directory") === container.id
    );
    const containerTags = generateElementTags(containerEffects);

    lines.push(`    ${safeContainerId} = container '${escapeString(container.name)}' {`);

    if (container.technology) {
      lines.push(`      technology '${escapeString(container.technology)}'`);
    }

    // Add description from effect summary
    const effectSummary = container.effects.slice(0, 3).join(", ");
    if (effectSummary) {
      lines.push(`      description '${escapeString(effectSummary)}'`);
    }

    // Add tags
    for (const tag of containerTags) {
      lines.push(`      #${tag}`);
    }

    // Components with source links
    if (container.components.length > 0) {
      lines.push("");
      for (const component of container.components) {
        const safeComponentId = sanitizeLikeC4Id(component.id);
        lines.push(`      ${safeComponentId} = component '${escapeString(component.name)}' {`);

        if (component.technology) {
          lines.push(`        technology '${escapeString(component.technology)}'`);
        }

        // Enhanced source code link with line numbers
        if (includeSourceLinks && component.filePath) {
          const sourceLink = formatSourceLink(component.filePath, sourceBasePath);
          lines.push(`        link ${sourceLink} 'Source Code'`);
        }

        // Add tags from component effects
        const componentEffects = domainEffects.filter(
          (e) => e.sourceEntityId === component.sourceEntityId
        );
        const componentTags = generateElementTags(componentEffects);
        for (const tag of componentTags) {
          lines.push(`        #${tag}`);
        }

        lines.push("      }");
      }
    }

    lines.push("    }");
  }

  lines.push("  }"); // End system
  lines.push("");

  // External systems with proper element kinds
  for (const ext of diagram.externalSystems) {
    const elementKind = getExternalElementKind(ext.provider, ext.type);
    const safeId = sanitizeLikeC4Id(ext.id);

    lines.push(`  ${safeId} = ${elementKind} '${escapeString(ext.name)}' {`);
    lines.push(`    description '${escapeString(ext.type)}'`);

    if (ext.provider) {
      const providerLink = getProviderDocLink(ext.provider);
      if (providerLink) {
        lines.push(`    link ${providerLink} 'Documentation'`);
      }
    }

    lines.push("  }");
  }

  lines.push("");

  // Relationships with proper relationship kinds
  for (const container of diagram.containers) {
    const safeContainerId = sanitizeLikeC4Id(container.id);

    for (const rel of container.relationships) {
      const safeToId = sanitizeLikeC4Id(rel.to);

      // Parse domain:action from label
      const [domain, action] = rel.label.split(":");
      const relKind = domain && action ? getRelationshipKind(domain, action) : "calls";

      // Add tag for the domain
      const tag = domain ? ` #${domain}` : "";

      lines.push(
        `  system.${safeContainerId} -[${relKind}]-> ${safeToId} '${escapeString(rel.label)}'${tag}`
      );
    }
  }

  lines.push("}");
  lines.push("");

  // Views section with container drill-down
  lines.push("views {");
  lines.push("  view containers {");
  lines.push(`    title '${escapeString(diagram.systemName)} - Container Diagram'`);
  lines.push("    include *");
  lines.push("    autoLayout TopBottom");
  lines.push("  }");

  // Create a view for each container to enable drill-down
  for (const container of diagram.containers) {
    if (container.components.length > 0) {
      const safeContainerId = sanitizeLikeC4Id(container.id);
      lines.push("");
      lines.push(`  view ${safeContainerId}_components of system.${safeContainerId} {`);
      lines.push(`    title '${escapeString(container.name)} - Components'`);
      lines.push("    include *");
      lines.push("    autoLayout TopBottom");
      lines.push("  }");
    }
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Escape single quotes in strings for LikeC4
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Format source link with optional line numbers
 */
function formatSourceLink(filePath: string, basePath = "./"): string {
  // Ensure path starts with ./ for relative links
  let link = filePath;
  if (!link.startsWith("./") && !link.startsWith("/") && !link.startsWith("http")) {
    link = `${basePath}${link}`;
  }

  // The link is already formatted - LikeC4 supports file#L10-L50 syntax
  return link;
}

/**
 * Get documentation link for known providers
 */
function getProviderDocLink(provider: string): string | undefined {
  const providerLinks: Record<string, string> = {
    stripe: "https://stripe.com/docs",
    dynamodb: "https://docs.aws.amazon.com/dynamodb/",
    s3: "https://docs.aws.amazon.com/s3/",
    sqs: "https://docs.aws.amazon.com/sqs/",
    sns: "https://docs.aws.amazon.com/sns/",
    cognito: "https://docs.aws.amazon.com/cognito/",
    lambda: "https://docs.aws.amazon.com/lambda/",
    rds: "https://docs.aws.amazon.com/rds/",
    redis: "https://redis.io/docs/",
    elasticsearch: "https://www.elastic.co/guide/",
    datadog: "https://docs.datadoghq.com/",
    cloudwatch: "https://docs.aws.amazon.com/cloudwatch/",
    prisma: "https://www.prisma.io/docs/",
    kysely: "https://kysely.dev/docs/",
  };

  return providerLinks[provider.toLowerCase()];
}

// =============================================================================
// Domain Discovery
// =============================================================================

/**
 * Discover domain boundaries from effects
 */
export interface DomainBoundary {
  /** Domain name */
  name: string;
  /** Files that belong to this domain */
  files: string[];
  /** Components in this domain */
  components: string[];
  /** Actions performed in this domain */
  actions: string[];
  /** External dependencies */
  externalDependencies: string[];
  /** Cohesion score (0-1, higher = more cohesive) */
  cohesionScore: number;
}

/**
 * Discover domain boundaries from domain effects
 */
export function discoverDomainBoundaries(effects: DomainEffect[]): DomainBoundary[] {
  const domainMap = new Map<
    string,
    {
      files: Set<string>;
      components: Set<string>;
      actions: Set<string>;
      externalDeps: Set<string>;
    }
  >();

  // Group by domain
  for (const effect of effects) {
    if (!domainMap.has(effect.domain)) {
      domainMap.set(effect.domain, {
        files: new Set(),
        components: new Set(),
        actions: new Set(),
        externalDeps: new Set(),
      });
    }

    const domain = domainMap.get(effect.domain);
    if (!domain) continue;
    domain.files.add(effect.filePath);
    domain.components.add(effect.sourceEntityId);
    domain.actions.add(effect.action);

    if (effect.metadata?.isExternal && effect.metadata?.provider) {
      domain.externalDeps.add(effect.metadata.provider as string);
    }
  }

  // Calculate cohesion and create boundaries
  const boundaries: DomainBoundary[] = [];
  for (const [name, data] of domainMap) {
    // Cohesion: ratio of components to files (lower = more spread out = less cohesive)
    const cohesionScore = Math.min(1, data.components.size / Math.max(1, data.files.size * 2));

    boundaries.push({
      name,
      files: Array.from(data.files),
      components: Array.from(data.components),
      actions: Array.from(data.actions),
      externalDependencies: Array.from(data.externalDeps),
      cohesionScore,
    });
  }

  // Sort by cohesion score (most cohesive first)
  boundaries.sort((a, b) => b.cohesionScore - a.cohesionScore);

  return boundaries;
}
