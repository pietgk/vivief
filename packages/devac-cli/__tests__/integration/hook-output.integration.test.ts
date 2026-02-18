/**
 * Hook Output Integration Tests
 *
 * Tests the hook output format for --inject (UserPromptSubmit) and --on-stop (Stop) hooks.
 * Uses real fixtures to verify output format and content.
 */

import * as path from "node:path";
import {
  type HookOutput,
  type StopHookOutput,
  ValidationTestHarness,
  extractReminderContent,
  parseDiagnosticsCounts,
  validateHookOutput,
  validateStopHookOutput,
} from "@pietgk/devac-core/test-harness";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("Hook Output Integration", () => {
  let harness: ValidationTestHarness;
  const fixturesPath = path.resolve(__dirname, "../../../fixtures-validation");

  beforeEach(() => {
    harness = new ValidationTestHarness(fixturesPath);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe("Hook Output Schema Validation", () => {
    test("valid Stop hook output passes schema validation", () => {
      const validOutput = {
        stopReason:
          "Validation found issues:\n- 2 TypeScript errors in src/error.ts\n\nConsider fixing these before continuing.",
      };

      const result = validateStopHookOutput(validOutput);
      expect(result.stopReason).toContain("Validation found issues");
    });

    test("UserPromptSubmit hook output is valid", () => {
      const validOutput = {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext:
            "<system-reminder>\nDevAC Status: 5 errors, 3 warnings\nRun get_all_diagnostics to see details.\n</system-reminder>",
        },
      };

      const result = validateHookOutput(validOutput);
      expect(result.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    });

    test("invalid hook event name throws", () => {
      const invalidOutput = {
        hookSpecificOutput: {
          hookEventName: "InvalidEvent",
          additionalContext: "<system-reminder>Test</system-reminder>",
        },
      };

      expect(() => validateHookOutput(invalidOutput)).toThrow();
    });

    test("missing system-reminder tags in UserPromptSubmit throws", () => {
      const invalidOutput = {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "Missing system-reminder tags",
        },
      };

      expect(() => validateHookOutput(invalidOutput)).toThrow();
    });

    test("missing hookSpecificOutput throws for UserPromptSubmit validation", () => {
      const invalidOutput = {
        someOtherField: "value",
      };

      expect(() => validateHookOutput(invalidOutput)).toThrow();
    });
  });

  describe("Content Extraction", () => {
    test("extracts content from system-reminder tags", () => {
      const additionalContext =
        "<system-reminder>\nValidation found issues:\n- 2 errors\n</system-reminder>";
      const content = extractReminderContent(additionalContext);

      expect(content).toContain("Validation found issues:");
      expect(content).toContain("- 2 errors");
    });

    test("handles empty content between tags", () => {
      const additionalContext = "<system-reminder></system-reminder>";
      const content = extractReminderContent(additionalContext);

      expect(content).toBe("");
    });

    test("handles multiline content", () => {
      const additionalContext = `<system-reminder>
Line 1
Line 2
Line 3
</system-reminder>`;
      const content = extractReminderContent(additionalContext);

      expect(content).toContain("Line 1");
      expect(content).toContain("Line 2");
      expect(content).toContain("Line 3");
    });
  });

  describe("Diagnostics Count Parsing", () => {
    test("parses error and warning counts", () => {
      const content = "DevAC Status: 5 errors, 3 warnings";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(5);
      expect(counts.warnings).toBe(3);
    });

    test("parses only errors", () => {
      const content = "Found 10 errors";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(10);
      expect(counts.warnings).toBe(0);
    });

    test("parses only warnings", () => {
      const content = "Found 7 warnings";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(0);
      expect(counts.warnings).toBe(7);
    });

    test("returns zeros for no matches", () => {
      const content = "No issues found";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(0);
      expect(counts.warnings).toBe(0);
    });

    test("parses singular error/warning", () => {
      const content = "1 error, 1 warning";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(1);
      expect(counts.warnings).toBe(1);
    });

    test("handles case insensitivity", () => {
      const content = "5 ERRORS and 3 WARNINGS";
      const counts = parseDiagnosticsCounts(content);

      expect(counts.errors).toBe(5);
      expect(counts.warnings).toBe(3);
    });
  });

  describe("Harness Parse Methods", () => {
    test("parseHookOutput handles valid Stop hook JSON", () => {
      const stdout = JSON.stringify({
        stopReason: "Validation found issues:\n- 5 errors, 3 warnings\n\nConsider fixing these.",
      });

      const result = harness.parseHookOutput(stdout);

      expect(result.valid).toBe(true);
      expect(result.output).not.toBeNull();
      expect(result.counts.errors).toBe(5);
      expect(result.counts.warnings).toBe(3);
    });

    test("parseHookOutput handles empty stdout", () => {
      const result = harness.parseHookOutput("");

      expect(result.valid).toBe(true);
      expect(result.output).toBeNull();
      expect(result.counts.errors).toBe(0);
      expect(result.counts.warnings).toBe(0);
    });

    test("parseHookOutput handles whitespace-only stdout", () => {
      const result = harness.parseHookOutput("   \n  \t  ");

      expect(result.valid).toBe(true);
      expect(result.output).toBeNull();
    });

    test("parseHookOutput handles invalid JSON", () => {
      const result = harness.parseHookOutput("not valid json");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Failed to parse JSON");
    });

    test("parseHookOutput handles invalid schema", () => {
      const stdout = JSON.stringify({ wrongField: "value" });
      const result = harness.parseHookOutput(stdout);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Schema validation failed");
    });
  });

  describe("Harness Assertion Methods", () => {
    test("assertHookOutputValid passes for valid UserPromptSubmit output", () => {
      const stdout = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "<system-reminder>Test</system-reminder>",
        },
      });

      expect(() => harness.assertHookOutputValid(stdout)).not.toThrow();
    });

    test("assertHookOutputValid throws for empty output", () => {
      expect(() => harness.assertHookOutputValid("")).toThrow("Hook output is empty");
    });

    test("assertHookOutputEmpty passes for empty output", () => {
      expect(() => harness.assertHookOutputEmpty("")).not.toThrow();
    });

    test("assertHookOutputEmpty throws for non-empty output", () => {
      expect(() => harness.assertHookOutputEmpty("some output")).toThrow(
        "Expected empty hook output"
      );
    });
  });

  describe("Stop Hook Output Format", () => {
    test("Stop hook output includes TypeScript errors grouped by file", () => {
      // Simulate what formatOnStopHookOutput produces
      const hookOutput: StopHookOutput = {
        stopReason: `Validation found issues:
- 3 TypeScript errors in src/type-errors.ts
- 2 TypeScript errors in src/index.ts

Consider fixing these before continuing.`,
      };

      const result = harness.parseHookOutput(JSON.stringify(hookOutput));

      expect(result.valid).toBe(true);
      expect(result.output).not.toBeNull();

      if (!result.output || !("stopReason" in result.output)) {
        throw new Error("Expected StopHookOutput");
      }
      expect(result.output.stopReason).toContain("Validation found issues:");
      expect(result.output.stopReason).toContain("TypeScript errors in src/type-errors.ts");
      expect(result.output.stopReason).toContain("Consider fixing these before continuing");
    });

    test("Stop hook output includes ESLint errors and warnings", () => {
      const hookOutput: StopHookOutput = {
        stopReason: `Validation found issues:
- 2 errors, 3 warnings (ESLint) in src/lint-errors.ts

Consider fixing these before continuing.`,
      };

      const result = harness.parseHookOutput(JSON.stringify(hookOutput));

      expect(result.valid).toBe(true);

      if (!result.output || !("stopReason" in result.output)) {
        throw new Error("Expected StopHookOutput");
      }
      expect(result.output.stopReason).toContain("errors");
      expect(result.output.stopReason).toContain("warnings");
      expect(result.output.stopReason).toContain("ESLint");
    });
  });

  describe("UserPromptSubmit Hook Output Format", () => {
    test("UserPromptSubmit hook output has correct format", () => {
      const hookOutput: HookOutput = {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `<system-reminder>
DevAC Status: 5 errors, 3 warnings
Run get_all_diagnostics to see details.
</system-reminder>`,
        },
      };

      const result = harness.parseHookOutput(JSON.stringify(hookOutput));

      expect(result.valid).toBe(true);
      expect(result.output).not.toBeNull();
      if (result.output && "hookSpecificOutput" in result.output) {
        expect(result.output.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
      }
      expect(result.counts.errors).toBe(5);
      expect(result.counts.warnings).toBe(3);
    });

    test("UserPromptSubmit hook suggests running get_all_diagnostics", () => {
      const hookOutput: HookOutput = {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `<system-reminder>
DevAC Status: 10 errors, 0 warnings
Run get_all_diagnostics to see details.
</system-reminder>`,
        },
      };

      const content = extractReminderContent(hookOutput.hookSpecificOutput.additionalContext);
      expect(content).toContain("get_all_diagnostics");
    });
  });
});
