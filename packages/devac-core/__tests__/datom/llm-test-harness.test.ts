import { describe, expect, it } from "vitest";
import {
  LLM_FIXTURE,
  TEST_QUESTIONS,
  createLlmFixtureStore,
  runLlmEval,
} from "../../src/datom/llm-test-harness.js";
import type { DatomStore } from "../../src/datom/types.js";

describe("LLM Test Harness", () => {
  describe("fixture", () => {
    it("has ~20 nodes across 5 files", () => {
      expect(LLM_FIXTURE.nodes).toHaveLength(20);
      const files = new Set(LLM_FIXTURE.nodes.map((n) => n.file_path));
      expect(files.size).toBe(5);
    });

    it("has edges covering CALLS, CONTAINS, IMPORTS", () => {
      const types = new Set(LLM_FIXTURE.edges.map((e) => e.edge_type));
      expect(types).toContain("CALLS");
      expect(types).toContain("CONTAINS");
      expect(types).toContain("IMPORTS");
    });

    it("has external refs for stripe, jwt, bcrypt, react, express", () => {
      const modules = new Set(LLM_FIXTURE.externalRefs.map((r) => r.module_specifier));
      expect(modules).toContain("stripe");
      expect(modules).toContain("jsonwebtoken");
      expect(modules).toContain("bcrypt");
      expect(modules).toContain("react");
      expect(modules).toContain("express");
    });

    it("loads into a DatomStore correctly", () => {
      const store = createLlmFixtureStore();
      expect(store.entityCount()).toBe(20);
      expect(store.datomCount()).toBeGreaterThan(0);
    });
  });

  describe("questions", () => {
    it("has 10 questions", () => {
      expect(TEST_QUESTIONS).toHaveLength(10);
    });

    it("each question has id, question, and validate", () => {
      for (const q of TEST_QUESTIONS) {
        expect(q.id).toBeTypeOf("number");
        expect(q.question).toBeTypeOf("string");
        expect(q.validate).toBeTypeOf("function");
      }
    });
  });

  describe("validation functions (with hand-written correct answers)", () => {
    let store: DatomStore;

    const setup = () => createLlmFixtureStore();

    it("Q1: functions in auth.ts", () => {
      store = setup();
      // Simulate correct LLM output
      const result = ["login", "logout", "validateToken"];
      const v = TEST_QUESTIONS[0]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q2: handleClick callees with async info", () => {
      store = setup();
      const result = [
        { name: "stripeCharge", isAsync: true },
        { name: "login", isAsync: true },
      ];
      const v = TEST_QUESTIONS[1]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q3: who calls stripeCharge", () => {
      store = setup();
      const result = ["handleClick", "processRefund"];
      const v = TEST_QUESTIONS[2]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q4: external APIs for auth module", () => {
      store = setup();
      const result = [
        { module: "jsonwebtoken", symbol: "jwt" },
        { module: "bcrypt", symbol: "bcrypt" },
      ];
      const v = TEST_QUESTIONS[3]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q5: blast radius of validateToken", () => {
      store = setup();
      const result = ["login", "getUser", "handleClick", "renderDashboard"];
      const v = TEST_QUESTIONS[4]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q6: exported async functions", () => {
      store = setup();
      const result = [
        "login",
        "logout",
        "stripeCharge",
        "processRefund",
        "handleClick",
        "getUser",
        "saveUser",
        "deleteUser",
        "hashPassword",
      ];
      const v = TEST_QUESTIONS[5]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q7: most called function", () => {
      store = setup();
      const result = "validateToken";
      const v = TEST_QUESTIONS[6]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q8: dependency chain from handleClick to utils", () => {
      store = setup();
      const result = ["handleClick", "stripeCharge", "calculateTotal", "payment", "utils"];
      const v = TEST_QUESTIONS[7]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q9: files affected by renaming UserService", () => {
      store = setup();
      const result = ["service.ts", "app.tsx"];
      const v = TEST_QUESTIONS[8]!.validate(result, store);
      expect(v.pass).toBe(true);
    });

    it("Q10: payment external packages", () => {
      store = setup();
      const result = [
        { module: "stripe", symbol: "Stripe" },
        { module: "stripe", symbol: "PaymentIntent" },
      ];
      const v = TEST_QUESTIONS[9]!.validate(result, store);
      expect(v.pass).toBe(true);
    });
  });

  describe("code execution engine", () => {
    it("executes generated code that assigns to result", () => {
      const store = createLlmFixtureStore();
      // Simulate what the LLM would generate for Q1
      const code = `
const authFunctions = store.findByAttribute(":node/file_path", "src/auth.ts")
  .map(id => store.get(id))
  .filter(v => v && (v.get(":node/kind") === "function"))
  .map(v => v.get(":node/name"));
const result = authFunctions;
      `;

      const fn = new Function("store", `"use strict";\n${code}\nreturn result;`);
      const actual = fn(store);
      expect(actual).toContain("login");
      expect(actual).toContain("logout");
      expect(actual).toContain("validateToken");
    });

    it("executes code for Q3 (reverse refs)", () => {
      const store = createLlmFixtureStore();
      const code = `
const callers = store.callers("r:p:function:stripeCharge");
const result = callers.map(v => v.get(":node/name"));
      `;

      const fn = new Function("store", `"use strict";\n${code}\nreturn result;`);
      const actual = fn(store);
      expect(actual).toContain("handleClick");
      expect(actual).toContain("processRefund");
    });
  });

  // Run with: LLM_EVAL=1 pnpm --filter @pietgk/devac-core test -- --run __tests__/datom/llm-test-harness.test.ts
  describe.skipIf(!process.env.LLM_EVAL)("live LLM eval", () => {
    it("passes 8/10 questions", async () => {
      const result = await runLlmEval();

      console.log("\n=== LLM Eval Results ===");
      for (const r of result.results) {
        const status = r.validation.pass ? "PASS" : "FAIL";
        console.log(`Q${r.questionId}: ${status} (attempts: ${r.attempts})`);
        if (!r.validation.pass) {
          console.log(`  Expected: ${r.validation.expected}`);
          console.log(`  Actual: ${r.validation.actual}`);
          if (r.error) console.log(`  Error: ${r.error}`);
        }
      }
      console.log(
        `\nScore: ${result.passCount}/${result.totalCount} (${(result.passRate * 100).toFixed(0)}%)`
      );

      expect(result.passCount).toBeGreaterThanOrEqual(8);
    }, 300_000); // 5 minute timeout
  });
});
