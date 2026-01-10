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

// Grouping rules
export {
  GroupingEngine,
  createGroupingEngine,
  defineGroupingRule,
  builtinGroupingRules,
  analysisLayerRules,
  storageLayerRules,
  federationLayerRules,
  apiLayerRules,
  rulesLayerRules,
  viewsLayerRules,
  getGroupingRulesByContainer,
  getGroupingRulesByLayer,
  getAvailableContainers,
  getAvailableTags,
  type GroupingRule,
  type GroupingMatch,
  type GroupingEmit,
  type GroupingResult,
  type GroupingEngineConfig,
  type GroupingEngineStats,
} from "./grouping-rules.js";

// Significance rules
export {
  SignificanceEngine,
  createSignificanceEngine,
  defineSignificanceRule,
  buildSignificanceContext,
  builtinSignificanceRules,
  criticalSignificanceRules,
  importantSignificanceRules,
  minorSignificanceRules,
  hiddenSignificanceRules,
  getSignificanceRulesByLevel,
  getSignificanceRulesByDomain,
  getSignificanceLevelValue,
  compareSignificanceLevels,
  type SignificanceRule,
  type SignificanceMatch,
  type SignificanceEmit,
  type SignificanceResult,
  type SignificanceLevel,
  type SignificanceContext,
  type SignificanceEngineConfig,
  type SignificanceEngineStats,
} from "./significance-rules.js";
