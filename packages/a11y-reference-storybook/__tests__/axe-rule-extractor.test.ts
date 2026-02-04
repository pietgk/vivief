/**
 * Tests for axe-core rule metadata extractor
 */

import { describe, expect, it } from "vitest";
import {
  extractAllRules,
  extractComponentRules,
  extractPageRules,
  extractRulesByLevel,
  findRuleById,
  findRulesByCriterion,
  getAxeCoreVersion,
  getExtractionSummary,
} from "../src/lib/axe-rule-extractor.js";

describe("axe-rule-extractor", () => {
  describe("extractAllRules", () => {
    it("should extract all rules from axe-core", () => {
      const rules = extractAllRules();

      expect(rules.length).toBeGreaterThan(50);
      expect(rules[0]).toHaveProperty("ruleId");
      expect(rules[0]).toHaveProperty("description");
      expect(rules[0]).toHaveProperty("tags");
      expect(rules[0]).toHaveProperty("category");
    });

    it("should have image-alt rule", () => {
      const rules = extractAllRules();
      const imageAlt = rules.find((r) => r.ruleId === "image-alt");

      expect(imageAlt).toBeDefined();
      expect(imageAlt?.category).toBe("component");
      expect(imageAlt?.wcagCriteria).toContain("1.1.1");
    });

    it("should have button-name rule", () => {
      const rules = extractAllRules();
      const buttonName = rules.find((r) => r.ruleId === "button-name");

      expect(buttonName).toBeDefined();
      expect(buttonName?.category).toBe("component");
    });

    it("should classify page-level rules correctly", () => {
      const rules = extractAllRules();
      const documentTitle = rules.find((r) => r.ruleId === "document-title");

      expect(documentTitle).toBeDefined();
      expect(documentTitle?.category).toBe("page");
    });
  });

  describe("extractComponentRules", () => {
    it("should return only component-level rules", () => {
      const rules = extractComponentRules();

      expect(rules.length).toBeGreaterThan(40);
      expect(rules.every((r) => r.category === "component")).toBe(true);
    });

    it("should include common component rules", () => {
      const rules = extractComponentRules();
      const ruleIds = rules.map((r) => r.ruleId);

      expect(ruleIds).toContain("image-alt");
      expect(ruleIds).toContain("button-name");
      expect(ruleIds).toContain("link-name");
      expect(ruleIds).toContain("color-contrast");
      expect(ruleIds).toContain("label");
    });

    it("should not include page-level rules", () => {
      const rules = extractComponentRules();
      const ruleIds = rules.map((r) => r.ruleId);

      expect(ruleIds).not.toContain("document-title");
      expect(ruleIds).not.toContain("html-has-lang");
    });
  });

  describe("extractPageRules", () => {
    it("should return only page-level rules", () => {
      const rules = extractPageRules();

      expect(rules.length).toBeGreaterThan(5);
      expect(rules.every((r) => r.category === "page")).toBe(true);
    });

    it("should include page-level rules", () => {
      const rules = extractPageRules();
      const ruleIds = rules.map((r) => r.ruleId);

      expect(ruleIds).toContain("document-title");
      expect(ruleIds).toContain("html-has-lang");
    });
  });

  describe("extractRulesByLevel", () => {
    it("should filter rules by WCAG level", () => {
      const rules = extractRulesByLevel(["wcag2a"]);

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.tags.includes("wcag2a"))).toBe(true);
    });

    it("should support multiple levels", () => {
      const rules = extractRulesByLevel(["wcag2a", "wcag2aa"]);

      expect(rules.length).toBeGreaterThan(0);
      const hasLevelTag = rules.every(
        (r) => r.tags.includes("wcag2a") || r.tags.includes("wcag2aa")
      );
      expect(hasLevelTag).toBe(true);
    });

    it("should return all rules when no levels specified", () => {
      const allRules = extractAllRules();
      const filteredRules = extractRulesByLevel([]);

      expect(filteredRules.length).toBe(allRules.length);
    });
  });

  describe("getExtractionSummary", () => {
    it("should return summary statistics", () => {
      const summary = getExtractionSummary();

      expect(summary.totalRules).toBeGreaterThan(50);
      expect(summary.componentLevel).toBeGreaterThan(40);
      expect(summary.pageLevel).toBeGreaterThan(5);
      expect(summary.componentLevel + summary.pageLevel).toBe(summary.totalRules);
    });

    it("should include impact breakdown", () => {
      const summary = getExtractionSummary();

      expect(summary.byImpact.critical).toBeGreaterThanOrEqual(0);
      expect(summary.byImpact.serious).toBeGreaterThanOrEqual(0);
      expect(summary.byImpact.moderate).toBeGreaterThanOrEqual(0);
      expect(summary.byImpact.minor).toBeGreaterThanOrEqual(0);
    });

    it("should include WCAG level breakdown", () => {
      const summary = getExtractionSummary();

      expect(summary.byWcagLevel.A).toBeGreaterThan(0);
      expect(summary.byWcagLevel.AA).toBeGreaterThanOrEqual(0);
      expect(summary.byWcagLevel.AAA).toBeGreaterThanOrEqual(0);
    });

    it("should include axe-core version", () => {
      const summary = getExtractionSummary();

      expect(summary.axeCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("getAxeCoreVersion", () => {
    it("should return a valid version string", () => {
      const version = getAxeCoreVersion();

      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("findRuleById", () => {
    it("should find existing rule by ID", () => {
      const rule = findRuleById("image-alt");

      expect(rule).toBeDefined();
      expect(rule?.ruleId).toBe("image-alt");
    });

    it("should return undefined for non-existent rule", () => {
      const rule = findRuleById("non-existent-rule");

      expect(rule).toBeUndefined();
    });
  });

  describe("findRulesByCriterion", () => {
    it("should find rules by WCAG criterion", () => {
      const rules = findRulesByCriterion("1.1.1");

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.wcagCriteria.includes("1.1.1"))).toBe(true);
    });

    it("should return empty array for non-matching criterion", () => {
      const rules = findRulesByCriterion("9.9.9");

      expect(rules).toEqual([]);
    });
  });

  describe("WCAG criteria extraction", () => {
    it("should extract WCAG criteria from tags", () => {
      const rules = extractAllRules();
      const imageAlt = rules.find((r) => r.ruleId === "image-alt");

      expect(imageAlt?.wcagCriteria).toContain("1.1.1");
    });

    it("should determine correct WCAG level", () => {
      const rules = extractAllRules();
      const imageAlt = rules.find((r) => r.ruleId === "image-alt");

      // image-alt is a Level A rule
      expect(imageAlt?.wcagLevel).toBe("A");
    });
  });

  describe("rule metadata completeness", () => {
    it("should have helpUrl for all rules", () => {
      const rules = extractAllRules();

      for (const rule of rules) {
        expect(rule.helpUrl).toBeDefined();
        if (rule.helpUrl) {
          expect(rule.helpUrl).toContain("dequeuniversity.com");
        }
      }
    });

    it("should have description for all rules", () => {
      const rules = extractAllRules();

      for (const rule of rules) {
        expect(rule.description).toBeDefined();
        expect(rule.description.length).toBeGreaterThan(0);
      }
    });

    it("should have valid impact for all rules", () => {
      const rules = extractAllRules();
      const validImpacts = ["critical", "serious", "moderate", "minor"];

      for (const rule of rules) {
        expect(validImpacts).toContain(rule.impact);
      }
    });

    it("should have valid category for all rules", () => {
      const rules = extractAllRules();
      const validCategories = ["component", "page"];

      for (const rule of rules) {
        expect(validCategories).toContain(rule.category);
      }
    });
  });
});
