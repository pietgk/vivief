/**
 * Rules Engine - Pattern Matching for Effects
 *
 * Transforms low-level effects (FunctionCall, Store, etc.) into
 * high-level domain effects (ChargePayment, AuthenticateUser, etc.).
 *
 * Part of DevAC v3.0 Foundation.
 */

import type { CodeEffect, EffectType } from "../types/effects.js";

/**
 * Match criteria for a rule
 */
export interface RuleMatch {
  /** Effect type to match */
  effectType?: EffectType | EffectType[];
  /** Callee name pattern (string for exact, RegExp for pattern) */
  callee?: string | RegExp;
  /** Target name pattern */
  target?: string | RegExp;
  /** Source name pattern */
  source?: string | RegExp;
  /** Match external calls only */
  isExternal?: boolean;
  /** Match async calls only */
  isAsync?: boolean;
  /** Custom predicate for complex matching */
  predicate?: (effect: CodeEffect) => boolean;
}

/**
 * What the rule emits when matched
 */
export interface RuleEmit {
  /** Domain category (e.g., "Payment", "Auth", "Database") */
  domain: string;
  /** Action name (e.g., "ChargePayment", "ValidateToken") */
  action: string;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * A rule that transforms effects
 */
export interface Rule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this rule detects */
  description?: string;
  /** Match criteria */
  match: RuleMatch;
  /** What to emit when matched */
  emit: RuleEmit;
  /** Priority (higher = evaluated first) */
  priority?: number;
  /** Whether this rule is enabled */
  enabled?: boolean;
}

/**
 * A domain effect produced by the rules engine
 */
export interface DomainEffect {
  /** Original effect ID */
  sourceEffectId: string;
  /** Domain category */
  domain: string;
  /** Action name */
  action: string;
  /** Rule that produced this */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Original effect type */
  originalEffectType: EffectType;
  /** Source entity ID */
  sourceEntityId: string;
  /** File path */
  filePath: string;
  /** Line number */
  startLine: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of running the rules engine
 */
export interface RuleEngineResult {
  /** Domain effects produced */
  domainEffects: DomainEffect[];
  /** Effects that matched rules */
  matchedCount: number;
  /** Effects that didn't match any rule */
  unmatchedCount: number;
  /** Processing time in ms */
  processTimeMs: number;
  /** Rule match statistics */
  ruleStats: Map<string, number>;
}

/**
 * Rules engine configuration
 */
export interface RuleEngineConfig {
  /** Rules to apply */
  rules: Rule[];
  /** Whether to include unmatched effects in output */
  includeUnmatched?: boolean;
  /** Maximum effects to process (for performance) */
  maxEffects?: number;
}

/**
 * Check if a string matches a pattern (string or RegExp)
 */
function matchesPattern(value: string | null | undefined, pattern: string | RegExp): boolean {
  if (value == null) return false;
  if (typeof pattern === "string") {
    return value === pattern || value.includes(pattern);
  }
  return pattern.test(value);
}

/**
 * Get target value from effect based on its type
 */
function getEffectTarget(effect: CodeEffect): string | null {
  switch (effect.effect_type) {
    case "Store":
    case "Retrieve":
      return effect.target_resource;
    case "Send":
      return effect.target;
    case "FunctionCall":
      return effect.target_entity_id;
    default:
      return null;
  }
}

/**
 * Check if effect has external flag and what its value is
 */
function isEffectExternal(effect: CodeEffect): boolean | undefined {
  switch (effect.effect_type) {
    case "FunctionCall":
      return effect.is_external;
    case "Send":
      return effect.is_third_party;
    default:
      return undefined;
  }
}

/**
 * Check if effect has async flag and what its value is
 */
function isEffectAsync(effect: CodeEffect): boolean | undefined {
  if (effect.effect_type === "FunctionCall") {
    return effect.is_async;
  }
  return undefined;
}

/**
 * Check if an effect matches a rule's criteria
 */
function effectMatchesRule(effect: CodeEffect, match: RuleMatch): boolean {
  // Check effect type
  if (match.effectType) {
    const types = Array.isArray(match.effectType) ? match.effectType : [match.effectType];
    if (!types.includes(effect.effect_type)) {
      return false;
    }
  }

  // Check callee name (for FunctionCall effects)
  if (match.callee && effect.effect_type === "FunctionCall") {
    if (!matchesPattern(effect.callee_name, match.callee)) {
      return false;
    }
  }

  // Check target (varies by effect type)
  if (match.target) {
    const target = getEffectTarget(effect);
    if (!matchesPattern(target, match.target)) {
      return false;
    }
  }

  // Check source (for Retrieve effects, use target_resource as that's what it queries)
  if (match.source) {
    if (effect.effect_type === "Retrieve") {
      if (!matchesPattern(effect.target_resource, match.source)) {
        return false;
      }
    } else {
      return false; // source only applies to Retrieve
    }
  }

  // Check external flag
  if (match.isExternal !== undefined) {
    const isExternal = isEffectExternal(effect);
    if (isExternal === undefined || isExternal !== match.isExternal) {
      return false;
    }
  }

  // Check async flag
  if (match.isAsync !== undefined) {
    const isAsync = isEffectAsync(effect);
    if (isAsync === undefined || isAsync !== match.isAsync) {
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
 * Extract callee name if effect is FunctionCall
 */
function getCalleeName(effect: CodeEffect): string | null {
  if (effect.effect_type === "FunctionCall") {
    return effect.callee_name;
  }
  return null;
}

/**
 * Create a domain effect from a matched effect and rule
 */
function createDomainEffect(effect: CodeEffect, rule: Rule): DomainEffect {
  return {
    sourceEffectId: effect.effect_id,
    domain: rule.emit.domain,
    action: rule.emit.action,
    ruleId: rule.id,
    ruleName: rule.name,
    originalEffectType: effect.effect_type,
    sourceEntityId: effect.source_entity_id,
    filePath: effect.source_file_path,
    startLine: effect.source_line,
    metadata: {
      ...rule.emit.metadata,
      callee: getCalleeName(effect),
      target: getEffectTarget(effect),
      isExternal: isEffectExternal(effect),
      isAsync: isEffectAsync(effect),
    },
  };
}

/**
 * Rules Engine class
 *
 * Processes effects through a set of rules to produce domain effects.
 */
export class RuleEngine {
  private rules: Rule[];
  private includeUnmatched: boolean;
  private maxEffects: number;

  constructor(config: RuleEngineConfig) {
    // Sort rules by priority (higher first)
    this.rules = [...config.rules]
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.includeUnmatched = config.includeUnmatched ?? false;
    this.maxEffects = config.maxEffects ?? Number.POSITIVE_INFINITY;
  }

  /**
   * Process a set of effects through the rules
   */
  process(effects: CodeEffect[]): RuleEngineResult {
    const startTime = Date.now();
    const domainEffects: DomainEffect[] = [];
    const ruleStats = new Map<string, number>();
    let matchedCount = 0;
    let unmatchedCount = 0;

    // Initialize rule stats
    for (const rule of this.rules) {
      ruleStats.set(rule.id, 0);
    }

    // Process each effect (up to max)
    const effectsToProcess = effects.slice(0, this.maxEffects);

    for (const effect of effectsToProcess) {
      let matched = false;

      // Try each rule in priority order
      for (const rule of this.rules) {
        if (effectMatchesRule(effect, rule.match)) {
          const domainEffect = createDomainEffect(effect, rule);
          domainEffects.push(domainEffect);
          ruleStats.set(rule.id, (ruleStats.get(rule.id) ?? 0) + 1);
          matched = true;
          break; // First matching rule wins
        }
      }

      if (matched) {
        matchedCount++;
      } else {
        unmatchedCount++;
      }
    }

    return {
      domainEffects,
      matchedCount,
      unmatchedCount,
      processTimeMs: Date.now() - startTime,
      ruleStats,
    };
  }

  /**
   * Get all registered rules
   */
  getRules(): readonly Rule[] {
    return this.rules;
  }

  /**
   * Add a rule dynamically
   */
  addRule(rule: Rule): void {
    this.rules.push(rule);
    // Re-sort by priority
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }
}

/**
 * Create a rules engine with the given configuration
 */
export function createRuleEngine(config: RuleEngineConfig): RuleEngine {
  return new RuleEngine(config);
}

/**
 * Utility to create a rule with defaults
 */
export function defineRule(rule: Omit<Rule, "enabled"> & { enabled?: boolean }): Rule {
  return {
    ...rule,
    enabled: rule.enabled ?? true,
    priority: rule.priority ?? 0,
  };
}
