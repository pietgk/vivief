/**
 * Effect Schema Tests
 *
 * Tests for the Effect type system based on DevAC v3.0 Foundation
 */

import { describe, expect, it } from "vitest";
import {
  CodeEffectSchema,
  FunctionCallEffectSchema,
  WorkflowEffectSchema,
  createFileChangedEffect,
  createFunctionCallEffect,
  createRetrieveEffect,
  createSeedUpdatedEffect,
  createSendEffect,
  createStoreEffect,
  createValidationResultEffect,
  // Helper functions
  generateEffectId,
  isCodeEffect,
  isWorkflowEffect,
  parseEffect,
  safeParseEffect,
} from "../src/types/effects.js";

describe("Effect Schemas", () => {
  describe("generateEffectId", () => {
    it("generates unique IDs with eff_ prefix", () => {
      const id1 = generateEffectId();
      const id2 = generateEffectId();

      expect(id1).toMatch(/^eff_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^eff_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("Code Effects", () => {
    describe("FunctionCallEffect", () => {
      it("creates a valid FunctionCall effect with required fields", () => {
        const effect = createFunctionCallEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/service.ts",
          source_line: 42,
          callee_name: "getUserById",
        });

        expect(effect.effect_type).toBe("FunctionCall");
        expect(effect.callee_name).toBe("getUserById");
        expect(effect.source_line).toBe(42);
        expect(effect.is_method_call).toBe(false);
        expect(effect.is_async).toBe(false);
        expect(effect.is_external).toBe(false);
        expect(effect.effect_id).toMatch(/^eff_/);
        expect(effect.timestamp).toBeDefined();
      });

      it("creates a FunctionCall effect with all fields", () => {
        const effect = createFunctionCallEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/service.ts",
          source_line: 42,
          source_column: 10,
          callee_name: "query",
          callee_qualified_name: "DynamoDB.DocumentClient.query",
          target_entity_id: null,
          is_method_call: true,
          is_async: true,
          is_constructor: false,
          argument_count: 2,
          is_external: true,
          external_module: "@aws-sdk/client-dynamodb",
        });

        expect(effect.callee_qualified_name).toBe("DynamoDB.DocumentClient.query");
        expect(effect.is_method_call).toBe(true);
        expect(effect.is_async).toBe(true);
        expect(effect.is_external).toBe(true);
        expect(effect.external_module).toBe("@aws-sdk/client-dynamodb");
        expect(effect.argument_count).toBe(2);
      });

      it("validates FunctionCall schema correctly", () => {
        const validEffect = {
          effect_id: "eff_test_123",
          effect_type: "FunctionCall",
          timestamp: new Date().toISOString(),
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/service.ts",
          source_line: 42,
          source_column: 0,
          branch: "base",
          properties: {},
          target_entity_id: null,
          callee_name: "doSomething",
          callee_qualified_name: null,
          is_method_call: false,
          is_async: false,
          is_constructor: false,
          argument_count: 0,
          is_external: false,
          external_module: null,
        };

        const result = FunctionCallEffectSchema.safeParse(validEffect);
        expect(result.success).toBe(true);
      });

      it("rejects invalid FunctionCall effect", () => {
        const invalidEffect = {
          effect_type: "FunctionCall",
          // missing required fields
        };

        const result = FunctionCallEffectSchema.safeParse(invalidEffect);
        expect(result.success).toBe(false);
      });
    });

    describe("StoreEffect", () => {
      it("creates a valid Store effect", () => {
        const effect = createStoreEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/repository.ts",
          source_line: 100,
          store_type: "database",
          operation: "insert",
          target_resource: "users",
          provider: "mysql",
        });

        expect(effect.effect_type).toBe("Store");
        expect(effect.store_type).toBe("database");
        expect(effect.operation).toBe("insert");
        expect(effect.target_resource).toBe("users");
        expect(effect.provider).toBe("mysql");
      });

      it("validates all store types", () => {
        const storeTypes = ["database", "cache", "file", "queue", "external"] as const;

        for (const storeType of storeTypes) {
          const effect = createStoreEffect({
            source_entity_id: "repo:pkg:function:abc",
            source_file_path: "src/repo.ts",
            source_line: 1,
            store_type: storeType,
            operation: "write",
            target_resource: "test",
          });

          expect(effect.store_type).toBe(storeType);
        }
      });
    });

    describe("RetrieveEffect", () => {
      it("creates a valid Retrieve effect", () => {
        const effect = createRetrieveEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/repository.ts",
          source_line: 50,
          retrieve_type: "database",
          operation: "select",
          target_resource: "orders",
          provider: "postgres",
        });

        expect(effect.effect_type).toBe("Retrieve");
        expect(effect.retrieve_type).toBe("database");
        expect(effect.operation).toBe("select");
        expect(effect.target_resource).toBe("orders");
      });

      it("validates all retrieve operations", () => {
        const operations = ["select", "get", "read", "fetch", "receive", "scan", "query"] as const;

        for (const operation of operations) {
          const effect = createRetrieveEffect({
            source_entity_id: "repo:pkg:function:abc",
            source_file_path: "src/repo.ts",
            source_line: 1,
            retrieve_type: "cache",
            operation,
            target_resource: "test",
          });

          expect(effect.operation).toBe(operation);
        }
      });
    });

    describe("SendEffect", () => {
      it("creates a valid Send effect for HTTP", () => {
        const effect = createSendEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/payment.ts",
          source_line: 75,
          send_type: "http",
          method: "POST",
          target: "https://api.stripe.com/v1/charges",
          is_third_party: true,
          service_name: "stripe",
        });

        expect(effect.effect_type).toBe("Send");
        expect(effect.send_type).toBe("http");
        expect(effect.method).toBe("POST");
        expect(effect.is_third_party).toBe(true);
        expect(effect.service_name).toBe("stripe");
      });

      it("creates a valid Send effect for email", () => {
        const effect = createSendEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "src/notification.ts",
          source_line: 30,
          send_type: "email",
          target: "user@example.com",
          service_name: "sendgrid",
        });

        expect(effect.send_type).toBe("email");
        expect(effect.method).toBeNull();
      });
    });

    describe("CodeEffectSchema union", () => {
      it("discriminates between code effect types", () => {
        const functionCall = createFunctionCallEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "test.ts",
          source_line: 1,
          callee_name: "test",
        });

        const store = createStoreEffect({
          source_entity_id: "repo:pkg:function:abc",
          source_file_path: "test.ts",
          source_line: 1,
          store_type: "database",
          operation: "insert",
          target_resource: "users",
        });

        expect(CodeEffectSchema.parse(functionCall).effect_type).toBe("FunctionCall");
        expect(CodeEffectSchema.parse(store).effect_type).toBe("Store");
      });
    });
  });

  describe("Workflow Effects", () => {
    describe("ValidationResultEffect", () => {
      it("creates a passing validation result", () => {
        const effect = createValidationResultEffect({
          source_entity_id: "repo:pkg:validation:typecheck",
          source_file_path: "package.json",
          source_line: 1,
          check_type: "type-check",
          passed: true,
          package_path: "packages/core",
          duration_ms: 5000,
        });

        expect(effect.effect_type).toBe("ValidationResult");
        expect(effect.check_type).toBe("type-check");
        expect(effect.passed).toBe(true);
        expect(effect.error_count).toBe(0);
        expect(effect.warning_count).toBe(0);
      });

      it("creates a failing validation result", () => {
        const effect = createValidationResultEffect({
          source_entity_id: "repo:pkg:validation:lint",
          source_file_path: "package.json",
          source_line: 1,
          check_type: "lint-check",
          passed: false,
          package_path: "packages/cli",
          error_count: 5,
          warning_count: 10,
          command: "pnpm lint",
          exit_code: 1,
          summary: "5 errors, 10 warnings",
        });

        expect(effect.passed).toBe(false);
        expect(effect.error_count).toBe(5);
        expect(effect.warning_count).toBe(10);
        expect(effect.exit_code).toBe(1);
      });

      it("validates all check types", () => {
        const checkTypes = [
          "type-check",
          "lint-check",
          "test-check",
          "build-check",
          "coverage-check",
          "security-check",
        ] as const;

        for (const checkType of checkTypes) {
          const effect = createValidationResultEffect({
            source_entity_id: "repo:pkg:validation:check",
            source_file_path: "package.json",
            source_line: 1,
            check_type: checkType,
            passed: true,
            package_path: "packages/test",
          });

          expect(effect.check_type).toBe(checkType);
        }
      });
    });

    describe("SeedUpdatedEffect", () => {
      it("creates a seed updated effect", () => {
        const effect = createSeedUpdatedEffect({
          source_entity_id: "repo:pkg:seed:update",
          source_file_path: ".devac/seed/base/nodes.parquet",
          source_line: 1,
          package_path: "packages/devac-core",
          repo_id: "github.com/org/repo",
          node_count: 500,
          edge_count: 1200,
          ref_count: 300,
          file_count: 50,
          duration_ms: 3500,
          is_incremental: true,
        });

        expect(effect.effect_type).toBe("SeedUpdated");
        expect(effect.node_count).toBe(500);
        expect(effect.edge_count).toBe(1200);
        expect(effect.is_incremental).toBe(true);
      });
    });

    describe("FileChangedEffect", () => {
      it("creates a file changed effect for modification", () => {
        const effect = createFileChangedEffect({
          source_entity_id: "repo:pkg:file:watch",
          source_file_path: "src/index.ts",
          source_line: 1,
          change_type: "modified",
          file_path: "src/index.ts",
          package_path: "packages/core",
        });

        expect(effect.effect_type).toBe("FileChanged");
        expect(effect.change_type).toBe("modified");
        expect(effect.previous_path).toBeNull();
      });

      it("creates a file changed effect for rename", () => {
        const effect = createFileChangedEffect({
          source_entity_id: "repo:pkg:file:watch",
          source_file_path: "src/newName.ts",
          source_line: 1,
          change_type: "renamed",
          file_path: "src/newName.ts",
          previous_path: "src/oldName.ts",
          package_path: "packages/core",
        });

        expect(effect.change_type).toBe("renamed");
        expect(effect.previous_path).toBe("src/oldName.ts");
      });

      it("validates all change types", () => {
        const changeTypes = ["created", "modified", "deleted", "renamed"] as const;

        for (const changeType of changeTypes) {
          const effect = createFileChangedEffect({
            source_entity_id: "repo:pkg:file:watch",
            source_file_path: "test.ts",
            source_line: 1,
            change_type: changeType,
            file_path: "test.ts",
            package_path: "packages/test",
          });

          expect(effect.change_type).toBe(changeType);
        }
      });
    });

    describe("WorkflowEffectSchema union", () => {
      it("discriminates between workflow effect types", () => {
        const validation = createValidationResultEffect({
          source_entity_id: "repo:pkg:validation:check",
          source_file_path: "package.json",
          source_line: 1,
          check_type: "test-check",
          passed: true,
          package_path: "packages/test",
        });

        const fileChanged = createFileChangedEffect({
          source_entity_id: "repo:pkg:file:watch",
          source_file_path: "test.ts",
          source_line: 1,
          change_type: "modified",
          file_path: "test.ts",
          package_path: "packages/test",
        });

        expect(WorkflowEffectSchema.parse(validation).effect_type).toBe("ValidationResult");
        expect(WorkflowEffectSchema.parse(fileChanged).effect_type).toBe("FileChanged");
      });
    });
  });

  describe("Effect Union Schema", () => {
    it("parses code effects correctly", () => {
      const functionCall = createFunctionCallEffect({
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        callee_name: "test",
      });

      const parsed = parseEffect(functionCall);
      expect(parsed.effect_type).toBe("FunctionCall");
    });

    it("parses workflow effects correctly", () => {
      const validation = createValidationResultEffect({
        source_entity_id: "repo:pkg:validation:check",
        source_file_path: "package.json",
        source_line: 1,
        check_type: "build-check",
        passed: true,
        package_path: "packages/test",
      });

      const parsed = parseEffect(validation);
      expect(parsed.effect_type).toBe("ValidationResult");
    });

    it("throws on invalid effect", () => {
      expect(() => parseEffect({ invalid: "data" })).toThrow();
    });
  });

  describe("safeParseEffect", () => {
    it("returns effect on valid data", () => {
      const functionCall = createFunctionCallEffect({
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        callee_name: "test",
      });

      const result = safeParseEffect(functionCall);
      expect(result).not.toBeNull();
      expect(result?.effect_type).toBe("FunctionCall");
    });

    it("returns null on invalid data", () => {
      const result = safeParseEffect({ invalid: "data" });
      expect(result).toBeNull();
    });
  });

  describe("Type Guards", () => {
    it("isCodeEffect identifies code effects", () => {
      const functionCall = createFunctionCallEffect({
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        callee_name: "test",
      });

      const validation = createValidationResultEffect({
        source_entity_id: "repo:pkg:validation:check",
        source_file_path: "package.json",
        source_line: 1,
        check_type: "test-check",
        passed: true,
        package_path: "packages/test",
      });

      expect(isCodeEffect(functionCall)).toBe(true);
      expect(isCodeEffect(validation)).toBe(false);
    });

    it("isWorkflowEffect identifies workflow effects", () => {
      const functionCall = createFunctionCallEffect({
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        callee_name: "test",
      });

      const validation = createValidationResultEffect({
        source_entity_id: "repo:pkg:validation:check",
        source_file_path: "package.json",
        source_line: 1,
        check_type: "test-check",
        passed: true,
        package_path: "packages/test",
      });

      expect(isWorkflowEffect(functionCall)).toBe(false);
      expect(isWorkflowEffect(validation)).toBe(true);
    });
  });

  describe("Base Effect Defaults", () => {
    it("provides sensible defaults for optional fields", () => {
      const effect = createFunctionCallEffect({
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        callee_name: "test",
      });

      expect(effect.source_column).toBe(0);
      expect(effect.branch).toBe("base");
      expect(effect.properties).toEqual({});
      expect(effect.timestamp).toBeDefined();
      expect(effect.effect_id).toBeDefined();
    });

    it("allows overriding defaults", () => {
      const customId = "eff_custom_123";
      const customTimestamp = "2025-01-01T00:00:00.000Z";

      const effect = createFunctionCallEffect({
        effect_id: customId,
        timestamp: customTimestamp,
        source_entity_id: "repo:pkg:function:abc",
        source_file_path: "test.ts",
        source_line: 1,
        source_column: 15,
        callee_name: "test",
        branch: "feature/test",
        properties: { custom: "data" },
      });

      expect(effect.effect_id).toBe(customId);
      expect(effect.timestamp).toBe(customTimestamp);
      expect(effect.source_column).toBe(15);
      expect(effect.branch).toBe("feature/test");
      expect(effect.properties).toEqual({ custom: "data" });
    });
  });
});
