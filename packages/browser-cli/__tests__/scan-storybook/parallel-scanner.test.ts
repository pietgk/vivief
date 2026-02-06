/**
 * Tests for Parallel Scanner
 *
 * Tests the calculateSummary function and WCAG level mapping.
 * The scanStoriesInParallel function requires a real browser and is tested via integration tests.
 */

import { describe, expect, it } from "vitest";
import { calculateSummary } from "../../src/commands/scan-storybook/parallel-scanner.js";
import type { StoryScanResult } from "../../src/commands/scan-storybook/types.js";

describe("parallel-scanner", () => {
  describe("calculateSummary", () => {
    it("should calculate correct counts for mixed results", () => {
      const results: StoryScanResult[] = [
        {
          storyId: "button--primary",
          storyTitle: "Components/Button/Primary",
          status: "pass",
          violations: [],
          timeMs: 100,
        },
        {
          storyId: "button--secondary",
          storyTitle: "Components/Button/Secondary",
          status: "fail",
          violations: [
            {
              ruleId: "color-contrast",
              ruleName: "Color Contrast",
              message: "Element has insufficient contrast",
              impact: "serious",
              htmlSnippet: "<button>Click</button>",
              cssSelector: ".btn",
            },
          ],
          timeMs: 150,
        },
        {
          storyId: "input--default",
          storyTitle: "Components/Input/Default",
          status: "error",
          violations: [],
          timeMs: 50,
          error: "Timeout",
        },
      ];

      const summary = calculateSummary(results, 2, 5000);

      expect(summary.totalStories).toBe(5);
      expect(summary.scannedStories).toBe(3);
      expect(summary.skippedStories).toBe(2);
      expect(summary.passedStories).toBe(1);
      expect(summary.failedStories).toBe(1);
      expect(summary.errorStories).toBe(1);
      expect(summary.totalViolations).toBe(1);
      expect(summary.seriousCount).toBe(1);
      expect(summary.totalTimeMs).toBe(5000);
    });

    it("should count violations by impact level", () => {
      const results: StoryScanResult[] = [
        {
          storyId: "story-1",
          storyTitle: "Story 1",
          status: "fail",
          violations: [
            {
              ruleId: "r1",
              ruleName: "Rule 1",
              message: "",
              impact: "critical",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "r2",
              ruleName: "Rule 2",
              message: "",
              impact: "critical",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "r3",
              ruleName: "Rule 3",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "r4",
              ruleName: "Rule 4",
              message: "",
              impact: "moderate",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "r5",
              ruleName: "Rule 5",
              message: "",
              impact: "minor",
              htmlSnippet: "",
              cssSelector: "",
            },
          ],
          timeMs: 100,
        },
      ];

      const summary = calculateSummary(results, 0, 100);

      expect(summary.totalViolations).toBe(5);
      expect(summary.criticalCount).toBe(2);
      expect(summary.seriousCount).toBe(1);
      expect(summary.moderateCount).toBe(1);
      expect(summary.minorCount).toBe(1);
    });

    it("should calculate top issues by rule ID", () => {
      const results: StoryScanResult[] = [
        {
          storyId: "story-1",
          storyTitle: "Story 1",
          status: "fail",
          violations: [
            {
              ruleId: "color-contrast",
              ruleName: "Color Contrast",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "color-contrast",
              ruleName: "Color Contrast",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "button-name",
              ruleName: "Button Name",
              message: "",
              impact: "critical",
              htmlSnippet: "",
              cssSelector: "",
            },
          ],
          timeMs: 100,
        },
        {
          storyId: "story-2",
          storyTitle: "Story 2",
          status: "fail",
          violations: [
            {
              ruleId: "color-contrast",
              ruleName: "Color Contrast",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "image-alt",
              ruleName: "Image Alt",
              message: "",
              impact: "critical",
              htmlSnippet: "",
              cssSelector: "",
            },
          ],
          timeMs: 100,
        },
      ];

      const summary = calculateSummary(results, 0, 200);

      expect(summary.topIssues).toHaveLength(3);
      expect(summary.topIssues[0]).toEqual({ ruleId: "color-contrast", count: 3 });
      expect(summary.topIssues[1]).toEqual({ ruleId: "button-name", count: 1 });
      expect(summary.topIssues[2]).toEqual({ ruleId: "image-alt", count: 1 });
    });

    it("should limit top issues to 10", () => {
      const violations = Array.from({ length: 15 }, (_, i) => ({
        ruleId: `rule-${i}`,
        ruleName: `Rule ${i}`,
        message: "",
        impact: "serious" as const,
        htmlSnippet: "",
        cssSelector: "",
      }));

      const results: StoryScanResult[] = [
        {
          storyId: "story-1",
          storyTitle: "Story 1",
          status: "fail",
          violations,
          timeMs: 100,
        },
      ];

      const summary = calculateSummary(results, 0, 100);

      expect(summary.topIssues).toHaveLength(10);
    });

    it("should handle empty results array", () => {
      const summary = calculateSummary([], 5, 1000);

      expect(summary.totalStories).toBe(5);
      expect(summary.scannedStories).toBe(0);
      expect(summary.skippedStories).toBe(5);
      expect(summary.passedStories).toBe(0);
      expect(summary.failedStories).toBe(0);
      expect(summary.errorStories).toBe(0);
      expect(summary.totalViolations).toBe(0);
      expect(summary.topIssues).toEqual([]);
    });

    it("should handle all passing stories", () => {
      const results: StoryScanResult[] = [
        { storyId: "s1", storyTitle: "S1", status: "pass", violations: [], timeMs: 100 },
        { storyId: "s2", storyTitle: "S2", status: "pass", violations: [], timeMs: 100 },
        { storyId: "s3", storyTitle: "S3", status: "pass", violations: [], timeMs: 100 },
      ];

      const summary = calculateSummary(results, 0, 300);

      expect(summary.passedStories).toBe(3);
      expect(summary.failedStories).toBe(0);
      expect(summary.totalViolations).toBe(0);
    });

    it("should handle all error stories", () => {
      const results: StoryScanResult[] = [
        {
          storyId: "s1",
          storyTitle: "S1",
          status: "error",
          violations: [],
          timeMs: 100,
          error: "Timeout",
        },
        {
          storyId: "s2",
          storyTitle: "S2",
          status: "error",
          violations: [],
          timeMs: 100,
          error: "Navigation failed",
        },
      ];

      const summary = calculateSummary(results, 0, 200);

      expect(summary.passedStories).toBe(0);
      expect(summary.failedStories).toBe(0);
      expect(summary.errorStories).toBe(2);
    });

    it("should sort top issues by count descending", () => {
      const results: StoryScanResult[] = [
        {
          storyId: "story-1",
          storyTitle: "Story 1",
          status: "fail",
          violations: [
            {
              ruleId: "rule-a",
              ruleName: "A",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "rule-b",
              ruleName: "B",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "rule-b",
              ruleName: "B",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "rule-c",
              ruleName: "C",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "rule-c",
              ruleName: "C",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
            {
              ruleId: "rule-c",
              ruleName: "C",
              message: "",
              impact: "serious",
              htmlSnippet: "",
              cssSelector: "",
            },
          ],
          timeMs: 100,
        },
      ];

      const summary = calculateSummary(results, 0, 100);

      expect(summary.topIssues[0]?.ruleId).toBe("rule-c");
      expect(summary.topIssues[0]?.count).toBe(3);
      expect(summary.topIssues[1]?.ruleId).toBe("rule-b");
      expect(summary.topIssues[1]?.count).toBe(2);
      expect(summary.topIssues[2]?.ruleId).toBe("rule-a");
      expect(summary.topIssues[2]?.count).toBe(1);
    });
  });
});
