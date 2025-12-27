/**
 * Rules Engine Tests
 *
 * Tests for pattern matching and domain effect generation.
 */

import { describe, expect, it } from "vitest";
import { builtinRules, databaseRules, getRulesByDomain } from "../../src/rules/builtin-rules.js";
import { createRuleEngine, defineRule } from "../../src/rules/rule-engine.js";
import type { CodeEffect } from "../../src/types/effects.js";

/**
 * Helper to create a FunctionCall effect for testing
 */
function createFunctionCallEffect(overrides: Partial<CodeEffect> = {}): CodeEffect {
  return {
    effect_type: "FunctionCall",
    effect_id: "test-effect-1",
    timestamp: new Date().toISOString(),
    source_entity_id: "test:pkg:function:testFunc",
    source_file_path: "src/test.ts",
    source_line: 10,
    source_column: 5,
    branch: "base",
    properties: {},
    target_entity_id: null,
    callee_name: "someFunction",
    callee_qualified_name: null,
    is_method_call: false,
    is_async: false,
    is_constructor: false,
    argument_count: 0,
    is_external: false,
    external_module: null,
    ...overrides,
  } as CodeEffect;
}

/**
 * Helper to create a Store effect for testing
 */
function _createStoreEffect(overrides: Partial<CodeEffect> = {}): CodeEffect {
  return {
    effect_type: "Store",
    effect_id: "test-effect-2",
    timestamp: new Date().toISOString(),
    source_entity_id: "test:pkg:function:saveData",
    source_file_path: "src/db.ts",
    source_line: 20,
    source_column: 3,
    branch: "base",
    properties: {},
    store_type: "database",
    operation: "insert",
    target_resource: "users",
    provider: "mysql",
    ...overrides,
  } as CodeEffect;
}

describe("RuleEngine", () => {
  describe("basic matching", () => {
    it("matches by effect type", () => {
      const rule = defineRule({
        id: "test-rule",
        name: "Test Rule",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Test", action: "Call" },
      });

      const engine = createRuleEngine({ rules: [rule] });
      const result = engine.process([createFunctionCallEffect()]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects).toHaveLength(1);
      expect(result.domainEffects[0]?.domain).toBe("Test");
      expect(result.domainEffects[0]?.action).toBe("Call");
    });

    it("matches by callee name pattern", () => {
      const rule = defineRule({
        id: "dynamodb-rule",
        name: "DynamoDB Rule",
        match: {
          effectType: "FunctionCall",
          callee: /dynamodb.*\.put/i,
        },
        emit: { domain: "Database", action: "Write" },
      });

      const engine = createRuleEngine({ rules: [rule] });

      const matchingEffect = createFunctionCallEffect({
        callee_name: "dynamodb.client.put",
        is_external: true,
      });
      const nonMatchingEffect = createFunctionCallEffect({
        callee_name: "someOtherFunction",
      });

      const result = engine.process([matchingEffect, nonMatchingEffect]);

      expect(result.matchedCount).toBe(1);
      expect(result.unmatchedCount).toBe(1);
      expect(result.domainEffects[0]?.action).toBe("Write");
    });

    it("matches by isExternal flag", () => {
      const rule = defineRule({
        id: "external-call-rule",
        name: "External Call Rule",
        match: {
          effectType: "FunctionCall",
          isExternal: true,
        },
        emit: { domain: "External", action: "Call" },
      });

      const engine = createRuleEngine({ rules: [rule] });

      const externalEffect = createFunctionCallEffect({ is_external: true });
      const internalEffect = createFunctionCallEffect({ is_external: false });

      const result = engine.process([externalEffect, internalEffect]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.metadata?.isExternal).toBe(true);
    });

    it("matches by isAsync flag", () => {
      const rule = defineRule({
        id: "async-rule",
        name: "Async Rule",
        match: {
          effectType: "FunctionCall",
          isAsync: true,
        },
        emit: { domain: "Async", action: "Call" },
      });

      const engine = createRuleEngine({ rules: [rule] });

      const asyncEffect = createFunctionCallEffect({ is_async: true });
      const syncEffect = createFunctionCallEffect({ is_async: false });

      const result = engine.process([asyncEffect, syncEffect]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.metadata?.isAsync).toBe(true);
    });
  });

  describe("priority handling", () => {
    it("applies higher priority rules first", () => {
      const lowPriorityRule = defineRule({
        id: "low-priority",
        name: "Low Priority",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Low", action: "Match" },
        priority: 1,
      });

      const highPriorityRule = defineRule({
        id: "high-priority",
        name: "High Priority",
        match: { effectType: "FunctionCall" },
        emit: { domain: "High", action: "Match" },
        priority: 10,
      });

      // Add in wrong order intentionally
      const engine = createRuleEngine({
        rules: [lowPriorityRule, highPriorityRule],
      });

      const result = engine.process([createFunctionCallEffect()]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.domain).toBe("High");
      expect(result.ruleStats.get("high-priority")).toBe(1);
      expect(result.ruleStats.get("low-priority")).toBe(0);
    });
  });

  describe("disabled rules", () => {
    it("skips disabled rules", () => {
      const disabledRule = defineRule({
        id: "disabled-rule",
        name: "Disabled Rule",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Disabled", action: "Match" },
        enabled: false,
      });

      const enabledRule = defineRule({
        id: "enabled-rule",
        name: "Enabled Rule",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Enabled", action: "Match" },
      });

      const engine = createRuleEngine({
        rules: [disabledRule, enabledRule],
      });

      const result = engine.process([createFunctionCallEffect()]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.domain).toBe("Enabled");
    });
  });

  describe("domain effect creation", () => {
    it("creates domain effects with correct metadata", () => {
      const rule = defineRule({
        id: "test-rule",
        name: "Test Rule",
        match: { effectType: "FunctionCall" },
        emit: {
          domain: "Test",
          action: "Call",
          metadata: { custom: "value" },
        },
      });

      const engine = createRuleEngine({ rules: [rule] });
      const effect = createFunctionCallEffect({
        effect_id: "effect-123",
        callee_name: "myFunction",
        is_external: true,
        is_async: true,
        source_file_path: "src/index.ts",
        source_line: 42,
      });

      const result = engine.process([effect]);
      const domainEffect = result.domainEffects[0];

      expect(domainEffect?.sourceEffectId).toBe("effect-123");
      expect(domainEffect?.domain).toBe("Test");
      expect(domainEffect?.action).toBe("Call");
      expect(domainEffect?.filePath).toBe("src/index.ts");
      expect(domainEffect?.startLine).toBe(42);
      expect(domainEffect?.metadata?.custom).toBe("value");
      expect(domainEffect?.metadata?.callee).toBe("myFunction");
      expect(domainEffect?.metadata?.isExternal).toBe(true);
      expect(domainEffect?.metadata?.isAsync).toBe(true);
    });
  });

  describe("rule management", () => {
    it("allows adding rules dynamically", () => {
      const engine = createRuleEngine({ rules: [] });

      expect(engine.getRules()).toHaveLength(0);

      engine.addRule(
        defineRule({
          id: "new-rule",
          name: "New Rule",
          match: { effectType: "FunctionCall" },
          emit: { domain: "New", action: "Match" },
        })
      );

      expect(engine.getRules()).toHaveLength(1);
    });

    it("allows removing rules by ID", () => {
      const rule = defineRule({
        id: "removable-rule",
        name: "Removable Rule",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Removable", action: "Match" },
      });

      const engine = createRuleEngine({ rules: [rule] });

      expect(engine.getRules()).toHaveLength(1);

      const removed = engine.removeRule("removable-rule");
      expect(removed).toBe(true);
      expect(engine.getRules()).toHaveLength(0);

      const notFound = engine.removeRule("nonexistent");
      expect(notFound).toBe(false);
    });
  });

  describe("builtin rules", () => {
    it("has database rules defined", () => {
      expect(databaseRules.length).toBeGreaterThan(0);
      expect(databaseRules.every((r) => r.emit.domain === "Database")).toBe(true);
    });

    it("can filter rules by domain", () => {
      const paymentRules = getRulesByDomain("Payment");
      expect(paymentRules.length).toBeGreaterThan(0);
      expect(paymentRules.every((r) => r.emit.domain === "Payment")).toBe(true);
    });

    it("matches DynamoDB patterns with builtin rules", () => {
      const engine = createRuleEngine({ rules: builtinRules });

      const dynamodbPut = createFunctionCallEffect({
        callee_name: "dynamodb.client.put",
        is_external: true,
      });

      const result = engine.process([dynamodbPut]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.domain).toBe("Database");
      expect(result.domainEffects[0]?.action).toBe("Write");
    });

    it("matches Stripe patterns with builtin rules", () => {
      const engine = createRuleEngine({ rules: builtinRules });

      const stripeCharge = createFunctionCallEffect({
        callee_name: "stripe.charges.create",
        is_external: true,
      });

      const result = engine.process([stripeCharge]);

      expect(result.matchedCount).toBe(1);
      expect(result.domainEffects[0]?.domain).toBe("Payment");
      expect(result.domainEffects[0]?.action).toBe("Charge");
    });
  });

  describe("performance", () => {
    it("respects maxEffects limit", () => {
      const rule = defineRule({
        id: "test-rule",
        name: "Test Rule",
        match: { effectType: "FunctionCall" },
        emit: { domain: "Test", action: "Call" },
      });

      const engine = createRuleEngine({
        rules: [rule],
        maxEffects: 5,
      });

      const effects = Array.from({ length: 10 }, () => createFunctionCallEffect());
      const result = engine.process(effects);

      expect(result.matchedCount + result.unmatchedCount).toBe(5);
    });

    it("tracks processing time", () => {
      const engine = createRuleEngine({ rules: builtinRules });
      const effects = Array.from({ length: 100 }, () => createFunctionCallEffect());

      const result = engine.process(effects);

      expect(result.processTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
