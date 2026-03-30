import { describe, expect, it } from "vitest";
import {
  ROUTING_TEST_CASES,
  TEMPLATE_CATALOG,
  runRoutingEval,
} from "../../src/datom/template-test-harness.js";

describe("Template Test Harness", () => {
  describe("template catalog", () => {
    it("has 5 templates", () => {
      expect(TEMPLATE_CATALOG).toHaveLength(5);
    });

    it("templates have unique IDs", () => {
      const ids = TEMPLATE_CATALOG.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("each template has required fields", () => {
      for (const t of TEMPLATE_CATALOG) {
        expect(t.id).toBeTypeOf("string");
        expect(t.name).toBeTypeOf("string");
        expect(t.description).toBeTypeOf("string");
        expect(t.intentPatterns.length).toBeGreaterThan(0);
        expect(t.parameters.length).toBeGreaterThan(0);
        expect(t.codeTemplate).toBeTypeOf("string");
      }
    });

    it("covers the expected template categories", () => {
      const ids = TEMPLATE_CATALOG.map((t) => t.id);
      expect(ids).toContain("findEntities");
      expect(ids).toContain("traceCallees");
      expect(ids).toContain("traceCallers");
      expect(ids).toContain("blastRadius");
      expect(ids).toContain("externalDeps");
    });
  });

  describe("routing test cases", () => {
    it("has 10 test cases", () => {
      expect(ROUTING_TEST_CASES).toHaveLength(10);
    });

    it("each test case references a valid template ID", () => {
      const validIds = new Set(TEMPLATE_CATALOG.map((t) => t.id));
      for (const tc of ROUTING_TEST_CASES) {
        expect(validIds).toContain(tc.expectedTemplateId);
      }
    });

    it("covers all 5 templates", () => {
      const referencedIds = new Set(ROUTING_TEST_CASES.map((tc) => tc.expectedTemplateId));
      expect(referencedIds.size).toBe(5);
    });

    it("each template is referenced by at least 2 test cases", () => {
      const counts = new Map<string, number>();
      for (const tc of ROUTING_TEST_CASES) {
        counts.set(tc.expectedTemplateId, (counts.get(tc.expectedTemplateId) ?? 0) + 1);
      }
      for (const [id, count] of counts) {
        expect(count, `template ${id} should have >= 2 cases`).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("question coverage mapping", () => {
    it("original 10 questions map to 5 templates (4-6 range from brainstorm)", () => {
      // Q1, Q6 -> findEntities
      // Q2, Q8 -> traceCallees
      // Q3, Q7 -> traceCallers
      // Q5, Q9 -> blastRadius
      // Q4, Q10 -> externalDeps
      const templateCount = TEMPLATE_CATALOG.length;
      expect(templateCount).toBeGreaterThanOrEqual(4);
      expect(templateCount).toBeLessThanOrEqual(6);
    });
  });

  // Run with: LLM_EVAL=1 pnpm --filter @pietgk/devac-core test -- --run __tests__/datom/template-test-harness.test.ts
  describe.skipIf(!process.env.LLM_EVAL)("live routing eval", () => {
    it("Haiku correctly routes 8/10 variations", async () => {
      const result = await runRoutingEval();

      console.log("\n=== Routing Eval Results ===");
      for (const r of result.results) {
        const status = r.pass ? "PASS" : "FAIL";
        const paramsStatus = r.paramsMatch ? "params OK" : "params MISMATCH";
        console.log(
          `TC${r.testCaseId}: ${status} (${paramsStatus}) — routed to "${r.routedTemplateId}" (expected "${r.expectedTemplateId}")`
        );
        if (!r.pass) {
          console.log(`  Question: ${r.question}`);
          if (r.error) console.log(`  Error: ${r.error}`);
        }
        if (!r.paramsMatch) {
          console.log(`  Expected params: ${JSON.stringify(r.expectedParams)}`);
          console.log(`  Extracted params: ${JSON.stringify(r.extractedParams)}`);
        }
      }
      console.log(
        `\nScore: ${result.passCount}/${result.totalCount} (${(result.passRate * 100).toFixed(0)}%)`
      );

      expect(result.passCount).toBeGreaterThanOrEqual(8);
    }, 180_000); // 3 minute timeout
  });
});
