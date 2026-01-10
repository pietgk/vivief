/**
 * Significance Rules - Architectural Importance Classification
 *
 * Rules for classifying effects by their architectural significance.
 * Used to filter noise from C4 diagrams and highlight critical components.
 *
 * Significance Levels:
 * - critical: Must appear in all diagrams (public API, heavy usage)
 * - important: Should appear in container diagrams (domain logic)
 * - minor: Only show in detailed views (helpers, utilities)
 * - hidden: Never show (logging, debug, internal)
 *
 * Part of DevAC v3.0 Foundation.
 */

import type { EnrichedDomainEffect } from "../types/enriched-effects.js";
import type { DomainEffect } from "./rule-engine.js";

/**
 * Significance level for effects
 */
export type SignificanceLevel = "critical" | "important" | "minor" | "hidden";

/**
 * Context for significance evaluation (aggregate stats)
 */
export interface SignificanceContext {
  /** Total effects in the codebase */
  totalEffects: number;
  /** Effect counts by domain */
  domainCounts: Record<string, number>;
  /** Effect counts by action */
  actionCounts: Record<string, number>;
  /** Optional: Number of dependents per entity */
  dependentCounts?: Map<string, number>;
  /** Optional: Exported entity IDs */
  exportedEntities?: Set<string>;
}

/**
 * Match criteria for a significance rule
 */
export interface SignificanceMatch {
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
  /** Match exported entities only */
  isExported?: boolean;
  /** Match entities with minimum dependents */
  minDependents?: number;
  /** Custom predicate with context access */
  predicate?: (
    effect: DomainEffect | EnrichedDomainEffect,
    context: SignificanceContext
  ) => boolean;
}

/**
 * What the significance rule emits when matched
 */
export interface SignificanceEmit {
  /** Significance level */
  level: SignificanceLevel;
  /** Human-readable reason for this classification */
  reason?: string;
}

/**
 * A rule that classifies effects by significance
 */
export interface SignificanceRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this rule matches */
  description?: string;
  /** Match criteria */
  match: SignificanceMatch;
  /** Significance classification */
  emit: SignificanceEmit;
  /** Priority (higher = evaluated first) */
  priority?: number;
  /** Whether this rule is enabled */
  enabled?: boolean;
}

/**
 * Result of applying significance rules to an effect
 */
export interface SignificanceResult {
  /** Original effect */
  effect: DomainEffect | EnrichedDomainEffect;
  /** Assigned significance level */
  level: SignificanceLevel;
  /** Rule that matched (null if default) */
  ruleId: string | null;
  /** Reason for this classification */
  reason?: string;
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
 * Check if an effect matches a significance rule's criteria
 */
function effectMatchesSignificanceRule(
  effect: DomainEffect | EnrichedDomainEffect,
  match: SignificanceMatch,
  context: SignificanceContext
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

  // Check exported status
  if (match.isExported !== undefined) {
    const isExported = context.exportedEntities?.has(effect.sourceEntityId) ?? false;
    if (isExported !== match.isExported) {
      return false;
    }
  }

  // Check minimum dependents
  if (match.minDependents !== undefined) {
    const dependentCount = context.dependentCounts?.get(effect.sourceEntityId) ?? 0;
    if (dependentCount < match.minDependents) {
      return false;
    }
  }

  // Run custom predicate if provided
  if (match.predicate) {
    if (!match.predicate(effect, context)) {
      return false;
    }
  }

  return true;
}

/**
 * Utility to create a significance rule with defaults
 */
export function defineSignificanceRule(
  rule: Omit<SignificanceRule, "enabled"> & { enabled?: boolean }
): SignificanceRule {
  return {
    ...rule,
    enabled: rule.enabled ?? true,
    priority: rule.priority ?? 0,
  };
}

// =============================================================================
// Critical Significance Rules
// =============================================================================

/**
 * Rules for CRITICAL components - must appear in all diagrams
 */
export const criticalSignificanceRules: SignificanceRule[] = [
  defineSignificanceRule({
    id: "sig-payment-operations",
    name: "Payment Operations",
    description: "Payment processing is always critical",
    match: {
      domain: "Payment",
    },
    emit: {
      level: "critical",
      reason: "Payment operations are business-critical",
    },
    priority: 100,
  }),

  defineSignificanceRule({
    id: "sig-auth-operations",
    name: "Authentication Operations",
    description: "Auth operations are security-critical",
    match: {
      domain: "Auth",
    },
    emit: {
      level: "critical",
      reason: "Authentication is security-critical",
    },
    priority: 100,
  }),

  defineSignificanceRule({
    id: "sig-high-dependents",
    name: "Heavily Used Components",
    description: "Components with many dependents are architecturally significant",
    match: {
      minDependents: 5,
    },
    emit: {
      level: "critical",
      reason: "Used by 5+ other components",
    },
    priority: 90,
  }),

  defineSignificanceRule({
    id: "sig-exported-api",
    name: "Exported Public API",
    description: "Exported functions are part of public API",
    match: {
      isExported: true,
      entityKind: ["function", "class"],
    },
    emit: {
      level: "critical",
      reason: "Part of public API",
    },
    priority: 85,
  }),

  defineSignificanceRule({
    id: "sig-api-endpoints",
    name: "API Endpoints",
    description: "tRPC procedures and API handlers are entry points",
    match: {
      domain: "API",
    },
    emit: {
      level: "critical",
      reason: "API endpoint / entry point",
    },
    priority: 80,
  }),
];

// =============================================================================
// Important Significance Rules
// =============================================================================

/**
 * Rules for IMPORTANT components - show in container diagrams
 */
export const importantSignificanceRules: SignificanceRule[] = [
  defineSignificanceRule({
    id: "sig-database-operations",
    name: "Database Operations",
    description: "Database access is important for understanding data flow",
    match: {
      domain: "Database",
    },
    emit: {
      level: "important",
      reason: "Data persistence operations",
    },
    priority: 60,
  }),

  defineSignificanceRule({
    id: "sig-messaging-operations",
    name: "Messaging Operations",
    description: "Message queues affect system architecture",
    match: {
      domain: "Messaging",
    },
    emit: {
      level: "important",
      reason: "Async messaging / event-driven",
    },
    priority: 60,
  }),

  defineSignificanceRule({
    id: "sig-storage-operations",
    name: "Storage Operations",
    description: "File/object storage operations",
    match: {
      domain: "Storage",
    },
    emit: {
      level: "important",
      reason: "File/object storage",
    },
    priority: 55,
  }),

  defineSignificanceRule({
    id: "sig-http-external",
    name: "External HTTP Calls",
    description: "External HTTP calls define system boundaries",
    match: {
      domain: "HTTP",
    },
    emit: {
      level: "important",
      reason: "External system integration",
    },
    priority: 55,
  }),

  defineSignificanceRule({
    id: "sig-moderate-dependents",
    name: "Moderately Used Components",
    description: "Components with some dependents",
    match: {
      minDependents: 2,
    },
    emit: {
      level: "important",
      reason: "Used by 2+ components",
    },
    priority: 50,
  }),
];

// =============================================================================
// Minor Significance Rules
// =============================================================================

/**
 * Rules for MINOR components - only in detailed views
 */
export const minorSignificanceRules: SignificanceRule[] = [
  defineSignificanceRule({
    id: "sig-utility-files",
    name: "Utility Files",
    description: "Files in utility/helper directories",
    match: {
      filePath: /util(s|ity|ities)?[\/\-]|helper(s)?[\/\-]/i,
    },
    emit: {
      level: "minor",
      reason: "Utility / helper code",
    },
    priority: 30,
  }),

  defineSignificanceRule({
    id: "sig-utility-functions",
    name: "Utility Functions",
    description: "Functions with utility/helper naming patterns",
    match: {
      entityName: /^(get|set|is|has|format|parse|convert|transform|validate|normalize)/i,
    },
    emit: {
      level: "minor",
      reason: "Utility function pattern",
    },
    priority: 25,
  }),

  defineSignificanceRule({
    id: "sig-internal-only",
    name: "Internal Only",
    description: "Non-exported internal functions",
    match: {
      isExported: false,
      entityKind: "function",
    },
    emit: {
      level: "minor",
      reason: "Internal implementation detail",
    },
    priority: 20,
  }),

  defineSignificanceRule({
    id: "sig-type-files",
    name: "Type Definition Files",
    description: "TypeScript type definition files",
    match: {
      filePath: /types?[\/\-]|\.d\.ts$/i,
    },
    emit: {
      level: "minor",
      reason: "Type definitions",
    },
    priority: 20,
  }),
];

// =============================================================================
// Hidden Significance Rules
// =============================================================================

/**
 * Rules for HIDDEN components - never show in diagrams
 */
export const hiddenSignificanceRules: SignificanceRule[] = [
  defineSignificanceRule({
    id: "sig-console-logging",
    name: "Console Logging",
    description: "Console.log calls add noise to diagrams",
    match: {
      domain: "Observability",
      action: "Log",
      predicate: (effect) => {
        const provider = effect.metadata?.provider;
        return provider === "console";
      },
    },
    emit: {
      level: "hidden",
      reason: "Console logging noise",
    },
    priority: 100,
  }),

  defineSignificanceRule({
    id: "sig-test-files",
    name: "Test Files",
    description: "Test files should not appear in architecture diagrams",
    match: {
      filePath: /\.(test|spec)\.(ts|js)x?$|__tests?__|__mocks?__/i,
    },
    emit: {
      level: "hidden",
      reason: "Test file",
    },
    priority: 100,
  }),

  defineSignificanceRule({
    id: "sig-debug-code",
    name: "Debug Code",
    description: "Debug utilities and code",
    match: {
      filePath: /debug[\/\-]/i,
    },
    emit: {
      level: "hidden",
      reason: "Debug code",
    },
    priority: 95,
  }),

  defineSignificanceRule({
    id: "sig-mock-files",
    name: "Mock Files",
    description: "Mock implementations for testing",
    match: {
      filePath: /mock(s)?[\/\-]|\.mock\./i,
    },
    emit: {
      level: "hidden",
      reason: "Mock implementation",
    },
    priority: 95,
  }),

  defineSignificanceRule({
    id: "sig-example-files",
    name: "Example Files",
    description: "Example and demo files",
    match: {
      filePath: /example(s)?[\/\-]|demo[\/\-]/i,
    },
    emit: {
      level: "hidden",
      reason: "Example / demo code",
    },
    priority: 90,
  }),

  defineSignificanceRule({
    id: "sig-generated-files",
    name: "Generated Files",
    description: "Auto-generated files",
    match: {
      filePath: /generated[\/\-]|\.generated\./i,
    },
    emit: {
      level: "hidden",
      reason: "Generated code",
    },
    priority: 90,
  }),
];

// =============================================================================
// Combined Significance Rules
// =============================================================================

/**
 * All builtin significance rules combined
 */
export const builtinSignificanceRules: SignificanceRule[] = [
  ...criticalSignificanceRules,
  ...importantSignificanceRules,
  ...minorSignificanceRules,
  ...hiddenSignificanceRules,
];

// =============================================================================
// Significance Engine
// =============================================================================

/**
 * Configuration for the significance engine
 */
export interface SignificanceEngineConfig {
  /** Rules to apply */
  rules: SignificanceRule[];
  /** Default significance for unmatched effects */
  defaultLevel?: SignificanceLevel;
  /** Context for significance evaluation */
  context?: Partial<SignificanceContext>;
}

/**
 * Statistics from significance engine run
 */
export interface SignificanceEngineStats {
  /** Total effects processed */
  totalEffects: number;
  /** Counts by significance level */
  levelCounts: Record<SignificanceLevel, number>;
  /** Rule match counts */
  ruleStats: Map<string, number>;
}

/**
 * Build significance context from effects
 */
export function buildSignificanceContext(
  effects: (DomainEffect | EnrichedDomainEffect)[],
  overrides?: Partial<SignificanceContext>
): SignificanceContext {
  const domainCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};

  for (const effect of effects) {
    domainCounts[effect.domain] = (domainCounts[effect.domain] ?? 0) + 1;
    actionCounts[effect.action] = (actionCounts[effect.action] ?? 0) + 1;
  }

  return {
    totalEffects: effects.length,
    domainCounts,
    actionCounts,
    dependentCounts: overrides?.dependentCounts,
    exportedEntities: overrides?.exportedEntities,
  };
}

/**
 * Engine for applying significance rules to effects
 */
export class SignificanceEngine {
  private rules: SignificanceRule[];
  private defaultLevel: SignificanceLevel;
  private baseContext: Partial<SignificanceContext>;

  constructor(config: SignificanceEngineConfig) {
    // Sort rules by priority (higher first)
    this.rules = [...config.rules]
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.defaultLevel = config.defaultLevel ?? "minor";
    this.baseContext = config.context ?? {};
  }

  /**
   * Apply significance rules to a single effect
   */
  applyToEffect(
    effect: DomainEffect | EnrichedDomainEffect,
    context: SignificanceContext
  ): SignificanceResult {
    for (const rule of this.rules) {
      if (effectMatchesSignificanceRule(effect, rule.match, context)) {
        return {
          effect,
          level: rule.emit.level,
          ruleId: rule.id,
          reason: rule.emit.reason,
        };
      }
    }

    // No rule matched, use default
    return {
      effect,
      level: this.defaultLevel,
      ruleId: null,
      reason: "No matching rule",
    };
  }

  /**
   * Apply significance rules to multiple effects
   */
  applyToEffects(effects: (DomainEffect | EnrichedDomainEffect)[]): {
    results: SignificanceResult[];
    stats: SignificanceEngineStats;
  } {
    // Build context from effects + base context
    const context = buildSignificanceContext(effects, this.baseContext);

    const results: SignificanceResult[] = [];
    const ruleStats = new Map<string, number>();
    const levelCounts: Record<SignificanceLevel, number> = {
      critical: 0,
      important: 0,
      minor: 0,
      hidden: 0,
    };

    // Initialize rule stats
    for (const rule of this.rules) {
      ruleStats.set(rule.id, 0);
    }

    for (const effect of effects) {
      const result = this.applyToEffect(effect, context);
      results.push(result);

      // Update stats
      levelCounts[result.level]++;
      if (result.ruleId) {
        ruleStats.set(result.ruleId, (ruleStats.get(result.ruleId) ?? 0) + 1);
      }
    }

    return {
      results,
      stats: {
        totalEffects: effects.length,
        levelCounts,
        ruleStats,
      },
    };
  }

  /**
   * Filter effects by minimum significance level
   */
  filterByLevel(
    effects: (DomainEffect | EnrichedDomainEffect)[],
    minLevel: SignificanceLevel
  ): (DomainEffect | EnrichedDomainEffect)[] {
    const levelOrder: Record<SignificanceLevel, number> = {
      critical: 4,
      important: 3,
      minor: 2,
      hidden: 1,
    };

    const minLevelValue = levelOrder[minLevel];
    const context = buildSignificanceContext(effects, this.baseContext);

    return effects.filter((effect) => {
      const result = this.applyToEffect(effect, context);
      return levelOrder[result.level] >= minLevelValue;
    });
  }

  /**
   * Get all registered rules
   */
  getRules(): readonly SignificanceRule[] {
    return this.rules;
  }
}

/**
 * Create a significance engine with the given configuration
 */
export function createSignificanceEngine(config: SignificanceEngineConfig): SignificanceEngine {
  return new SignificanceEngine(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get significance rules by level
 */
export function getSignificanceRulesByLevel(level: SignificanceLevel): SignificanceRule[] {
  return builtinSignificanceRules.filter((rule) => rule.emit.level === level);
}

/**
 * Get significance rules by domain
 */
export function getSignificanceRulesByDomain(domain: string): SignificanceRule[] {
  return builtinSignificanceRules.filter((rule) => {
    if (!rule.match.domain) return false;
    if (Array.isArray(rule.match.domain)) {
      return rule.match.domain.includes(domain);
    }
    return rule.match.domain === domain;
  });
}

/**
 * Numeric value for significance level (for comparisons)
 */
export function getSignificanceLevelValue(level: SignificanceLevel): number {
  const levelOrder: Record<SignificanceLevel, number> = {
    critical: 4,
    important: 3,
    minor: 2,
    hidden: 1,
  };
  return levelOrder[level];
}

/**
 * Compare two significance levels
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareSignificanceLevels(a: SignificanceLevel, b: SignificanceLevel): number {
  return getSignificanceLevelValue(a) - getSignificanceLevelValue(b);
}
