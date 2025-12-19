/**
 * Review Module Tests
 *
 * Tests for LLM review prompt generation and response parsing.
 */

import { describe, expect, it } from "vitest";
import {
  buildReviewPrompt,
  formatReviewAsMarkdown,
  parseReviewResponse,
} from "../../src/context/review.js";
import type { GatheredDiffs, ReviewResult } from "../../src/context/review.js";

describe("Review", () => {
  describe("buildReviewPrompt", () => {
    it("builds a prompt with repository information", () => {
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api-123-auth",
            diff: "diff --git a/src/auth.ts b/src/auth.ts\n+export function validateToken() {}",
            filesChanged: ["src/auth.ts"],
            insertions: 1,
            deletions: 0,
          },
        ],
        totalFiles: 1,
        totalChanges: 1,
      };

      const prompt = buildReviewPrompt(diffs);

      expect(prompt).toContain("1 repositories");
      expect(prompt).toContain("1 files changed");
      expect(prompt).toContain("Repository: api");
      expect(prompt).toContain("Files changed: src/auth.ts");
      expect(prompt).toContain("validateToken");
    });

    it("includes focus instructions for security", () => {
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api",
            diff: "some diff",
            filesChanged: ["src/file.ts"],
            insertions: 1,
            deletions: 0,
          },
        ],
        totalFiles: 1,
        totalChanges: 1,
      };

      const prompt = buildReviewPrompt(diffs, { focus: "security" });

      expect(prompt).toContain("Focus Area: Security");
      expect(prompt).toContain("Authentication and authorization");
      expect(prompt).toContain("SQL injection");
    });

    it("includes focus instructions for performance", () => {
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api",
            diff: "some diff",
            filesChanged: ["src/file.ts"],
            insertions: 1,
            deletions: 0,
          },
        ],
        totalFiles: 1,
        totalChanges: 1,
      };

      const prompt = buildReviewPrompt(diffs, { focus: "performance" });

      expect(prompt).toContain("Focus Area: Performance");
      expect(prompt).toContain("N+1 queries");
      expect(prompt).toContain("Memory leaks");
    });

    it("includes focus instructions for tests", () => {
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api",
            diff: "some diff",
            filesChanged: ["src/file.ts"],
            insertions: 1,
            deletions: 0,
          },
        ],
        totalFiles: 1,
        totalChanges: 1,
      };

      const prompt = buildReviewPrompt(diffs, { focus: "tests" });

      expect(prompt).toContain("Focus Area: Testing");
      expect(prompt).toContain("test coverage");
      expect(prompt).toContain("Edge cases");
    });

    it("truncates large diffs", () => {
      const largeDiff = "a".repeat(60000);
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api",
            diff: largeDiff,
            filesChanged: ["src/file.ts"],
            insertions: 1000,
            deletions: 0,
          },
        ],
        totalFiles: 1,
        totalChanges: 1000,
      };

      const prompt = buildReviewPrompt(diffs, { maxDiffSize: 10000 });

      expect(prompt.length).toBeLessThan(15000);
      expect(prompt).toContain("truncated");
    });

    it("includes multiple repositories", () => {
      const diffs: GatheredDiffs = {
        diffs: [
          {
            repo: "api",
            path: "/ws/api",
            diff: "api diff",
            filesChanged: ["src/api.ts"],
            insertions: 10,
            deletions: 5,
          },
          {
            repo: "web",
            path: "/ws/web",
            diff: "web diff",
            filesChanged: ["src/app.tsx"],
            insertions: 20,
            deletions: 10,
          },
        ],
        totalFiles: 2,
        totalChanges: 45,
      };

      const prompt = buildReviewPrompt(diffs);

      expect(prompt).toContain("2 repositories");
      expect(prompt).toContain("Repository: api");
      expect(prompt).toContain("Repository: web");
    });
  });

  describe("parseReviewResponse", () => {
    it("parses a structured LLM response", () => {
      const response = `### Summary
This PR adds authentication functionality with proper token validation.

### Findings
- **[CRITICAL]** security: SQL injection vulnerability in query (file: src/db.ts, line: 42)
  - Suggestion: Use parameterized queries
- **[WARNING]** performance: Inefficient loop (file: src/utils.ts, line: 100)

### Suggested Sub-Issues
1. **Add rate limiting**: Implement rate limiting to prevent brute force attacks
2. **Add logging**: Add comprehensive logging for auth events`;

      const diffs: GatheredDiffs = {
        diffs: [
          { repo: "api", path: "/ws/api", diff: "", filesChanged: [], insertions: 0, deletions: 0 },
        ],
        totalFiles: 0,
        totalChanges: 0,
      };

      const result = parseReviewResponse(response, diffs);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("authentication");
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.suggestedSubIssues.length).toBe(2);
    });

    it("handles response with no findings", () => {
      const response = `### Summary
All changes look good.

### Findings
No issues found.

### Suggested Sub-Issues
None needed.`;

      const diffs: GatheredDiffs = {
        diffs: [
          { repo: "api", path: "/ws/api", diff: "", filesChanged: [], insertions: 0, deletions: 0 },
        ],
        totalFiles: 0,
        totalChanges: 0,
      };

      const result = parseReviewResponse(response, diffs);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("good");
    });

    it("provides default summary when none found", () => {
      const response = "Random text without proper structure";

      const diffs: GatheredDiffs = {
        diffs: [],
        totalFiles: 0,
        totalChanges: 0,
      };

      const result = parseReviewResponse(response, diffs);

      expect(result.success).toBe(true);
      expect(result.summary).toBe("No summary provided.");
    });
  });

  describe("formatReviewAsMarkdown", () => {
    it("formats a review result with findings", () => {
      const result: ReviewResult = {
        success: true,
        summary: "Changes look good overall",
        findings: [
          {
            severity: "critical",
            category: "security",
            filePath: "src/auth.ts",
            line: 42,
            description: "SQL injection vulnerability",
            repo: "api",
          },
          {
            severity: "warning",
            category: "performance",
            filePath: "src/utils.ts",
            description: "Inefficient algorithm",
            repo: "api",
          },
        ],
        suggestedSubIssues: [
          {
            title: "Add input validation",
            body: "Implement proper input validation for user data",
            repo: "api",
            relatedFindings: [0],
          },
        ],
        stats: {
          totalFiles: 5,
          totalChanges: 100,
          reposReviewed: 1,
        },
      };

      const formatted = formatReviewAsMarkdown(result);

      expect(formatted).toContain("# Code Review Report");
      expect(formatted).toContain("1 repositories");
      expect(formatted).toContain("5 files");
      expect(formatted).toContain("100 changes");
      expect(formatted).toContain("## Summary");
      expect(formatted).toContain("Changes look good overall");
      expect(formatted).toContain("🔴 Critical");
      expect(formatted).toContain("SQL injection");
      expect(formatted).toContain("🟡 Warnings");
      expect(formatted).toContain("Inefficient algorithm");
      expect(formatted).toContain("## Suggested Follow-up Issues");
      expect(formatted).toContain("Add input validation");
    });

    it("formats a review result with no findings", () => {
      const result: ReviewResult = {
        success: true,
        summary: "All good",
        findings: [],
        suggestedSubIssues: [],
        stats: {
          totalFiles: 1,
          totalChanges: 10,
          reposReviewed: 1,
        },
      };

      const formatted = formatReviewAsMarkdown(result);

      expect(formatted).toContain("No significant issues found");
      expect(formatted).toContain("✅");
    });

    it("formats failed review", () => {
      const result: ReviewResult = {
        success: false,
        summary: "",
        findings: [],
        suggestedSubIssues: [],
        stats: { totalFiles: 0, totalChanges: 0, reposReviewed: 0 },
        error: "Failed to gather diffs",
      };

      const formatted = formatReviewAsMarkdown(result);

      expect(formatted).toContain("Review Failed");
      expect(formatted).toContain("Failed to gather diffs");
    });

    it("includes file paths and line numbers in findings", () => {
      const result: ReviewResult = {
        success: true,
        summary: "Found some issues",
        findings: [
          {
            severity: "suggestion",
            category: "code-quality",
            filePath: "src/components/Button.tsx",
            line: 25,
            description: "Consider extracting this to a separate component",
            suggestion: "Create a new IconButton component",
            repo: "web",
          },
        ],
        suggestedSubIssues: [],
        stats: { totalFiles: 1, totalChanges: 5, reposReviewed: 1 },
      };

      const formatted = formatReviewAsMarkdown(result);

      expect(formatted).toContain("💡 Suggestions");
      expect(formatted).toContain("`src/components/Button.tsx`:25");
      expect(formatted).toContain("Fix: Create a new IconButton component");
    });
  });
});
