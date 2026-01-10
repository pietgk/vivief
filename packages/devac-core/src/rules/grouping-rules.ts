/**
 * Grouping Rules - Container/Layer Assignment
 *
 * Rules for grouping components into logical containers and layers
 * for C4 diagram generation. Unlike domain rules that classify effects
 * by their behavior, grouping rules classify by architectural role.
 *
 * Part of DevAC v3.0 Foundation.
 */

import type { EnrichedDomainEffect } from "../types/enriched-effects.js";
import type { DomainEffect } from "./rule-engine.js";

/**
 * Match criteria for a grouping rule
 */
export interface GroupingMatch {
  /** File path pattern (string for includes, RegExp for pattern) */
  filePath?: string | RegExp;
  /** Entity kind to match (function, class, method, etc.) */
  entityKind?: string | string[];
  /** Entity name pattern */
  entityName?: string | RegExp;
  /** Match effects in specific domain(s) */
  domain?: string | string[];
  /** Match effects with specific action(s) */
  action?: string | string[];
  /** Custom predicate for complex matching */
  predicate?: (effect: DomainEffect | EnrichedDomainEffect) => boolean;
}

/**
 * What the grouping rule emits when matched
 */
export interface GroupingEmit {
  /** Container/layer name (e.g., "Analysis Layer") */
  container: string;
  /** Optional layer classification for hierarchical grouping */
  layer?: "presentation" | "application" | "domain" | "infrastructure";
  /** Additional tags for filtering and visualization */
  tags?: string[];
}

/**
 * A rule that assigns effects to containers/layers
 */
export interface GroupingRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this rule matches */
  description?: string;
  /** Match criteria */
  match: GroupingMatch;
  /** Container/layer assignment */
  emit: GroupingEmit;
  /** Priority (higher = evaluated first) */
  priority?: number;
  /** Whether this rule is enabled */
  enabled?: boolean;
}

/**
 * Result of applying grouping rules to an effect
 */
export interface GroupingResult {
  /** Original effect */
  effect: DomainEffect | EnrichedDomainEffect;
  /** Assigned container */
  container: string;
  /** Assigned layer (if any) */
  layer?: string;
  /** Rule that matched (null if default) */
  ruleId: string | null;
  /** Tags from the matched rule */
  tags: string[];
}

/**
 * Type guard to check if a DomainEffect is enriched
 */
function isEnrichedEffect(
  effect: DomainEffect | EnrichedDomainEffect
): effect is EnrichedDomainEffect {
  return "sourceName" in effect && "relativeFilePath" in effect;
}

/**
 * Get file path from effect (relative if enriched, absolute otherwise)
 */
function getEffectPath(effect: DomainEffect | EnrichedDomainEffect): string {
  return isEnrichedEffect(effect) ? effect.relativeFilePath : effect.filePath;
}

/**
 * Get entity name from effect (readable name if enriched)
 */
function getEffectName(effect: DomainEffect | EnrichedDomainEffect): string {
  return isEnrichedEffect(effect) ? effect.sourceName : effect.sourceEntityId;
}

/**
 * Get entity kind from effect (if enriched)
 */
function getEffectKind(effect: DomainEffect | EnrichedDomainEffect): string | undefined {
  return isEnrichedEffect(effect) ? effect.sourceKind : undefined;
}

/**
 * Check if a string matches a pattern (string or RegExp)
 */
function matchesPattern(value: string | null | undefined, pattern: string | RegExp): boolean {
  if (value == null) return false;
  if (typeof pattern === "string") {
    return value.includes(pattern);
  }
  return pattern.test(value);
}

/**
 * Check if a value is in an array (or matches if not array)
 */
function matchesArrayOrValue<T>(value: T, arrayOrValue: T | T[]): boolean {
  if (Array.isArray(arrayOrValue)) {
    return arrayOrValue.includes(value);
  }
  return value === arrayOrValue;
}

/**
 * Check if an effect matches a grouping rule's criteria
 */
function effectMatchesGroupingRule(
  effect: DomainEffect | EnrichedDomainEffect,
  match: GroupingMatch
): boolean {
  // Check file path
  if (match.filePath) {
    const path = getEffectPath(effect);
    if (!matchesPattern(path, match.filePath)) {
      return false;
    }
  }

  // Check entity kind (only for enriched effects)
  if (match.entityKind) {
    const kind = getEffectKind(effect);
    if (kind === undefined) {
      return false;
    }
    if (!matchesArrayOrValue(kind, match.entityKind)) {
      return false;
    }
  }

  // Check entity name
  if (match.entityName) {
    const name = getEffectName(effect);
    if (!matchesPattern(name, match.entityName)) {
      return false;
    }
  }

  // Check domain
  if (match.domain) {
    if (!matchesArrayOrValue(effect.domain, match.domain)) {
      return false;
    }
  }

  // Check action
  if (match.action) {
    if (!matchesArrayOrValue(effect.action, match.action)) {
      return false;
    }
  }

  // Run custom predicate if provided
  if (match.predicate) {
    if (!match.predicate(effect)) {
      return false;
    }
  }

  return true;
}

/**
 * Utility to create a grouping rule with defaults
 */
export function defineGroupingRule(
  rule: Omit<GroupingRule, "enabled"> & { enabled?: boolean }
): GroupingRule {
  return {
    ...rule,
    enabled: rule.enabled ?? true,
    priority: rule.priority ?? 0,
  };
}

// =============================================================================
// Analysis Layer Rules
// =============================================================================

/**
 * Rules for the Analysis Layer - parsers, analyzers, semantic resolution
 */
export const analysisLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-parsers",
    name: "Parsers",
    description: "Tree-sitter parsers and AST processing",
    match: {
      filePath: /parsers?[\/\-]/i,
    },
    emit: {
      container: "Analysis Layer",
      layer: "domain",
      tags: ["parser", "ast"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-analyzers",
    name: "Analyzers",
    description: "Code analysis and extraction logic",
    match: {
      filePath: /analyz(er|e|ing)/i,
    },
    emit: {
      container: "Analysis Layer",
      layer: "domain",
      tags: ["analyzer"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-semantic-resolver",
    name: "Semantic Resolver",
    description: "Semantic analysis and symbol resolution",
    match: {
      filePath: /semantic|resolver|symbols?/i,
    },
    emit: {
      container: "Analysis Layer",
      layer: "domain",
      tags: ["semantic"],
    },
    priority: 15,
  }),

  defineGroupingRule({
    id: "grouping-extractors",
    name: "Extractors",
    description: "Data extraction from parsed code",
    match: {
      filePath: /extract(or|ion)?/i,
    },
    emit: {
      container: "Analysis Layer",
      layer: "domain",
      tags: ["extractor"],
    },
    priority: 15,
  }),
];

// =============================================================================
// Storage Layer Rules
// =============================================================================

/**
 * Rules for the Storage Layer - DuckDB, Parquet, seed management
 */
export const storageLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-duckdb",
    name: "DuckDB Operations",
    description: "DuckDB database operations and queries",
    match: {
      filePath: /duckdb|duck-?db/i,
    },
    emit: {
      container: "Storage Layer",
      layer: "infrastructure",
      tags: ["database", "duckdb"],
    },
    priority: 25,
  }),

  defineGroupingRule({
    id: "grouping-parquet",
    name: "Parquet Storage",
    description: "Parquet file handling",
    match: {
      filePath: /parquet/i,
    },
    emit: {
      container: "Storage Layer",
      layer: "infrastructure",
      tags: ["storage", "parquet"],
    },
    priority: 25,
  }),

  defineGroupingRule({
    id: "grouping-seeds",
    name: "Seed Management",
    description: "Seed file generation and management",
    match: {
      filePath: /seeds?[\/\-]|seed-?writer|seed-?reader/i,
    },
    emit: {
      container: "Storage Layer",
      layer: "infrastructure",
      tags: ["seed"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-cache",
    name: "Cache Layer",
    description: "Caching mechanisms",
    match: {
      filePath: /cache/i,
    },
    emit: {
      container: "Storage Layer",
      layer: "infrastructure",
      tags: ["cache"],
    },
    priority: 15,
  }),
];

// =============================================================================
// Federation Layer Rules
// =============================================================================

/**
 * Rules for the Federation Layer - cross-repo, hub, registry
 */
export const federationLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-hub",
    name: "Central Hub",
    description: "Central hub for cross-repo federation",
    match: {
      filePath: /hub|central/i,
    },
    emit: {
      container: "Federation Layer",
      layer: "application",
      tags: ["hub", "federation"],
    },
    priority: 25,
  }),

  defineGroupingRule({
    id: "grouping-registry",
    name: "Registry",
    description: "Package/repo registry management",
    match: {
      filePath: /registry|manifest/i,
    },
    emit: {
      container: "Federation Layer",
      layer: "application",
      tags: ["registry"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-federation-client",
    name: "Federation Client",
    description: "Client for cross-repo queries",
    match: {
      filePath: /federat(e|ion)|cross-?repo/i,
    },
    emit: {
      container: "Federation Layer",
      layer: "application",
      tags: ["federation", "client"],
    },
    priority: 15,
  }),
];

// =============================================================================
// API Layer Rules
// =============================================================================

/**
 * Rules for the API Layer - MCP tools, CLI commands
 */
export const apiLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-mcp-tools",
    name: "MCP Tools",
    description: "MCP server tools for AI assistants",
    match: {
      filePath: /mcp|tools?[\/\-]/i,
    },
    emit: {
      container: "API Layer",
      layer: "presentation",
      tags: ["mcp", "api"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-cli-commands",
    name: "CLI Commands",
    description: "Command-line interface commands",
    match: {
      filePath: /commands?[\/\-]/i,
    },
    emit: {
      container: "API Layer",
      layer: "presentation",
      tags: ["cli", "command"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-handlers",
    name: "Request Handlers",
    description: "Request/event handlers",
    match: {
      filePath: /handlers?[\/\-]/i,
    },
    emit: {
      container: "API Layer",
      layer: "presentation",
      tags: ["handler"],
    },
    priority: 15,
  }),
];

// =============================================================================
// Rules Layer Rules
// =============================================================================

/**
 * Rules for the Rules Layer - rule engine, builtin rules
 */
export const rulesLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-rule-engine",
    name: "Rule Engine",
    description: "Core rule engine for effect classification",
    match: {
      filePath: /rule-?engine/i,
    },
    emit: {
      container: "Rules Layer",
      layer: "domain",
      tags: ["rules", "engine"],
    },
    priority: 25,
  }),

  defineGroupingRule({
    id: "grouping-builtin-rules",
    name: "Builtin Rules",
    description: "Predefined domain effect rules",
    match: {
      filePath: /builtin-?rules|domain-?rules/i,
    },
    emit: {
      container: "Rules Layer",
      layer: "domain",
      tags: ["rules", "builtin"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-rules-generic",
    name: "Rules",
    description: "Generic rules directory",
    match: {
      filePath: /\/rules\//i,
    },
    emit: {
      container: "Rules Layer",
      layer: "domain",
      tags: ["rules"],
    },
    priority: 10,
  }),
];

// =============================================================================
// Views Layer Rules
// =============================================================================

/**
 * Rules for the Views Layer - C4 generation, diagram output
 */
export const viewsLayerRules: GroupingRule[] = [
  defineGroupingRule({
    id: "grouping-c4-generator",
    name: "C4 Generator",
    description: "C4 diagram generation",
    match: {
      filePath: /c4|diagram/i,
    },
    emit: {
      container: "Views Layer",
      layer: "presentation",
      tags: ["c4", "diagram"],
    },
    priority: 20,
  }),

  defineGroupingRule({
    id: "grouping-views-generic",
    name: "Views",
    description: "Generic views directory",
    match: {
      filePath: /\/views\//i,
    },
    emit: {
      container: "Views Layer",
      layer: "presentation",
      tags: ["views"],
    },
    priority: 10,
  }),
];

// =============================================================================
// Combined Grouping Rules
// =============================================================================

/**
 * All builtin grouping rules combined
 */
export const builtinGroupingRules: GroupingRule[] = [
  ...analysisLayerRules,
  ...storageLayerRules,
  ...federationLayerRules,
  ...apiLayerRules,
  ...rulesLayerRules,
  ...viewsLayerRules,
];

// =============================================================================
// Grouping Engine
// =============================================================================

/**
 * Configuration for the grouping engine
 */
export interface GroupingEngineConfig {
  /** Rules to apply */
  rules: GroupingRule[];
  /** Default container for unmatched effects */
  defaultContainer?: string;
  /** Default layer for unmatched effects */
  defaultLayer?: "presentation" | "application" | "domain" | "infrastructure";
}

/**
 * Statistics from grouping engine run
 */
export interface GroupingEngineStats {
  /** Total effects processed */
  totalEffects: number;
  /** Effects matched by rules */
  matchedCount: number;
  /** Effects using default container */
  defaultCount: number;
  /** Rule match counts */
  ruleStats: Map<string, number>;
  /** Container distribution */
  containerStats: Map<string, number>;
}

/**
 * Engine for applying grouping rules to effects
 */
export class GroupingEngine {
  private rules: GroupingRule[];
  private defaultContainer: string;
  private defaultLayer?: string;

  constructor(config: GroupingEngineConfig) {
    // Sort rules by priority (higher first)
    this.rules = [...config.rules]
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.defaultContainer = config.defaultContainer ?? "Other";
    this.defaultLayer = config.defaultLayer;
  }

  /**
   * Apply grouping rules to a single effect
   */
  applyToEffect(effect: DomainEffect | EnrichedDomainEffect): GroupingResult {
    for (const rule of this.rules) {
      if (effectMatchesGroupingRule(effect, rule.match)) {
        return {
          effect,
          container: rule.emit.container,
          layer: rule.emit.layer,
          ruleId: rule.id,
          tags: rule.emit.tags ?? [],
        };
      }
    }

    // No rule matched, use default
    return {
      effect,
      container: this.defaultContainer,
      layer: this.defaultLayer,
      ruleId: null,
      tags: [],
    };
  }

  /**
   * Apply grouping rules to multiple effects
   */
  applyToEffects(effects: (DomainEffect | EnrichedDomainEffect)[]): {
    results: GroupingResult[];
    stats: GroupingEngineStats;
  } {
    const results: GroupingResult[] = [];
    const ruleStats = new Map<string, number>();
    const containerStats = new Map<string, number>();
    let matchedCount = 0;
    let defaultCount = 0;

    // Initialize rule stats
    for (const rule of this.rules) {
      ruleStats.set(rule.id, 0);
    }

    for (const effect of effects) {
      const result = this.applyToEffect(effect);
      results.push(result);

      // Update stats
      if (result.ruleId) {
        matchedCount++;
        ruleStats.set(result.ruleId, (ruleStats.get(result.ruleId) ?? 0) + 1);
      } else {
        defaultCount++;
      }

      containerStats.set(result.container, (containerStats.get(result.container) ?? 0) + 1);
    }

    return {
      results,
      stats: {
        totalEffects: effects.length,
        matchedCount,
        defaultCount,
        ruleStats,
        containerStats,
      },
    };
  }

  /**
   * Get all registered rules
   */
  getRules(): readonly GroupingRule[] {
    return this.rules;
  }
}

/**
 * Create a grouping engine with the given configuration
 */
export function createGroupingEngine(config: GroupingEngineConfig): GroupingEngine {
  return new GroupingEngine(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get grouping rules by container
 */
export function getGroupingRulesByContainer(container: string): GroupingRule[] {
  return builtinGroupingRules.filter((rule) => rule.emit.container === container);
}

/**
 * Get grouping rules by layer
 */
export function getGroupingRulesByLayer(
  layer: "presentation" | "application" | "domain" | "infrastructure"
): GroupingRule[] {
  return builtinGroupingRules.filter((rule) => rule.emit.layer === layer);
}

/**
 * Get all unique containers from rules
 */
export function getAvailableContainers(): string[] {
  const containers = new Set<string>();
  for (const rule of builtinGroupingRules) {
    containers.add(rule.emit.container);
  }
  return Array.from(containers).sort();
}

/**
 * Get all unique tags from rules
 */
export function getAvailableTags(): string[] {
  const tags = new Set<string>();
  for (const rule of builtinGroupingRules) {
    for (const tag of rule.emit.tags ?? []) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}
