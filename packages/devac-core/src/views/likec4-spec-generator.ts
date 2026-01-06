/**
 * LikeC4 Specification Generator
 *
 * Generates custom LikeC4 specification blocks based on detected domains
 * and external systems. Creates element kinds, tags, and relationship types
 * that map to DevAC's effect-based architecture model.
 *
 * Part of DevAC v3.0 Foundation.
 */

import type { DomainEffect } from "../rules/rule-engine.js";
import type { C4ExternalSystem } from "./c4-generator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * LikeC4 element kind with styling
 */
export interface LikeC4ElementKind {
  /** Element kind name (e.g., "api_server", "database") */
  name: string;
  /** Shape for the element */
  shape: LikeC4Shape;
  /** Color for the element */
  color: LikeC4Color;
  /** Optional icon */
  icon?: string;
}

/**
 * LikeC4 relationship kind
 */
export interface LikeC4RelationshipKind {
  /** Relationship kind name */
  name: string;
  /** Line style */
  line?: "solid" | "dashed" | "dotted";
  /** Color */
  color?: LikeC4Color;
}

/**
 * LikeC4 tag definition
 */
export interface LikeC4Tag {
  /** Tag name */
  name: string;
  /** Optional description */
  description?: string;
}

/**
 * Complete LikeC4 specification
 */
export interface LikeC4Specification {
  /** Element kinds */
  elements: LikeC4ElementKind[];
  /** Tags */
  tags: LikeC4Tag[];
  /** Relationship kinds */
  relationships: LikeC4RelationshipKind[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Available LikeC4 shapes
 */
export type LikeC4Shape =
  | "rectangle"
  | "person"
  | "browser"
  | "mobile"
  | "cylinder"
  | "storage"
  | "queue"
  | "component";

/**
 * Available LikeC4 colors
 */
export type LikeC4Color =
  | "primary"
  | "secondary"
  | "muted"
  | "slate"
  | "blue"
  | "indigo"
  | "sky"
  | "red"
  | "gray"
  | "green"
  | "amber";

/**
 * Default element kinds for common architectural patterns
 */
export const DEFAULT_ELEMENT_KINDS: LikeC4ElementKind[] = [
  { name: "system", shape: "rectangle", color: "slate" },
  { name: "container", shape: "rectangle", color: "blue" },
  { name: "component", shape: "component", color: "sky" },
  { name: "external_system", shape: "rectangle", color: "muted" },
];

/**
 * Domain-specific element kinds
 */
export const DOMAIN_ELEMENT_KINDS: Record<string, LikeC4ElementKind> = {
  Database: { name: "database", shape: "storage", color: "blue" },
  Payment: { name: "payment_service", shape: "rectangle", color: "green" },
  Auth: { name: "auth_service", shape: "rectangle", color: "indigo" },
  HTTP: { name: "http_client", shape: "rectangle", color: "sky" },
  API: { name: "api_endpoint", shape: "rectangle", color: "primary" },
  Messaging: { name: "message_queue", shape: "queue", color: "amber" },
  Storage: { name: "file_storage", shape: "storage", color: "slate" },
  Observability: { name: "observability", shape: "rectangle", color: "gray" },
};

/**
 * External system element kinds by provider type
 */
export const EXTERNAL_ELEMENT_KINDS: Record<string, LikeC4ElementKind> = {
  stripe: { name: "stripe", shape: "rectangle", color: "indigo" },
  dynamodb: { name: "dynamodb", shape: "storage", color: "amber" },
  s3: { name: "s3_bucket", shape: "storage", color: "green" },
  sqs: { name: "sqs_queue", shape: "queue", color: "amber" },
  sns: { name: "sns_topic", shape: "queue", color: "red" },
  cognito: { name: "cognito", shape: "rectangle", color: "indigo" },
  lambda: { name: "lambda", shape: "rectangle", color: "amber" },
  rds: { name: "rds_database", shape: "cylinder", color: "blue" },
  redis: { name: "redis_cache", shape: "storage", color: "red" },
  elasticsearch: { name: "elasticsearch", shape: "storage", color: "green" },
  datadog: { name: "datadog", shape: "rectangle", color: "slate" },
  cloudwatch: { name: "cloudwatch", shape: "rectangle", color: "amber" },
};

/**
 * Default relationship kinds
 */
export const DEFAULT_RELATIONSHIP_KINDS: LikeC4RelationshipKind[] = [
  { name: "calls", line: "solid" },
  { name: "stores", line: "solid", color: "blue" },
  { name: "retrieves", line: "dashed", color: "blue" },
  { name: "sends", line: "solid", color: "amber" },
  { name: "receives", line: "dashed", color: "amber" },
  { name: "authenticates", line: "solid", color: "indigo" },
];

// =============================================================================
// Generator Functions
// =============================================================================

/**
 * Generate LikeC4 specification from domain effects
 *
 * @param effects - Domain effects to analyze
 * @param externalSystems - External systems detected
 * @returns Complete LikeC4 specification
 */
export function generateLikeC4Specification(
  effects: DomainEffect[],
  externalSystems: C4ExternalSystem[] = []
): LikeC4Specification {
  // Collect unique domains
  const domains = new Set<string>();
  for (const effect of effects) {
    domains.add(effect.domain);
  }

  // Collect unique providers
  const providers = new Set<string>();
  for (const ext of externalSystems) {
    if (ext.provider) {
      providers.add(ext.provider.toLowerCase());
    }
  }

  // Generate element kinds
  const elements: LikeC4ElementKind[] = [...DEFAULT_ELEMENT_KINDS];

  // Add domain-specific element kinds
  for (const domain of domains) {
    const domainKind = DOMAIN_ELEMENT_KINDS[domain];
    if (domainKind && !elements.some((e) => e.name === domainKind.name)) {
      elements.push(domainKind);
    }
  }

  // Add external provider element kinds
  for (const provider of providers) {
    const externalKind = EXTERNAL_ELEMENT_KINDS[provider];
    if (externalKind && !elements.some((e) => e.name === externalKind.name)) {
      elements.push(externalKind);
    }
  }

  // Generate tags from domains
  const tags: LikeC4Tag[] = Array.from(domains).map((domain) => ({
    name: domain,
    description: `Effects related to ${domain}`,
  }));

  // Generate relationship kinds
  const relationships: LikeC4RelationshipKind[] = [...DEFAULT_RELATIONSHIP_KINDS];

  return {
    elements,
    tags,
    relationships,
  };
}

/**
 * Export specification to LikeC4 DSL format
 *
 * @param spec - LikeC4 specification
 * @returns LikeC4 DSL string
 */
export function exportSpecificationToLikeC4(spec: LikeC4Specification): string {
  const lines: string[] = ["specification {"];

  // Element kinds
  for (const element of spec.elements) {
    lines.push(`  element ${element.name} {`);
    lines.push("    style {");
    lines.push(`      shape ${element.shape}`);
    lines.push(`      color ${element.color}`);
    if (element.icon) {
      lines.push(`      icon ${element.icon}`);
    }
    lines.push("    }");
    lines.push("  }");
  }

  lines.push("");

  // Tags
  for (const tag of spec.tags) {
    if (tag.description) {
      lines.push(`  // ${tag.description}`);
    }
    lines.push(`  tag ${tag.name}`);
  }

  lines.push("");

  // Relationship kinds
  for (const rel of spec.relationships) {
    lines.push(`  relationship ${rel.name} {`);
    if (rel.line) {
      lines.push(`    line ${rel.line}`);
    }
    if (rel.color) {
      lines.push(`    color ${rel.color}`);
    }
    lines.push("  }");
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Get the appropriate element kind for an external system
 *
 * @param provider - Provider name (e.g., "stripe", "dynamodb")
 * @param type - System type (e.g., "database", "payment")
 * @returns Element kind name
 */
export function getExternalElementKind(provider?: string, type?: string): string {
  if (provider) {
    const normalizedProvider = provider.toLowerCase();
    const externalKind = EXTERNAL_ELEMENT_KINDS[normalizedProvider];
    if (externalKind) {
      return externalKind.name;
    }
  }

  // Fallback to type-based mapping
  if (type) {
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes("database") || normalizedType.includes("db")) {
      return "database";
    }
    if (normalizedType.includes("queue") || normalizedType.includes("messaging")) {
      return "message_queue";
    }
    if (normalizedType.includes("storage") || normalizedType.includes("file")) {
      return "file_storage";
    }
    if (normalizedType.includes("payment")) {
      return "payment_service";
    }
    if (normalizedType.includes("auth")) {
      return "auth_service";
    }
  }

  return "external_system";
}

/**
 * Get the appropriate element kind for a container based on its effects
 *
 * @param effectDomains - Domains of effects in the container
 * @returns Element kind name
 */
export function getContainerElementKind(effectDomains: string[]): string {
  // Find the most common domain
  const domainCounts = new Map<string, number>();
  for (const domain of effectDomains) {
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }

  let maxDomain = "";
  let maxCount = 0;
  for (const [domain, count] of domainCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxDomain = domain;
    }
  }

  // Map to element kind
  if (maxDomain === "API") {
    return "api_endpoint";
  }
  if (maxDomain === "Database") {
    return "database";
  }
  if (maxDomain === "Messaging") {
    return "message_queue";
  }
  if (maxDomain === "Auth") {
    return "auth_service";
  }
  if (maxDomain === "Payment") {
    return "payment_service";
  }

  return "container";
}

/**
 * Generate tags for an element based on its effects
 *
 * @param effects - Domain effects
 * @returns Array of tag names
 */
export function generateElementTags(effects: DomainEffect[]): string[] {
  const tags = new Set<string>();
  for (const effect of effects) {
    tags.add(effect.domain);
  }
  return Array.from(tags);
}

/**
 * Map domain action to relationship kind
 *
 * @param domain - Domain name
 * @param action - Action name
 * @returns Relationship kind name
 */
export function getRelationshipKind(domain: string, action: string): string {
  const normalizedAction = action.toLowerCase();

  if (domain === "Database") {
    if (normalizedAction.includes("write") || normalizedAction.includes("insert")) {
      return "stores";
    }
    if (normalizedAction.includes("read") || normalizedAction.includes("query")) {
      return "retrieves";
    }
  }

  if (domain === "Messaging") {
    if (normalizedAction.includes("send") || normalizedAction.includes("publish")) {
      return "sends";
    }
    if (normalizedAction.includes("receive") || normalizedAction.includes("subscribe")) {
      return "receives";
    }
  }

  if (domain === "Auth") {
    return "authenticates";
  }

  return "calls";
}
