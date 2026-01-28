/**
 * Accessibility Module Tests
 *
 * Tests for AxeScanner and play function utilities.
 * Part of DevAC Phase 2: Runtime Detection (Issue #235)
 */

import type { Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type A11yDetectionSource,
  type A11yPlatform,
  type A11yViolation,
  type AxeImpact,
  type AxeScanResult,
  AxeScanner,
  type WcagLevel,
  assertNoViolations,
  createAxeScanner,
} from "../src/index.js";

// Mock axe-core/playwright
vi.mock("@axe-core/playwright", () => ({
  default: vi.fn().mockImplementation(() => ({
    withTags: vi.fn().mockReturnThis(),
    withRules: vi.fn().mockReturnThis(),
    disableRules: vi.fn().mockReturnThis(),
    include: vi.fn().mockReturnThis(),
    analyze: vi.fn().mockResolvedValue({
      url: "https://example.com",
      timestamp: "2024-01-01T00:00:00.000Z",
      violations: [],
      passes: [],
      incomplete: [],
    }),
  })),
}));

// Helper to create a mock page
function createMockPage(): Page {
  return {
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
    },
    evaluate: vi.fn().mockResolvedValue("body"),
    $: vi.fn().mockResolvedValue({}),
    isVisible: vi.fn().mockResolvedValue(false),
  } as unknown as Page;
}

describe("Accessibility Module", () => {
  describe("Type exports", () => {
    it("exports A11yViolation type with correct shape", () => {
      const violation: A11yViolation = {
        ruleId: "color-contrast",
        ruleName: "Elements must have sufficient color contrast",
        impact: "serious",
        wcagCriterion: "1.4.3",
        wcagLevel: "AA",
        detectionSource: "runtime",
        platform: "web",
        message: "Test violation",
        htmlSnippet: "<button>Click</button>",
        cssSelector: "button.primary",
      };

      expect(violation.ruleId).toBe("color-contrast");
      expect(violation.impact).toBe("serious");
      expect(violation.wcagLevel).toBe("AA");
      expect(violation.detectionSource).toBe("runtime");
    });

    it("exports WcagLevel type values", () => {
      const levelA: WcagLevel = "A";
      const levelAA: WcagLevel = "AA";
      const levelAAA: WcagLevel = "AAA";

      expect([levelA, levelAA, levelAAA]).toEqual(["A", "AA", "AAA"]);
    });

    it("exports AxeImpact type values", () => {
      const impacts: AxeImpact[] = ["critical", "serious", "moderate", "minor"];
      expect(impacts).toHaveLength(4);
    });

    it("exports A11yPlatform type values", () => {
      const platforms: A11yPlatform[] = ["web", "react-native"];
      expect(platforms).toHaveLength(2);
    });

    it("exports A11yDetectionSource type values", () => {
      const sources: A11yDetectionSource[] = ["static", "runtime", "semantic"];
      expect(sources).toHaveLength(3);
    });
  });

  describe("AxeScanner", () => {
    let mockPage: Page;

    beforeEach(() => {
      mockPage = createMockPage();
      vi.clearAllMocks();
    });

    describe("constructor", () => {
      it("creates scanner with default platform", () => {
        const scanner = new AxeScanner(mockPage);
        expect(scanner).toBeDefined();
      });

      it("creates scanner with specified platform", () => {
        const scanner = new AxeScanner(mockPage, "react-native");
        expect(scanner).toBeDefined();
      });
    });

    describe("scan()", () => {
      it("returns scan result with violations array", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan();

        expect(result).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
      });

      it("returns scan result with summary", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan();

        expect(result.summary).toBeDefined();
        expect(typeof result.summary.violationCount).toBe("number");
        expect(typeof result.summary.passCount).toBe("number");
        expect(typeof result.summary.incompleteCount).toBe("number");
        expect(typeof result.summary.criticalCount).toBe("number");
        expect(typeof result.summary.seriousCount).toBe("number");
        expect(typeof result.summary.moderateCount).toBe("number");
        expect(typeof result.summary.minorCount).toBe("number");
      });

      it("includes timing information", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan();

        expect(typeof result.timeMs).toBe("number");
        expect(result.timeMs).toBeGreaterThanOrEqual(0);
      });

      it("includes URL and timestamp", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan();

        expect(result.url).toBe("https://example.com");
        expect(result.timestamp).toBeDefined();
      });

      it("accepts WCAG level option", async () => {
        const scanner = new AxeScanner(mockPage);

        const resultA = await scanner.scan({ wcagLevel: "A" });
        const resultAA = await scanner.scan({ wcagLevel: "AA" });
        const resultAAA = await scanner.scan({ wcagLevel: "AAA" });

        expect(resultA).toBeDefined();
        expect(resultAA).toBeDefined();
        expect(resultAAA).toBeDefined();
      });

      it("accepts selector option for scoped scan", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan({ selector: "#main-content" });

        expect(result).toBeDefined();
      });

      it("accepts context label option", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan({ contextLabel: "after-button-click" });

        expect(result.contextLabel).toBe("after-button-click");
      });

      it("accepts include/exclude rules options", async () => {
        const scanner = new AxeScanner(mockPage);

        const withInclude = await scanner.scan({ includeRules: ["color-contrast"] });
        const withExclude = await scanner.scan({ excludeRules: ["landmark-one-main"] });

        expect(withInclude).toBeDefined();
        expect(withExclude).toBeDefined();
      });

      it("includes passes when includePasses is true", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan({ includePasses: true });

        expect(result.passes).toBeDefined();
      });

      it("includes incomplete when includeIncomplete is true", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scan({ includeIncomplete: true });

        expect(result.incomplete).toBeDefined();
      });
    });

    describe("scanAfterInteraction()", () => {
      it("waits before scanning", async () => {
        const scanner = new AxeScanner(mockPage);
        await scanner.scanAfterInteraction("after-click");

        expect(mockPage.waitForTimeout).toHaveBeenCalled();
      });

      it("sets context label from interaction name", async () => {
        const scanner = new AxeScanner(mockPage);
        const result = await scanner.scanAfterInteraction("after-form-submit");

        expect(result.contextLabel).toBe("after-form-submit");
      });

      it("accepts custom wait time", async () => {
        const scanner = new AxeScanner(mockPage);
        await scanner.scanAfterInteraction("test", {}, 1000);

        expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
      });
    });
  });

  describe("createAxeScanner factory", () => {
    it("creates scanner instance", () => {
      const mockPage = createMockPage();
      const scanner = createAxeScanner(mockPage);

      expect(scanner).toBeInstanceOf(AxeScanner);
    });

    it("creates scanner with platform option", () => {
      const mockPage = createMockPage();
      const scanner = createAxeScanner(mockPage, "react-native");

      expect(scanner).toBeInstanceOf(AxeScanner);
    });
  });

  describe("assertNoViolations", () => {
    it("does not throw when no violations exist", () => {
      const result: AxeScanResult = {
        violations: [],
        url: "https://example.com",
        timestamp: "2024-01-01T00:00:00.000Z",
        timeMs: 100,
        elementsChecked: 50,
        summary: {
          violationCount: 0,
          passCount: 10,
          incompleteCount: 0,
          criticalCount: 0,
          seriousCount: 0,
          moderateCount: 0,
          minorCount: 0,
        },
      };

      expect(() => assertNoViolations(result, "test context")).not.toThrow();
    });

    it("throws when violations exist", () => {
      const result: AxeScanResult = {
        violations: [
          {
            ruleId: "color-contrast",
            ruleName: "Color contrast",
            impact: "serious",
            wcagCriterion: "1.4.3",
            wcagLevel: "AA",
            detectionSource: "runtime",
            platform: "web",
            message: "Test",
            htmlSnippet: "<p>Test</p>",
            cssSelector: "p.low-contrast",
          },
        ],
        url: "https://example.com",
        timestamp: "2024-01-01T00:00:00.000Z",
        timeMs: 100,
        elementsChecked: 50,
        summary: {
          violationCount: 1,
          passCount: 10,
          incompleteCount: 0,
          criticalCount: 0,
          seriousCount: 1,
          moderateCount: 0,
          minorCount: 0,
        },
      };

      expect(() => assertNoViolations(result, "test context")).toThrow(
        /Accessibility violations in "test context"/
      );
    });

    it("includes violation details in error message", () => {
      const result: AxeScanResult = {
        violations: [
          {
            ruleId: "button-name",
            ruleName: "Buttons must have discernible text",
            impact: "critical",
            wcagCriterion: "4.1.2",
            wcagLevel: "A",
            detectionSource: "runtime",
            platform: "web",
            message: "Test",
            htmlSnippet: "<button></button>",
            cssSelector: "button.icon-only",
          },
        ],
        url: "https://example.com",
        timestamp: "2024-01-01T00:00:00.000Z",
        timeMs: 100,
        elementsChecked: 50,
        summary: {
          violationCount: 1,
          passCount: 10,
          incompleteCount: 0,
          criticalCount: 1,
          seriousCount: 0,
          moderateCount: 0,
          minorCount: 0,
        },
      };

      try {
        assertNoViolations(result, "test");
      } catch (error) {
        expect((error as Error).message).toContain("critical");
        expect((error as Error).message).toContain("Buttons must have discernible text");
        expect((error as Error).message).toContain("button.icon-only");
      }
    });
  });

  describe("AxeScanResult structure", () => {
    it("has correct shape", () => {
      const result: AxeScanResult = {
        violations: [],
        passes: [],
        incomplete: [],
        url: "https://example.com",
        timestamp: "2024-01-01T00:00:00.000Z",
        contextLabel: "initial",
        timeMs: 150,
        elementsChecked: 100,
        summary: {
          violationCount: 0,
          passCount: 50,
          incompleteCount: 5,
          criticalCount: 0,
          seriousCount: 0,
          moderateCount: 0,
          minorCount: 0,
        },
      };

      expect(result.violations).toEqual([]);
      expect(result.passes).toEqual([]);
      expect(result.incomplete).toEqual([]);
      expect(result.url).toBe("https://example.com");
      expect(result.contextLabel).toBe("initial");
      expect(result.summary.violationCount).toBe(0);
    });
  });
});

describe("Play Function Utilities Types", () => {
  describe("KeyboardNavResult", () => {
    it("has correct shape for success case", () => {
      const result = {
        success: true,
        focusPath: ["#input1", "#input2", "#submit"],
      };

      expect(result.success).toBe(true);
      expect(result.focusPath).toHaveLength(3);
    });

    it("has correct shape for failure case", () => {
      const result = {
        success: false,
        focusPath: ["#input1"],
        error: "Focus trap escaped",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("FocusTrapResult", () => {
    it("has correct shape for success case", () => {
      const result = {
        success: true,
        focusedElements: ["close-button", "confirm-button", "cancel-button"],
      };

      expect(result.success).toBe(true);
      expect(result.focusedElements).toHaveLength(3);
    });

    it("has correct shape for failure case", () => {
      const result = {
        success: false,
        focusedElements: ["close-button"],
        escapedTo: "body",
        error: "Focus escaped to body",
      };

      expect(result.success).toBe(false);
      expect(result.escapedTo).toBe("body");
    });
  });
});
