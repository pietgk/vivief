/**
 * Hook Output Schema Validation
 *
 * Defines Zod schemas for validating Claude Code hook output format.
 * Used by integration and E2E tests to ensure hook outputs conform to spec.
 */

import { z } from "zod";

/**
 * Schema for hook-specific output that gets injected into Claude Code context.
 */
export const HookSpecificOutputSchema = z.object({
  hookEventName: z.enum(["UserPromptSubmit", "Stop"]),
  additionalContext: z
    .string()
    .refine(
      (s) => s.startsWith("<system-reminder>") && s.endsWith("</system-reminder>"),
      "additionalContext must be wrapped in <system-reminder> tags"
    ),
});

/**
 * Full hook output schema as expected by Claude Code hooks.
 */
export const HookOutputSchema = z.object({
  hookSpecificOutput: HookSpecificOutputSchema,
});

/**
 * Type for the full hook output.
 */
export type HookOutput = z.infer<typeof HookOutputSchema>;

/**
 * Type for hook-specific output.
 */
export type HookSpecificOutput = z.infer<typeof HookSpecificOutputSchema>;

/**
 * Validate hook output against schema.
 * Returns validated output or throws Zod error.
 */
export function validateHookOutput(output: unknown): HookOutput {
  return HookOutputSchema.parse(output);
}

/**
 * Safe validation that returns result object instead of throwing.
 */
export function safeValidateHookOutput(
  output: unknown
): z.SafeParseReturnType<unknown, HookOutput> {
  return HookOutputSchema.safeParse(output);
}

/**
 * Extract the content from system-reminder tags.
 */
export function extractReminderContent(additionalContext: string): string {
  const match = additionalContext.match(/<system-reminder>([\s\S]*)<\/system-reminder>/);
  return match?.[1]?.trim() ?? "";
}

/**
 * Schema for diagnostics counts in hook output content.
 */
export const DiagnosticsCountsSchema = z.object({
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
});

/**
 * Type for diagnostics counts.
 */
export type DiagnosticsCounts = z.infer<typeof DiagnosticsCountsSchema>;

/**
 * Parse diagnostics counts from hook output content.
 * Looks for patterns like "N errors, M warnings" or "N errors" or "M warnings".
 */
export function parseDiagnosticsCounts(content: string): DiagnosticsCounts {
  const errorMatch = content.match(/(\d+)\s+error/i);
  const warningMatch = content.match(/(\d+)\s+warning/i);

  return {
    errors: errorMatch?.[1] ? Number.parseInt(errorMatch[1], 10) : 0,
    warnings: warningMatch?.[1] ? Number.parseInt(warningMatch[1], 10) : 0,
  };
}

/**
 * Check if hook output indicates issues were found.
 */
export function hasIssues(hookOutput: HookOutput): boolean {
  const content = extractReminderContent(hookOutput.hookSpecificOutput.additionalContext);
  const counts = parseDiagnosticsCounts(content);
  return counts.errors > 0 || counts.warnings > 0;
}
