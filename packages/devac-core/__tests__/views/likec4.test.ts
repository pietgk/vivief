/**
 * LikeC4 Tests
 *
 * Tests for LikeC4 JSON parser, dynamic generator, and related utilities.
 */

import { describe, expect, it } from "vitest";
import type { DomainEffect } from "../../src/rules/rule-engine.js";
import {
  type EffectChain,
  chainToSteps,
  generateDynamicViews,
  generateEffectsFlowLikeC4,
  identifyEffectChains,
} from "../../src/views/likec4-dynamic-generator.js";
import {
  type LikeC4Element,
  type LikeC4Model,
  getContainerComponents,
  getContainerId,
  parseModel,
} from "../../src/views/likec4-json-parser.js";

// =============================================================================
// LikeC4 JSON Parser Tests
// =============================================================================

describe("likec4-json-parser", () => {
  describe("parseModel", () => {
    it("classifies container elements correctly", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "system.core", kind: "container", title: "Core System" },
          { id: "system.api", kind: "system", title: "API System" },
          { id: "layer.infra", kind: "layer", title: "Infrastructure" },
        ],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.containers.size).toBe(3);
      expect(parsed.containers.has("system.core")).toBe(true);
      expect(parsed.containers.has("system.api")).toBe(true);
      expect(parsed.containers.has("layer.infra")).toBe(true);
      expect(parsed.components.size).toBe(0);
      expect(parsed.externals.size).toBe(0);
    });

    it("classifies component elements correctly", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "system.core", kind: "container", title: "Core System" },
          {
            id: "system.core.parser",
            kind: "component",
            title: "Parser",
            parent: "system.core",
          },
          {
            id: "system.core.analyzer",
            kind: "service",
            title: "Analyzer",
            parent: "system.core",
          },
        ],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.containers.size).toBe(1);
      expect(parsed.components.size).toBe(2);
      expect(parsed.components.has("system.core.parser")).toBe(true);
      expect(parsed.components.has("system.core.analyzer")).toBe(true);
    });

    it("classifies external elements correctly", () => {
      // EXTERNAL_KINDS = ["external", "externalSystem", "database", "queue", "storage"]
      const model: LikeC4Model = {
        elements: [
          { id: "ext.db", kind: "database", title: "PostgreSQL" },
          { id: "ext.storage", kind: "storage", title: "S3 Bucket" },
          { id: "ext.ext", kind: "external", title: "External System" },
        ],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.externals.size).toBe(3);
      expect(parsed.externals.has("ext.db")).toBe(true);
      expect(parsed.externals.has("ext.storage")).toBe(true);
      expect(parsed.externals.has("ext.ext")).toBe(true);
    });

    it("classifies elements with external tag as external", () => {
      const model: LikeC4Model = {
        elements: [
          {
            id: "ext.service",
            kind: "service",
            title: "External API",
            tags: ["external"],
          },
        ],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.externals.size).toBe(1);
      expect(parsed.externals.has("ext.service")).toBe(true);
    });

    it("indexes relationships by source", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "a", kind: "component", title: "A" },
          { id: "b", kind: "component", title: "B" },
          { id: "c", kind: "component", title: "C" },
        ],
        relationships: [
          { id: "r1", source: "a", target: "b", title: "calls" },
          { id: "r2", source: "a", target: "c", title: "uses" },
          { id: "r3", source: "b", target: "c", title: "depends on" },
        ],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.relationshipsBySource.get("a")).toHaveLength(2);
      expect(parsed.relationshipsBySource.get("b")).toHaveLength(1);
      expect(parsed.relationshipsBySource.has("c")).toBe(false);
    });

    it("indexes relationships by target", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "a", kind: "component", title: "A" },
          { id: "b", kind: "component", title: "B" },
          { id: "c", kind: "component", title: "C" },
        ],
        relationships: [
          { id: "r1", source: "a", target: "b", title: "calls" },
          { id: "r2", source: "a", target: "c", title: "uses" },
          { id: "r3", source: "b", target: "c", title: "depends on" },
        ],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.relationshipsByTarget.get("b")).toHaveLength(1);
      expect(parsed.relationshipsByTarget.get("c")).toHaveLength(2);
      expect(parsed.relationshipsByTarget.has("a")).toBe(false);
    });

    it("preserves raw model", () => {
      const model: LikeC4Model = {
        elements: [{ id: "test", kind: "component", title: "Test" }],
        relationships: [],
        views: [{ id: "view1", title: "Main View" }],
      };

      const parsed = parseModel(model);

      expect(parsed.raw).toBe(model);
      expect(parsed.raw.views).toHaveLength(1);
    });

    it("handles empty model", () => {
      const model: LikeC4Model = {
        elements: [],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      expect(parsed.containers.size).toBe(0);
      expect(parsed.components.size).toBe(0);
      expect(parsed.externals.size).toBe(0);
      expect(parsed.relationshipsBySource.size).toBe(0);
      expect(parsed.relationshipsByTarget.size).toBe(0);
    });

    it("treats top-level elements without parent as containers", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "toplevel1", kind: "component", title: "Top Level 1" }, // No parent
          { id: "toplevel2", kind: "service", title: "Top Level 2" }, // No parent
        ],
        relationships: [],
        views: [],
      };

      const parsed = parseModel(model);

      // Elements without parent are treated as containers
      expect(parsed.containers.size).toBe(2);
      expect(parsed.components.size).toBe(0);
    });
  });

  describe("getContainerId", () => {
    it("returns element id for container elements", () => {
      const model: LikeC4Model = {
        elements: [{ id: "system.core", kind: "container", title: "Core" }],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const element: LikeC4Element = {
        id: "system.core",
        kind: "container",
        title: "Core",
      };

      const containerId = getContainerId(element, parsed);

      expect(containerId).toBe("system.core");
    });

    it("finds parent container for nested elements", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "system.core", kind: "container", title: "Core" },
          {
            id: "system.core.parser",
            kind: "component",
            title: "Parser",
            parent: "system.core",
          },
        ],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const element = parsed.components.get("system.core.parser")!;
      const containerId = getContainerId(element, parsed);

      expect(containerId).toBe("system.core");
    });

    it("traverses multiple levels to find container", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "root", kind: "container", title: "Root" },
          {
            id: "root.module",
            kind: "module",
            title: "Module",
            parent: "root",
          },
          {
            id: "root.module.service",
            kind: "service",
            title: "Service",
            parent: "root.module",
          },
        ],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      // root.module is a component (has parent, not container kind)
      // root.module.service should trace back to root
      const element = parsed.components.get("root.module.service")!;
      const containerId = getContainerId(element, parsed);

      expect(containerId).toBe("root");
    });

    it("returns null when no container found", () => {
      const model: LikeC4Model = {
        elements: [
          {
            id: "orphan",
            kind: "component",
            title: "Orphan",
            parent: "nonexistent",
          },
        ],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const element: LikeC4Element = {
        id: "orphan",
        kind: "component",
        title: "Orphan",
        parent: "nonexistent",
      };

      const containerId = getContainerId(element, parsed);

      expect(containerId).toBeNull();
    });
  });

  describe("getContainerComponents", () => {
    it("returns all components within a container", () => {
      const model: LikeC4Model = {
        elements: [
          { id: "container1", kind: "container", title: "Container 1" },
          {
            id: "container1.comp1",
            kind: "component",
            title: "Comp 1",
            parent: "container1",
          },
          {
            id: "container1.comp2",
            kind: "component",
            title: "Comp 2",
            parent: "container1",
          },
          { id: "container2", kind: "container", title: "Container 2" },
          {
            id: "container2.comp3",
            kind: "component",
            title: "Comp 3",
            parent: "container2",
          },
        ],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const components = getContainerComponents("container1", parsed);

      expect(components).toHaveLength(2);
      expect(components.map((c) => c.id)).toContain("container1.comp1");
      expect(components.map((c) => c.id)).toContain("container1.comp2");
    });

    it("returns empty array for container with no components", () => {
      const model: LikeC4Model = {
        elements: [{ id: "empty", kind: "container", title: "Empty Container" }],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const components = getContainerComponents("empty", parsed);

      expect(components).toHaveLength(0);
    });

    it("returns empty array for non-existent container", () => {
      const model: LikeC4Model = {
        elements: [],
        relationships: [],
        views: [],
      };
      const parsed = parseModel(model);

      const components = getContainerComponents("nonexistent", parsed);

      expect(components).toHaveLength(0);
    });
  });
});

// =============================================================================
// LikeC4 Dynamic Generator Tests
// =============================================================================

describe("likec4-dynamic-generator", () => {
  /**
   * Create a test domain effect
   */
  function createDomainEffect(partial: Partial<DomainEffect>): DomainEffect {
    return {
      sourceEffectId: partial.sourceEffectId ?? "effect-1",
      domain: partial.domain ?? "Database",
      action: partial.action ?? "Query",
      ruleId: partial.ruleId ?? "rule-1",
      ruleName: partial.ruleName ?? "test-rule",
      originalEffectType: partial.originalEffectType ?? "FunctionCall",
      sourceEntityId: partial.sourceEntityId ?? "test:pkg:function:abc123",
      filePath: partial.filePath ?? "src/service.ts",
      startLine: partial.startLine ?? 10,
      metadata: partial.metadata ?? {},
    };
  }

  describe("identifyEffectChains", () => {
    it("groups effects by domain", () => {
      // Need at least 3 effects per domain to create a chain
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Query",
          sourceEntityId: "entity1",
        }),
        createDomainEffect({
          domain: "Database",
          action: "Insert",
          sourceEntityId: "entity2",
        }),
        createDomainEffect({
          domain: "Database",
          action: "Update",
          sourceEntityId: "entity3",
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          sourceEntityId: "entity4",
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Refund",
          sourceEntityId: "entity5",
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Verify",
          sourceEntityId: "entity6",
        }),
      ];

      const chains = identifyEffectChains(effects, { maxChains: 10 });

      // Should create chains for domains with 3+ effects
      const domainNames = chains.map((c) => c.primaryDomain);
      expect(domainNames.length).toBeGreaterThan(0);
    });

    it("creates chains for external effects by provider", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Refund",
          metadata: { isExternal: true, provider: "stripe" },
        }),
        createDomainEffect({
          domain: "Database",
          action: "Query",
          metadata: { isExternal: true, provider: "aws-dynamodb" },
        }),
      ];

      const chains = identifyEffectChains(effects, { maxChains: 10 });

      const chainNames = chains.map((c) => c.name);
      expect(chainNames.some((n) => n.includes("Stripe"))).toBe(true);
    });

    it("respects maxChains option", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
        createDomainEffect({
          domain: "Database",
          action: "Query",
          metadata: { isExternal: true, provider: "postgres" },
        }),
        createDomainEffect({
          domain: "Auth",
          action: "Verify",
          metadata: { isExternal: true, provider: "auth0" },
        }),
        createDomainEffect({
          domain: "Messaging",
          action: "Publish",
          metadata: { isExternal: true, provider: "sqs" },
        }),
        createDomainEffect({
          domain: "HTTP",
          action: "Request",
          metadata: { isExternal: true, provider: "external-api" },
        }),
      ];

      const chains = identifyEffectChains(effects, { maxChains: 2 });

      expect(chains.length).toBeLessThanOrEqual(2);
    });

    it("sorts chains by score (importance)", () => {
      const effects: DomainEffect[] = [
        // Payment with external (high score)
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Refund",
          metadata: { isExternal: true, provider: "stripe" },
        }),
        // Database internal (lower score)
        createDomainEffect({ domain: "Database", action: "Query" }),
        createDomainEffect({ domain: "Database", action: "Insert" }),
        createDomainEffect({ domain: "Database", action: "Update" }),
      ];

      const chains = identifyEffectChains(effects, { maxChains: 10 });

      // Payment chains should score higher due to external + payment domain
      if (chains.length >= 2) {
        expect(chains[0]?.score).toBeGreaterThanOrEqual(chains[1]?.score);
      }
    });

    it("handles empty effects array", () => {
      const chains = identifyEffectChains([], { maxChains: 5 });

      expect(chains).toHaveLength(0);
    });

    it("creates general domain chain for domains with 3+ effects", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Query",
          sourceEntityId: "entity1",
        }),
        createDomainEffect({
          domain: "Database",
          action: "Insert",
          sourceEntityId: "entity2",
        }),
        createDomainEffect({
          domain: "Database",
          action: "Update",
          sourceEntityId: "entity3",
        }),
      ];

      const chains = identifyEffectChains(effects, { maxChains: 10 });

      expect(chains.some((c) => c.primaryDomain === "Database")).toBe(true);
    });
  });

  describe("chainToSteps", () => {
    it("converts effect chain to dynamic view steps", () => {
      const chain: EffectChain = {
        id: "payment_stripe_flow",
        name: "Payment Stripe Flow",
        primaryDomain: "Payment",
        effects: [
          createDomainEffect({
            domain: "Payment",
            action: "Charge",
            sourceEntityId: "test:pkg:function:processPayment",
            metadata: { isExternal: true, provider: "stripe" },
          }),
        ],
        score: 15,
      };

      const steps = chainToSteps(chain);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]?.from).toBeDefined();
      expect(steps[0]?.to).toBeDefined();
      expect(steps[0]?.label).toBeDefined();
    });

    it("respects maxStepsPerChain option", () => {
      const chain: EffectChain = {
        id: "long_chain",
        name: "Long Chain",
        primaryDomain: "Database",
        effects: Array.from({ length: 20 }, (_, i) =>
          createDomainEffect({
            domain: "Database",
            action: `Action${i}`,
            sourceEntityId: `entity${i}`,
          })
        ),
        score: 20,
      };

      const steps = chainToSteps(chain, { maxStepsPerChain: 5 });

      expect(steps.length).toBeLessThanOrEqual(5);
    });

    it("sets external target for external effects", () => {
      const chain: EffectChain = {
        id: "external_flow",
        name: "External Flow",
        primaryDomain: "Payment",
        effects: [
          createDomainEffect({
            domain: "Payment",
            action: "Charge",
            metadata: { isExternal: true, provider: "stripe" },
          }),
        ],
        score: 10,
      };

      const steps = chainToSteps(chain);

      expect(steps[0]?.to).toContain("external");
      expect(steps[0]?.toName).toBe("Stripe");
    });

    it("handles chain with no effects", () => {
      const chain: EffectChain = {
        id: "empty_chain",
        name: "Empty Chain",
        primaryDomain: "Database",
        effects: [],
        score: 0,
      };

      const steps = chainToSteps(chain);

      expect(steps).toHaveLength(0);
    });

    it("includes domain tag in steps", () => {
      const chain: EffectChain = {
        id: "tagged_chain",
        name: "Tagged Chain",
        primaryDomain: "Auth",
        effects: [
          createDomainEffect({
            domain: "Auth",
            action: "Verify",
          }),
        ],
        score: 5,
      };

      const steps = chainToSteps(chain);

      expect(steps[0]?.tag).toBe("Auth");
    });
  });

  describe("generateDynamicViews", () => {
    it("generates LikeC4 dynamic view DSL", () => {
      const chains: EffectChain[] = [
        {
          id: "payment_flow",
          name: "Payment Flow",
          primaryDomain: "Payment",
          effects: [
            createDomainEffect({
              domain: "Payment",
              action: "Charge",
              metadata: { isExternal: true, provider: "stripe" },
            }),
          ],
          score: 10,
        },
      ];

      const dsl = generateDynamicViews(chains);

      expect(dsl).toContain("dynamic view payment_flow");
      expect(dsl).toContain("title");
      expect(dsl).toContain("->");
    });

    it("uses titlePrefix when provided", () => {
      const chains: EffectChain[] = [
        {
          id: "test_flow",
          name: "Test Flow",
          primaryDomain: "Database",
          effects: [createDomainEffect({ domain: "Database", action: "Query" })],
          score: 5,
        },
      ];

      const dsl = generateDynamicViews(chains, { titlePrefix: "MySystem" });

      expect(dsl).toContain("MySystem");
    });

    it("generates empty view placeholder when no chains", () => {
      const dsl = generateDynamicViews([]);

      expect(dsl).toContain("dynamic view effects_flow");
      expect(dsl).toContain("No effect chains detected");
    });

    it("generates multiple views for multiple chains", () => {
      const chains: EffectChain[] = [
        {
          id: "chain1",
          name: "Chain 1",
          primaryDomain: "Payment",
          effects: [createDomainEffect({ domain: "Payment", action: "Charge" })],
          score: 10,
        },
        {
          id: "chain2",
          name: "Chain 2",
          primaryDomain: "Database",
          effects: [createDomainEffect({ domain: "Database", action: "Query" })],
          score: 5,
        },
      ];

      const dsl = generateDynamicViews(chains);

      expect(dsl).toContain("dynamic view chain1");
      expect(dsl).toContain("dynamic view chain2");
    });
  });

  describe("generateEffectsFlowLikeC4", () => {
    it("generates complete LikeC4 file with specification", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
      ];

      const c4 = generateEffectsFlowLikeC4(effects, "TestSystem");

      expect(c4).toContain("specification {");
      expect(c4).toContain("element system");
      expect(c4).toContain("element component");
      expect(c4).toContain("element external_system");
      expect(c4).toContain("element database");
      expect(c4).toContain("element queue");
    });

    it("includes model block with elements", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Query",
          sourceEntityId: "test:pkg:function:queryData",
        }),
      ];

      const c4 = generateEffectsFlowLikeC4(effects, "DataSystem");

      expect(c4).toContain("model {");
      expect(c4).toContain("system = system 'DataSystem'");
    });

    it("includes views block", () => {
      const effects: DomainEffect[] = [createDomainEffect({ domain: "Auth", action: "Login" })];

      const c4 = generateEffectsFlowLikeC4(effects, "AuthSystem");

      expect(c4).toContain("views {");
    });

    it("includes domain tags", () => {
      const effects: DomainEffect[] = [createDomainEffect({ domain: "Payment", action: "Charge" })];

      const c4 = generateEffectsFlowLikeC4(effects, "System");

      expect(c4).toContain("tag Payment");
      expect(c4).toContain("tag Database");
      expect(c4).toContain("tag Auth");
      expect(c4).toContain("tag Messaging");
    });

    it("includes relationship types", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Database", action: "Insert" }),
      ];

      const c4 = generateEffectsFlowLikeC4(effects, "System");

      expect(c4).toContain("relationship calls");
      expect(c4).toContain("relationship stores");
      expect(c4).toContain("relationship retrieves");
      expect(c4).toContain("relationship sends");
    });

    it("escapes single quotes in system name", () => {
      const effects: DomainEffect[] = [createDomainEffect({ domain: "API", action: "Request" })];

      const c4 = generateEffectsFlowLikeC4(effects, "John's System");

      expect(c4).toContain("John\\'s System");
    });

    it("handles empty effects array", () => {
      const c4 = generateEffectsFlowLikeC4([], "EmptySystem");

      expect(c4).toContain("specification {");
      expect(c4).toContain("model {");
      expect(c4).toContain("views {");
      expect(c4).toContain("No effect chains detected");
    });

    it("adds external systems for external effects", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Query",
          metadata: { isExternal: true, provider: "postgres" },
        }),
        createDomainEffect({
          domain: "Messaging",
          action: "Publish",
          metadata: { isExternal: true, provider: "rabbitmq" },
        }),
      ];

      const c4 = generateEffectsFlowLikeC4(effects, "System");

      // Should include external system elements
      expect(c4).toContain("external_system");
    });
  });
});
