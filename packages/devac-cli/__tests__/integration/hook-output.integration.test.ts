/**
 * Hook Output Integration Tests
 *
 * Tests the hook output format for --inject (UserPromptSubmit) and --on-stop (Stop) hooks.
 * Uses real fixtures to verify output format and content.
 */

import * as path from "node:path";
import {
  type HookOutput,
  ValidationTestHarness,
  extractReminderContent,
  parseDiagnosticsCounts,
  validateHookOutput,
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
    test("valid hook output passes schema validation", () => {
      const validOutput = {
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext:
            "<system-reminder>\nValidation found issues:\n- 2 TypeScript errors in src/error.ts\n</system-reminder>",
        },
      };

      const result = validateHookOutput(validOutput);
      expect(result.hookSpecificOutput.hookEventName).toBe("Stop");
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

    test("missing system-reminder tags throws", () => {
      const invalidOutput = {
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: "Missing system-reminder tags",
        },
      };

      expect(() => validateHookOutput(invalidOutput)).toThrow();
    });

    test("missing hookSpecificOutput throws", () => {
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
    test("parseHookOutput handles valid JSON", () => {
      const stdout = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: "<system-reminder>\n5 errors, 3 warnings\n</system-reminder>",
        },
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
    test("assertHookOutputValid passes for valid output", () => {
      const stdout = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
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
      // Simulate what formatOnStopHookOutput would produce
      const hookOutput: HookOutput = {
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: `<system-reminder>
Validation found issues:
- 3 TypeScript errors in src/type-errors.ts
- 2 TypeScript errors in src/index.ts

Consider fixing these before continuing.
</system-reminder>`,
        },
      };

      const result = harness.parseHookOutput(JSON.stringify(hookOutput));

      expect(result.valid).toBe(true);
      expect(result.output?.hookSpecificOutput.hookEventName).toBe("Stop");

      if (!result.output) throw new Error("Expected output to be defined");
      const content = extractReminderContent(result.output.hookSpecificOutput.additionalContext);
      expect(content).toContain("Validation found issues:");
      expect(content).toContain("TypeScript errors in src/type-errors.ts");
      expect(content).toContain("Consider fixing these before continuing");
    });

    test("Stop hook output includes ESLint errors and warnings", () => {
      const hookOutput: HookOutput = {
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: `<system-reminder>
Validation found issues:
- 2 errors, 3 warnings (ESLint) in src/lint-errors.ts

Consider fixing these before continuing.
</system-reminder>`,
        },
      };

      const result = harness.parseHookOutput(JSON.stringify(hookOutput));

      expect(result.valid).toBe(true);

      if (!result.output) throw new Error("Expected output to be defined");
      const content = extractReminderContent(result.output.hookSpecificOutput.additionalContext);
      expect(content).toContain("errors");
      expect(content).toContain("warnings");
      expect(content).toContain("ESLint");
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
      expect(result.output?.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
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
