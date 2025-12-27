/**
 * Rules Engine Module
 *
 * Pattern matching for transforming low-level effects into domain effects.
 *
 * Part of DevAC v3.0 Foundation.
 */

// Core engine
export {
  RuleEngine,
  createRuleEngine,
  defineRule,
  type Rule,
  type RuleMatch,
  type RuleEmit,
  type DomainEffect,
  type RuleEngineResult,
  type RuleEngineConfig,
} from "./rule-engine.js";

// Builtin rules
export {
  builtinRules,
  databaseRules,
  paymentRules,
  authRules,
  httpRules,
  messagingRules,
  storageRules,
  observabilityRules,
  getRulesByDomain,
  getRulesByProvider,
} from "./builtin-rules.js";
