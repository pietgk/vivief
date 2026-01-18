/**
 * C4 Generator Tests
 *
 * Tests for C4 diagram generation from domain effects.
 */

import { describe, expect, it } from "vitest";
import type { GroupingRule } from "../../src/rules/grouping-rules.js";
import type { DomainEffect } from "../../src/rules/rule-engine.js";
import type { SignificanceRule } from "../../src/rules/significance-rules.js";
import type { EnrichedDomainEffect, InternalEdge } from "../../src/types/enriched-effects.js";
import {
  applyGroupingRules,
  applySignificanceFiltering,
  discoverDomainBoundaries,
  exportContainersToEnhancedLikeC4,
  exportContainersToLikeC4,
  exportContainersToPlantUML,
  exportContextToEnhancedLikeC4,
  exportContextToLikeC4,
  exportContextToPlantUML,
  generateC4Containers,
  generateC4Context,
  sanitizeLikeC4Id,
} from "../../src/views/c4-generator.js";

/**
 * Helper to create a domain effect for testing
 */
function createDomainEffect(overrides: Partial<DomainEffect> = {}): DomainEffect {
  return {
    sourceEffectId: "effect-1",
    domain: "Database",
    action: "Write",
    ruleId: "test-rule",
    ruleName: "Test Rule",
    originalEffectType: "FunctionCall",
    sourceEntityId: "test:pkg:function:testFunc",
    filePath: "src/services/db.ts",
    startLine: 10,
    metadata: {},
    ...overrides,
  };
}

/**
 * Helper to create an enriched domain effect for testing
 */
function createEnrichedEffect(overrides: Partial<EnrichedDomainEffect> = {}): EnrichedDomainEffect {
  return {
    sourceEffectId: "effect-1",
    domain: "Database",
    action: "Write",
    ruleId: "test-rule",
    ruleName: "Test Rule",
    originalEffectType: "FunctionCall",
    sourceEntityId: "test:pkg:function:testFunc",
    filePath: "/Users/test/project/src/services/db.ts",
    startLine: 10,
    metadata: {},
    // Enriched fields
    sourceName: "testFunc",
    sourceQualifiedName: "src/services/db.testFunc",
    relativeFilePath: "src/services/db.ts",
    sourceKind: "function",
    ...overrides,
  };
}

describe("C4 Generator", () => {
  describe("generateC4Context", () => {
    it("generates context with domain summaries", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Database", action: "Write" }),
        createDomainEffect({ domain: "Database", action: "Read" }),
        createDomainEffect({ domain: "Payment", action: "Charge" }),
      ];

      const context = generateC4Context(effects, {
        systemName: "TestSystem",
        systemDescription: "A test system",
      });

      expect(context.systemName).toBe("TestSystem");
      expect(context.systemDescription).toBe("A test system");
      expect(context.effectCount).toBe(3);
      expect(context.domains).toHaveLength(2);

      const dbDomain = context.domains.find((d) => d.domain === "Database");
      expect(dbDomain).toBeDefined();
      expect(dbDomain?.count).toBe(2);
      expect(dbDomain?.actions).toContain("Write");
      expect(dbDomain?.actions).toContain("Read");
    });

    it("extracts external systems from effects", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Write",
          metadata: { isExternal: true, provider: "aws-dynamodb" },
        }),
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
      ];

      const context = generateC4Context(effects, { systemName: "TestSystem" });

      expect(context.externalSystems).toHaveLength(2);

      const dynamoSystem = context.externalSystems.find((s) => s.provider === "aws-dynamodb");
      expect(dynamoSystem).toBeDefined();
      expect(dynamoSystem?.type).toBe("database");

      const stripeSystem = context.externalSystems.find((s) => s.provider === "stripe");
      expect(stripeSystem).toBeDefined();
      expect(stripeSystem?.type).toBe("payment");
    });

    it("sorts domains by count descending", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Auth", action: "Login" }),
        createDomainEffect({ domain: "Database", action: "Write" }),
        createDomainEffect({ domain: "Database", action: "Read" }),
        createDomainEffect({ domain: "Database", action: "Query" }),
      ];

      const context = generateC4Context(effects, { systemName: "TestSystem" });

      expect(context.domains[0]?.domain).toBe("Database");
      expect(context.domains[0]?.count).toBe(3);
      expect(context.domains[1]?.domain).toBe("Auth");
      expect(context.domains[1]?.count).toBe(1);
    });
  });

  describe("generateC4Containers", () => {
    it("groups effects by directory", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ filePath: "src/api/users.ts" }),
        createDomainEffect({ filePath: "src/api/orders.ts" }),
        createDomainEffect({ filePath: "src/services/payment.ts" }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        containerGrouping: "directory",
      });

      expect(diagram.containers).toHaveLength(2);

      const apiContainer = diagram.containers.find((c) => c.id === "api");
      expect(apiContainer).toBeDefined();
      expect(apiContainer?.name).toBe("Api");

      const servicesContainer = diagram.containers.find((c) => c.id === "services");
      expect(servicesContainer).toBeDefined();
      expect(servicesContainer?.name).toBe("Services");
    });

    it("creates components from source entities", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/api/users.ts",
          domain: "Database",
          action: "Write",
        }),
        createDomainEffect({
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/api/users.ts",
          domain: "Database",
          action: "Read",
        }),
        createDomainEffect({
          sourceEntityId: "test:pkg:function:getUser",
          filePath: "src/api/users.ts",
          domain: "Database",
          action: "Read",
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
      });

      const apiContainer = diagram.containers.find((c) => c.id === "api");
      expect(apiContainer?.components).toHaveLength(2);

      const saveUserComponent = apiContainer?.components.find((c) =>
        c.sourceEntityId.includes("saveUser")
      );
      expect(saveUserComponent?.effects).toHaveLength(2);
      expect(saveUserComponent?.effects).toContain("Database:Write");
      expect(saveUserComponent?.effects).toContain("Database:Read");
    });

    it("adds relationships to external systems", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          filePath: "src/api/payments.ts",
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
      });

      const apiContainer = diagram.containers.find((c) => c.id === "api");
      expect(apiContainer?.relationships).toHaveLength(1);
      expect(apiContainer?.relationships[0]?.label).toBe("Payment:Charge");
    });
  });

  describe("exportContextToPlantUML", () => {
    it("generates valid PlantUML syntax", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Write",
          metadata: { isExternal: true, provider: "mysql" },
        }),
      ];

      const context = generateC4Context(effects, { systemName: "MySystem" });
      const plantuml = exportContextToPlantUML(context);

      expect(plantuml).toContain("@startuml");
      expect(plantuml).toContain("@enduml");
      expect(plantuml).toContain("C4_Context.puml");
      expect(plantuml).toContain('System(system, "MySystem"');
      expect(plantuml).toContain("Rel(system,");
    });
  });

  describe("exportContainersToPlantUML", () => {
    it("generates valid PlantUML syntax", () => {
      const effects: DomainEffect[] = [createDomainEffect({ filePath: "src/api/users.ts" })];

      const diagram = generateC4Containers(effects, { systemName: "MySystem" });
      const plantuml = exportContainersToPlantUML(diagram);

      expect(plantuml).toContain("@startuml");
      expect(plantuml).toContain("@enduml");
      expect(plantuml).toContain("C4_Container.puml");
      expect(plantuml).toContain("System_Boundary(system");
      expect(plantuml).toContain("Container(");
    });
  });

  describe("discoverDomainBoundaries", () => {
    it("discovers domain boundaries from effects", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/db/users.ts",
        }),
        createDomainEffect({
          domain: "Database",
          sourceEntityId: "test:pkg:function:saveOrder",
          filePath: "src/db/orders.ts",
        }),
        createDomainEffect({
          domain: "Payment",
          sourceEntityId: "test:pkg:function:charge",
          filePath: "src/payment/stripe.ts",
          metadata: { isExternal: true, provider: "stripe" },
        }),
      ];

      const boundaries = discoverDomainBoundaries(effects);

      expect(boundaries).toHaveLength(2);

      const dbBoundary = boundaries.find((b) => b.name === "Database");
      expect(dbBoundary?.files).toHaveLength(2);
      expect(dbBoundary?.components).toHaveLength(2);
      expect(dbBoundary?.externalDependencies).toHaveLength(0);

      const paymentBoundary = boundaries.find((b) => b.name === "Payment");
      expect(paymentBoundary?.files).toHaveLength(1);
      expect(paymentBoundary?.externalDependencies).toContain("stripe");
    });

    it("calculates cohesion scores", () => {
      const effects: DomainEffect[] = [
        // Highly cohesive domain (many components in few files)
        createDomainEffect({
          domain: "Auth",
          sourceEntityId: "test:pkg:function:login",
          filePath: "src/auth/service.ts",
        }),
        createDomainEffect({
          domain: "Auth",
          sourceEntityId: "test:pkg:function:logout",
          filePath: "src/auth/service.ts",
        }),
        createDomainEffect({
          domain: "Auth",
          sourceEntityId: "test:pkg:function:refresh",
          filePath: "src/auth/service.ts",
        }),
        // Less cohesive domain (spread across many files)
        createDomainEffect({
          domain: "Database",
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/db/users.ts",
        }),
        createDomainEffect({
          domain: "Database",
          sourceEntityId: "test:pkg:function:saveOrder",
          filePath: "src/db/orders.ts",
        }),
        createDomainEffect({
          domain: "Database",
          sourceEntityId: "test:pkg:function:saveProduct",
          filePath: "src/db/products.ts",
        }),
      ];

      const boundaries = discoverDomainBoundaries(effects);

      // Sorted by cohesion score, so Auth should be first
      const authBoundary = boundaries.find((b) => b.name === "Auth");
      const dbBoundary = boundaries.find((b) => b.name === "Database");

      expect(authBoundary?.cohesionScore).toBeGreaterThan(dbBoundary?.cohesionScore ?? 0);
    });
  });

  describe("applySignificanceFiltering", () => {
    it("returns all effects when no threshold specified", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Database", action: "Write" }),
        createDomainEffect({ domain: "Auth", action: "Login" }),
      ];

      const filtered = applySignificanceFiltering(effects, {
        systemName: "TestSystem",
      });

      expect(filtered).toHaveLength(2);
    });

    it("filters effects below significance threshold", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Database", action: "Write" }),
        createDomainEffect({ domain: "Logging", action: "Debug" }),
      ];

      const significanceRules: SignificanceRule[] = [
        {
          id: "debug-hidden",
          name: "Hide Debug",
          match: { action: "Debug" },
          emit: { level: "hidden" },
        },
      ];

      const filtered = applySignificanceFiltering(effects, {
        systemName: "TestSystem",
        significanceRules,
        significanceThreshold: "minor",
      });

      // Debug should be filtered out (hidden < minor)
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.action).toBe("Write");
    });

    it("includes hidden effects when includeHidden is true", () => {
      const effects: DomainEffect[] = [createDomainEffect({ domain: "Logging", action: "Debug" })];

      const significanceRules: SignificanceRule[] = [
        {
          id: "debug-hidden",
          name: "Hide Debug",
          match: { action: "Debug" },
          emit: { level: "hidden" },
        },
      ];

      const filtered = applySignificanceFiltering(effects, {
        systemName: "TestSystem",
        significanceRules,
        significanceThreshold: "hidden",
        includeHidden: true,
      });

      expect(filtered).toHaveLength(1);
    });
  });

  describe("applyGroupingRules", () => {
    it("returns null when no rules match", () => {
      const effect = createDomainEffect({ domain: "Database" });
      const rules: GroupingRule[] = [
        {
          id: "payment-rule",
          name: "Payment Rule",
          match: { domain: "Payment" },
          emit: { container: "Payment Layer" },
        },
      ];

      const result = applyGroupingRules(effect, rules);

      expect(result).toBeNull();
    });

    it("returns grouping result when rule matches by domain", () => {
      const effect = createDomainEffect({ domain: "Payment" });
      const rules: GroupingRule[] = [
        {
          id: "payment-rule",
          name: "Payment Rule",
          match: { domain: "Payment" },
          emit: { container: "Payment Layer" },
        },
      ];

      const result = applyGroupingRules(effect, rules);

      expect(result).not.toBeNull();
      expect(result?.container).toBe("Payment Layer");
      expect(result?.ruleId).toBe("payment-rule");
    });

    it("returns grouping result when rule matches by file path", () => {
      const effect = createDomainEffect({ filePath: "src/api/users.ts" });
      const rules: GroupingRule[] = [
        {
          id: "api-rule",
          name: "API Rule",
          match: { filePath: /src\/api/ },
          emit: { container: "API Layer" },
        },
      ];

      const result = applyGroupingRules(effect, rules);

      expect(result).not.toBeNull();
      expect(result?.container).toBe("API Layer");
    });
  });

  describe("sanitizeLikeC4Id", () => {
    it("replaces special characters with underscores", () => {
      expect(sanitizeLikeC4Id("external:Database:mysql")).toBe("external_Database_mysql");
    });

    it("prefixes with underscore if starts with digit", () => {
      expect(sanitizeLikeC4Id("123test")).toBe("_123test");
    });

    it("preserves valid identifiers", () => {
      expect(sanitizeLikeC4Id("validIdentifier_123")).toBe("validIdentifier_123");
    });
  });

  describe("exportContextToLikeC4", () => {
    it("generates valid LikeC4 syntax", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Database",
          action: "Write",
          metadata: { isExternal: true, provider: "mysql" },
        }),
      ];

      const context = generateC4Context(effects, {
        systemName: "MySystem",
        systemDescription: "Test system",
      });
      const likec4 = exportContextToLikeC4(context);

      expect(likec4).toContain("specification {");
      expect(likec4).toContain("model {");
      expect(likec4).toContain("views {");
      expect(likec4).toContain("system = system 'MySystem'");
      expect(likec4).toContain("external_system");
    });
  });

  describe("exportContainersToLikeC4", () => {
    it("generates valid LikeC4 syntax with containers", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ filePath: "src/api/users.ts" }),
        createDomainEffect({ filePath: "src/services/payment.ts" }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "MySystem",
      });
      const likec4 = exportContainersToLikeC4(diagram);

      expect(likec4).toContain("specification {");
      expect(likec4).toContain("element container");
      expect(likec4).toContain("element component");
      expect(likec4).toContain("model {");
      expect(likec4).toContain("views {");
      expect(likec4).toContain("view containers {");
    });

    it("includes components within containers", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/api/users.ts",
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "MySystem",
      });
      const likec4 = exportContainersToLikeC4(diagram);

      expect(likec4).toContain("component");
    });
  });

  describe("exportContextToEnhancedLikeC4", () => {
    it("generates enhanced LikeC4 with custom specification", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          domain: "Payment",
          action: "Charge",
          metadata: { isExternal: true, provider: "stripe" },
        }),
      ];

      const context = generateC4Context(effects, {
        systemName: "PaymentSystem",
      });
      const likec4 = exportContextToEnhancedLikeC4(context, {
        domainEffects: effects,
      });

      expect(likec4).toContain("specification {");
      expect(likec4).toContain("model {");
      expect(likec4).toContain("PaymentSystem");
    });

    it("includes domain metadata", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ domain: "Database", action: "Write" }),
        createDomainEffect({ domain: "Payment", action: "Charge" }),
      ];

      const context = generateC4Context(effects, {
        systemName: "TestSystem",
      });
      const likec4 = exportContextToEnhancedLikeC4(context, {
        domainEffects: effects,
      });

      expect(likec4).toContain("metadata");
      expect(likec4).toContain("domains");
    });
  });

  describe("exportContainersToEnhancedLikeC4", () => {
    it("generates enhanced LikeC4 with source links", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/api/users.ts",
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "MySystem",
      });
      const likec4 = exportContainersToEnhancedLikeC4(diagram, {
        domainEffects: effects,
        includeSourceLinks: true,
        sourceBasePath: "./",
      });

      expect(likec4).toContain("link");
      expect(likec4).toContain("Source Code");
    });

    it("creates views for container drill-down", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          sourceEntityId: "test:pkg:function:saveUser",
          filePath: "src/api/users.ts",
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "MySystem",
      });
      const likec4 = exportContainersToEnhancedLikeC4(diagram, {
        domainEffects: effects,
      });

      expect(likec4).toContain("view containers");
      // Should have a drill-down view for the container
      expect(likec4).toContain("_components");
    });
  });

  describe("generateC4Containers with enriched effects", () => {
    it("uses enriched effect names and paths", () => {
      const effects: EnrichedDomainEffect[] = [
        createEnrichedEffect({
          sourceName: "UserService",
          relativeFilePath: "src/services/user.ts",
          sourceEntityId: "test:pkg:class:UserService",
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
      });

      const servicesContainer = diagram.containers.find((c) => c.id === "services");
      expect(servicesContainer).toBeDefined();

      const component = servicesContainer?.components[0];
      expect(component?.name).toBe("UserService");
      expect(component?.filePath).toBe("src/services/user.ts");
    });
  });

  describe("generateC4Containers with internal edges", () => {
    it("adds internal relationships between containers", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          sourceEntityId: "test:pkg:function:apiHandler",
          filePath: "src/api/handler.ts",
          domain: "HTTP",
          action: "Handle",
        }),
        createDomainEffect({
          sourceEntityId: "test:pkg:function:dbQuery",
          filePath: "src/db/query.ts",
          domain: "Database",
          action: "Query",
        }),
      ];

      const internalEdges: InternalEdge[] = [
        {
          sourceEntityId: "test:pkg:function:apiHandler",
          targetEntityId: "test:pkg:function:dbQuery",
        },
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        internalEdges,
      });

      const apiContainer = diagram.containers.find((c) => c.id === "api");
      const hasCallsRelationship = apiContainer?.relationships.some(
        (r) => r.to === "db" && r.label.includes("calls")
      );

      expect(hasCallsRelationship).toBe(true);
    });
  });

  describe("generateC4Containers with rule-based grouping", () => {
    it("uses grouping rules when containerGrouping is rules", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          filePath: "src/controllers/user.ts",
          domain: "HTTP",
          action: "Handle",
        }),
        createDomainEffect({
          filePath: "src/repositories/user.ts",
          domain: "Database",
          action: "Query",
        }),
      ];

      const groupingRules: GroupingRule[] = [
        {
          id: "controller-rule",
          name: "Controller Rule",
          match: { filePath: /controllers/ },
          emit: { container: "Presentation Layer" },
        },
        {
          id: "repository-rule",
          name: "Repository Rule",
          match: { filePath: /repositories/ },
          emit: { container: "Data Layer" },
        },
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        containerGrouping: "rules",
        groupingRules,
      });

      const presentationLayer = diagram.containers.find((c) => c.id === "Presentation Layer");
      const dataLayer = diagram.containers.find((c) => c.id === "Data Layer");

      expect(presentationLayer).toBeDefined();
      expect(dataLayer).toBeDefined();
    });

    it("falls back to directory grouping when no rules match", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          filePath: "src/utils/helper.ts",
          domain: "Internal",
          action: "Process",
        }),
      ];

      const groupingRules: GroupingRule[] = [
        {
          id: "api-rule",
          name: "API Rule",
          match: { filePath: /api/ },
          emit: { container: "API Layer" },
        },
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        containerGrouping: "rules",
        groupingRules,
      });

      // Should fall back to directory-based grouping
      const utilsContainer = diagram.containers.find((c) => c.id === "utils");
      expect(utilsContainer).toBeDefined();
    });
  });

  describe("generateC4Containers with package grouping", () => {
    it("groups by package name", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ filePath: "packages/core/src/service.ts" }),
        createDomainEffect({ filePath: "packages/api/src/handler.ts" }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        containerGrouping: "package",
      });

      const coreContainer = diagram.containers.find((c) => c.id === "core");
      const apiContainer = diagram.containers.find((c) => c.id === "api");

      expect(coreContainer).toBeDefined();
      expect(apiContainer).toBeDefined();
    });
  });

  describe("generateC4Containers with flat grouping", () => {
    it("groups all effects into main container", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ filePath: "src/api/users.ts" }),
        createDomainEffect({ filePath: "src/services/payment.ts" }),
        createDomainEffect({ filePath: "src/db/query.ts" }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
        containerGrouping: "flat",
      });

      expect(diagram.containers).toHaveLength(1);
      expect(diagram.containers[0]?.id).toBe("main");
    });
  });

  describe("relationship aggregation", () => {
    it("aggregates multiple relationships to same target", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({
          filePath: "src/api/handler.ts",
          domain: "Database",
          action: "Read",
          metadata: { isExternal: true, provider: "mysql" },
        }),
        createDomainEffect({
          filePath: "src/api/handler.ts",
          domain: "Database",
          action: "Write",
          metadata: { isExternal: true, provider: "mysql" },
        }),
        createDomainEffect({
          filePath: "src/api/handler.ts",
          domain: "Database",
          action: "Query",
          metadata: { isExternal: true, provider: "mysql" },
        }),
      ];

      const diagram = generateC4Containers(effects, {
        systemName: "TestSystem",
      });

      const apiContainer = diagram.containers.find((c) => c.id === "api");
      // Should have aggregated relationships
      expect(apiContainer?.relationships.length).toBeLessThan(3);
      // Label should mention call count
      const rel = apiContainer?.relationships[0];
      expect(rel?.label).toContain("calls");
    });
  });

  describe("edge cases", () => {
    it("handles empty effects array", () => {
      const context = generateC4Context([], { systemName: "EmptySystem" });

      expect(context.effectCount).toBe(0);
      expect(context.domains).toHaveLength(0);
      expect(context.externalSystems).toHaveLength(0);
    });

    it("handles effects with no external systems", () => {
      const effects: DomainEffect[] = [
        createDomainEffect({ metadata: {} }),
        createDomainEffect({ metadata: { isExternal: false } }),
      ];

      const context = generateC4Context(effects, { systemName: "TestSystem" });

      expect(context.externalSystems).toHaveLength(0);
    });

    it("handles special characters in system names", () => {
      const context = generateC4Context([], {
        systemName: 'Test\'s "System" <Special>',
        systemDescription: "Description with 'quotes'",
      });

      // Basic LikeC4 export doesn't escape - use enhanced version for escaping
      const likec4 = exportContextToEnhancedLikeC4(context);

      // Enhanced version should escape single quotes
      expect(likec4).toContain("Test\\'s");
    });

    it("handles very long effect lists", () => {
      const effects: DomainEffect[] = Array.from({ length: 100 }, (_, i) =>
        createDomainEffect({
          sourceEffectId: `effect-${i}`,
          sourceEntityId: `test:pkg:function:func${i}`,
          filePath: `src/services/service${i % 10}.ts`,
        })
      );

      const diagram = generateC4Containers(effects, {
        systemName: "LargeSystem",
      });

      // Should group into containers
      expect(diagram.containers.length).toBeGreaterThan(0);
      expect(diagram.containers.length).toBeLessThan(100);
    });
  });
});
