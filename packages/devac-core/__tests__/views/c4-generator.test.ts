/**
 * C4 Generator Tests
 *
 * Tests for C4 diagram generation from domain effects.
 */

import { describe, expect, it } from "vitest";
import type { DomainEffect } from "../../src/rules/rule-engine.js";
import {
  discoverDomainBoundaries,
  exportContainersToPlantUML,
  exportContextToPlantUML,
  generateC4Containers,
  generateC4Context,
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

      const diagram = generateC4Containers(effects, { systemName: "TestSystem" });

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

      const diagram = generateC4Containers(effects, { systemName: "TestSystem" });

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
});
