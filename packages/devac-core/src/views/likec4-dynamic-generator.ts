/**
 * LikeC4 Dynamic View Generator
 *
 * Generates dynamic views (sequence-like diagrams) from domain effects
 * to visualize effect execution flows. Identifies top effect chains
 * and renders them as LikeC4 dynamic view syntax.
 *
 * Part of DevAC v3.0 Foundation.
 */

import type { DomainEffect } from "../rules/rule-engine.js";
import { sanitizeLikeC4Id } from "./c4-generator.js";
import { getRelationshipKind } from "./likec4-spec-generator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * An effect chain represents a sequence of related effects
 */
export interface EffectChain {
  /** Unique identifier for the chain */
  id: string;
  /** Human-readable name for the chain */
  name: string;
  /** Domain this chain primarily belongs to */
  primaryDomain: string;
  /** Ordered list of effects in the chain */
  effects: DomainEffect[];
  /** Total importance score (for ranking) */
  score: number;
}

/**
 * A step in a dynamic view
 */
export interface DynamicViewStep {
  /** Source element ID */
  from: string;
  /** Source element display name */
  fromName: string;
  /** Target element ID */
  to: string;
  /** Target element display name */
  toName: string;
  /** Step label (action description) */
  label: string;
  /** Relationship kind */
  relationKind: string;
  /** Optional tag */
  tag?: string;
  /** Whether this is part of a parallel block */
  isParallel?: boolean;
}

/**
 * Options for dynamic view generation
 */
export interface DynamicViewOptions {
  /** Maximum number of effect chains to generate */
  maxChains?: number;
  /** Maximum steps per chain */
  maxStepsPerChain?: number;
  /** Include parallel effect blocks */
  includeParallel?: boolean;
  /** Title prefix for views */
  titlePrefix?: string;
}

// =============================================================================
// Effect Chain Analysis
// =============================================================================

/**
 * Analyze domain effects and identify top effect chains
 *
 * Effect chains are sequences of related effects that represent
 * a logical flow (e.g., payment processing, authentication flow).
 *
 * @param effects - Domain effects to analyze
 * @param options - Analysis options
 * @returns Array of effect chains sorted by importance
 */
export function identifyEffectChains(
  effects: DomainEffect[],
  options: DynamicViewOptions = {}
): EffectChain[] {
  const { maxChains = 5 } = options;

  // Group effects by domain
  const domainGroups = new Map<string, DomainEffect[]>();
  for (const effect of effects) {
    if (!domainGroups.has(effect.domain)) {
      domainGroups.set(effect.domain, []);
    }
    domainGroups.get(effect.domain)?.push(effect);
  }

  // Create chains from domain groups
  const chains: EffectChain[] = [];

  for (const [domain, domainEffects] of domainGroups) {
    // Group by source entity to find related effects
    const entityGroups = new Map<string, DomainEffect[]>();
    for (const effect of domainEffects) {
      const key = effect.sourceEntityId;
      if (!entityGroups.has(key)) {
        entityGroups.set(key, []);
      }
      entityGroups.get(key)?.push(effect);
    }

    // Find chains that involve external systems (most interesting)
    const externalEffects = domainEffects.filter((e) => e.metadata?.isExternal);
    if (externalEffects.length > 0) {
      // Group external effects by provider
      const providerGroups = new Map<string, DomainEffect[]>();
      for (const effect of externalEffects) {
        const provider = (effect.metadata?.provider as string) ?? "external";
        if (!providerGroups.has(provider)) {
          providerGroups.set(provider, []);
        }
        providerGroups.get(provider)?.push(effect);
      }

      for (const [provider, providerEffects] of providerGroups) {
        // Find related internal effects (same file or calling entity)
        const relatedEffects = findRelatedEffects(providerEffects, domainEffects);

        chains.push({
          id: `${domain.toLowerCase()}_${provider}_flow`,
          name: `${domain} ${formatProviderName(provider)} Flow`,
          primaryDomain: domain,
          effects: relatedEffects,
          score: calculateChainScore(relatedEffects),
        });
      }
    }

    // Also create a general domain chain if it has enough effects
    if (domainEffects.length >= 3 && !chains.some((c) => c.primaryDomain === domain)) {
      chains.push({
        id: `${domain.toLowerCase()}_flow`,
        name: `${domain} Operations`,
        primaryDomain: domain,
        effects: domainEffects.slice(0, 10),
        score: calculateChainScore(domainEffects),
      });
    }
  }

  // Sort by score and limit
  chains.sort((a, b) => b.score - a.score);

  return chains.slice(0, maxChains);
}

/**
 * Find effects related to a set of anchor effects
 */
function findRelatedEffects(
  anchorEffects: DomainEffect[],
  allEffects: DomainEffect[]
): DomainEffect[] {
  const result: DomainEffect[] = [];
  const addedIds = new Set<string>();

  // Get files and entities involved in anchor effects
  const anchorFiles = new Set(anchorEffects.map((e) => e.filePath));
  const anchorEntities = new Set(anchorEffects.map((e) => e.sourceEntityId));

  // Add anchor effects first
  for (const effect of anchorEffects) {
    const key = `${effect.sourceEntityId}:${effect.action}`;
    if (!addedIds.has(key)) {
      result.push(effect);
      addedIds.add(key);
    }
  }

  // Find effects from same entities or files
  for (const effect of allEffects) {
    const key = `${effect.sourceEntityId}:${effect.action}`;
    if (addedIds.has(key)) continue;

    if (anchorFiles.has(effect.filePath) || anchorEntities.has(effect.sourceEntityId)) {
      result.push(effect);
      addedIds.add(key);
    }
  }

  return result;
}

/**
 * Calculate importance score for an effect chain
 */
function calculateChainScore(effects: DomainEffect[]): number {
  let score = 0;

  for (const effect of effects) {
    // External effects are more interesting
    if (effect.metadata?.isExternal) {
      score += 10;
    }

    // Domain-specific scoring
    switch (effect.domain) {
      case "Payment":
        score += 5; // Payment flows are critical
        break;
      case "Auth":
        score += 4; // Auth flows are important
        break;
      case "Database":
        score += 2; // Database operations add context
        break;
      default:
        score += 1;
    }
  }

  // Bonus for longer chains (more complete picture)
  if (effects.length >= 3) {
    score += effects.length;
  }

  return score;
}

/**
 * Format provider name for display
 */
function formatProviderName(provider: string): string {
  return provider
    .replace(/^aws-/, "")
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// =============================================================================
// Dynamic View Generation
// =============================================================================

/**
 * Convert an effect chain to dynamic view steps
 *
 * @param chain - Effect chain to convert
 * @param options - Generation options
 * @returns Array of dynamic view steps
 */
export function chainToSteps(
  chain: EffectChain,
  options: DynamicViewOptions = {}
): DynamicViewStep[] {
  const { maxStepsPerChain = 8 } = options;
  const steps: DynamicViewStep[] = [];

  // Sort effects to create a logical flow
  const sortedEffects = sortEffectsForFlow(chain.effects);

  for (const effect of sortedEffects.slice(0, maxStepsPerChain)) {
    const fromId = sanitizeLikeC4Id(effect.sourceEntityId);
    const fromName = extractComponentName(effect.sourceEntityId);

    // Determine target based on effect type
    let toId: string;
    let toName: string;

    if (effect.metadata?.isExternal) {
      const provider = (effect.metadata?.provider as string) ?? "external";
      toId = sanitizeLikeC4Id(`external_${effect.domain}_${provider}`);
      toName = formatProviderName(provider);
    } else {
      // Internal effect - target is inferred from callee or action
      toId = sanitizeLikeC4Id(`${effect.domain.toLowerCase()}_service`);
      toName = `${effect.domain} Service`;
    }

    steps.push({
      from: fromId,
      fromName,
      to: toId,
      toName,
      label: formatStepLabel(effect),
      relationKind: getRelationshipKind(effect.domain, effect.action),
      tag: effect.domain,
    });
  }

  return steps;
}

/**
 * Sort effects to create a logical flow order
 */
function sortEffectsForFlow(effects: DomainEffect[]): DomainEffect[] {
  // Priority: API/Request first, then internal, then external (database, payment, etc.)
  return [...effects].sort((a, b) => {
    const priorityA = getEffectPriority(a);
    const priorityB = getEffectPriority(b);
    return priorityA - priorityB;
  });
}

/**
 * Get sorting priority for an effect
 */
function getEffectPriority(effect: DomainEffect): number {
  // Entry points first
  if (effect.domain === "API" || effect.action.toLowerCase().includes("request")) {
    return 0;
  }

  // Auth/validation early
  if (effect.domain === "Auth") {
    return 1;
  }

  // Business logic in middle
  if (effect.domain === "Payment" || effect.domain === "HTTP") {
    return 2;
  }

  // Database operations later
  if (effect.domain === "Database") {
    return 3;
  }

  // Messaging/async last
  if (effect.domain === "Messaging") {
    return 4;
  }

  return 5;
}

/**
 * Extract component name from entity ID
 */
function extractComponentName(entityId: string): string {
  const parts = entityId.split(":");
  if (parts.length >= 3) {
    const hash = parts[parts.length - 1] ?? "";
    return hash.length > 12 ? hash.slice(0, 12) : hash;
  }
  return entityId.slice(0, 16);
}

/**
 * Format step label from effect
 */
function formatStepLabel(effect: DomainEffect): string {
  // Try to use callee info if available
  if (effect.metadata?.callee) {
    const callee = effect.metadata.callee as string;
    // Extract the method name
    const parts = callee.split(".");
    return parts[parts.length - 1] ?? effect.action;
  }

  return `${effect.domain}:${effect.action}`;
}

// =============================================================================
// LikeC4 Dynamic View Export
// =============================================================================

/**
 * Generate a complete LikeC4 dynamic view from effect chains
 *
 * @param chains - Effect chains to include
 * @param options - Generation options
 * @returns LikeC4 dynamic view DSL string
 */
export function generateDynamicViews(
  chains: EffectChain[],
  options: DynamicViewOptions = {}
): string {
  const { titlePrefix = "" } = options;

  if (chains.length === 0) {
    return generateEmptyDynamicView(titlePrefix);
  }

  const lines: string[] = [];

  // Generate a dynamic view for each chain
  for (const chain of chains) {
    const steps = chainToSteps(chain, options);

    if (steps.length === 0) continue;

    lines.push(`dynamic view ${chain.id} {`);
    lines.push(
      `  title '${escapeString(titlePrefix ? `${titlePrefix} - ${chain.name}` : chain.name)}'`
    );
    lines.push(`  description 'Effect flow for ${chain.primaryDomain} operations'`);
    lines.push("");

    // Generate steps
    for (const step of steps) {
      const tag = step.tag ? ` #${step.tag}` : "";
      lines.push(`  ${step.from} -> ${step.to} '${escapeString(step.label)}'${tag}`);
    }

    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate an empty dynamic view placeholder
 */
function generateEmptyDynamicView(titlePrefix: string): string {
  const title = titlePrefix ? `${titlePrefix} - Effect Flows` : "Effect Flows";

  return `dynamic view effects_flow {
  title '${escapeString(title)}'
  description 'No effect chains detected. Run devac sync to extract effects.'
}
`;
}

/**
 * Generate a complete LikeC4 file with dynamic views
 *
 * Includes specification, placeholder model elements, and dynamic views
 *
 * @param effects - Domain effects to analyze
 * @param systemName - Name of the system
 * @param options - Generation options
 * @returns Complete LikeC4 DSL string
 */
export function generateEffectsFlowLikeC4(
  effects: DomainEffect[],
  systemName: string,
  options: DynamicViewOptions = {}
): string {
  // Identify effect chains
  const chains = identifyEffectChains(effects, options);

  const lines: string[] = [];

  // Specification block
  lines.push("specification {");
  lines.push("  element system");
  lines.push("  element component");
  lines.push("  element external_system");
  lines.push("  element database { style { shape storage } }");
  lines.push("  element queue { style { shape queue } }");
  lines.push("");
  lines.push("  tag Payment");
  lines.push("  tag Database");
  lines.push("  tag Auth");
  lines.push("  tag Messaging");
  lines.push("  tag HTTP");
  lines.push("  tag API");
  lines.push("");
  lines.push("  relationship calls");
  lines.push("  relationship stores");
  lines.push("  relationship retrieves");
  lines.push("  relationship sends");
  lines.push("}");
  lines.push("");

  // Model block with elements referenced in dynamic views
  lines.push("model {");
  lines.push(`  system = system '${escapeString(systemName)}' {`);
  lines.push("    description 'System boundary'");

  // Collect all unique elements from chains
  const elements = collectElementsFromChains(chains);

  // Add internal components
  for (const [id, name] of elements.internal) {
    lines.push(`    ${id} = component '${escapeString(name)}'`);
  }

  lines.push("  }");
  lines.push("");

  // Add external systems
  for (const [id, info] of elements.external) {
    const elementType =
      info.type === "database" ? "database" : info.type === "queue" ? "queue" : "external_system";
    lines.push(`  ${id} = ${elementType} '${escapeString(info.name)}'`);
  }

  lines.push("}");
  lines.push("");

  // Views block with dynamic views
  lines.push("views {");

  // Generate dynamic views
  const dynamicViews = generateDynamicViews(chains, {
    ...options,
    titlePrefix: systemName,
  });

  // Indent dynamic views
  const indentedViews = dynamicViews
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

  lines.push(indentedViews);

  lines.push("}");

  return lines.join("\n");
}

/**
 * Collect all unique elements referenced in effect chains
 */
function collectElementsFromChains(chains: EffectChain[]): {
  internal: Map<string, string>;
  external: Map<string, { name: string; type: string }>;
} {
  const internal = new Map<string, string>();
  const external = new Map<string, { name: string; type: string }>();

  for (const chain of chains) {
    for (const effect of chain.effects) {
      // Internal component
      const internalId = sanitizeLikeC4Id(effect.sourceEntityId);
      if (!internal.has(internalId)) {
        internal.set(internalId, extractComponentName(effect.sourceEntityId));
      }

      // External system
      if (effect.metadata?.isExternal) {
        const provider = (effect.metadata?.provider as string) ?? "external";
        const externalId = sanitizeLikeC4Id(`external_${effect.domain}_${provider}`);

        if (!external.has(externalId)) {
          let type = "external";
          if (effect.domain === "Database") type = "database";
          if (effect.domain === "Messaging") type = "queue";

          external.set(externalId, {
            name: formatProviderName(provider),
            type,
          });
        }
      }
    }
  }

  return { internal, external };
}

/**
 * Escape single quotes in strings for LikeC4
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}
