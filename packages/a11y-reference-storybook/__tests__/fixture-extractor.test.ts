/**
 * Tests for fixture extractor
 */

import { describe, expect, it } from "vitest";
import {
  extractFixturesForRule,
  extractFixturesForRules,
  getBuiltinFixtureRules,
  getBuiltinFixtures,
} from "../src/lib/fixture-extractor.js";

describe("fixture-extractor", () => {
  describe("getBuiltinFixtureRules", () => {
    it("should return list of rules with built-in fixtures", () => {
      const rules = getBuiltinFixtureRules();

      expect(rules.length).toBeGreaterThan(5);
      expect(rules).toContain("image-alt");
      expect(rules).toContain("button-name");
      expect(rules).toContain("link-name");
      expect(rules).toContain("label");
    });
  });

  describe("getBuiltinFixtures", () => {
    it("should return map of all built-in fixtures", () => {
      const fixtures = getBuiltinFixtures();

      expect(fixtures.size).toBeGreaterThan(5);
      expect(fixtures.has("image-alt")).toBe(true);
      expect(fixtures.has("button-name")).toBe(true);
    });

    it("should have both violation and pass fixtures for each rule", () => {
      const fixtures = getBuiltinFixtures();

      for (const [_ruleId, ruleFixtures] of fixtures) {
        const types = ruleFixtures.map((f) => f.type);
        expect(types).toContain("violation");
        expect(types).toContain("pass");
      }
    });
  });

  describe("extractFixturesForRule", () => {
    it("should return built-in fixtures for known rules", async () => {
      const fixtures = await extractFixturesForRule("image-alt");

      expect(fixtures.length).toBeGreaterThan(0);
      expect(fixtures[0]?.ruleId).toBe("image-alt");
    });

    it("should have violation fixtures", async () => {
      const fixtures = await extractFixturesForRule("image-alt");
      const violations = fixtures.filter((f) => f.type === "violation");

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.html).toContain("<img");
    });

    it("should have pass fixtures", async () => {
      const fixtures = await extractFixturesForRule("image-alt");
      const passes = fixtures.filter((f) => f.type === "pass");

      expect(passes.length).toBeGreaterThan(0);
      expect(passes[0]?.html).toContain("alt=");
    });

    it("should return empty array for unknown rules (no GitHub fetch)", async () => {
      const fixtures = await extractFixturesForRule("unknown-rule-xyz");

      expect(fixtures).toEqual([]);
    });

    it("should include source in fixtures", async () => {
      const fixtures = await extractFixturesForRule("button-name");

      expect(fixtures.every((f) => f.source === "builtin")).toBe(true);
    });

    it("should include descriptions in fixtures", async () => {
      const fixtures = await extractFixturesForRule("label");

      expect(fixtures.every((f) => f.description.length > 0)).toBe(true);
    });
  });

  describe("extractFixturesForRules", () => {
    it("should extract fixtures for multiple rules", async () => {
      const fixtures = await extractFixturesForRules(["image-alt", "button-name"]);

      expect(fixtures.size).toBe(2);
      expect(fixtures.has("image-alt")).toBe(true);
      expect(fixtures.has("button-name")).toBe(true);
    });

    it("should handle mix of known and unknown rules", async () => {
      const fixtures = await extractFixturesForRules(["image-alt", "unknown-rule", "link-name"]);

      expect(fixtures.size).toBe(3);
      expect(fixtures.get("image-alt")?.length).toBeGreaterThan(0);
      expect(fixtures.get("unknown-rule")).toEqual([]);
      expect(fixtures.get("link-name")?.length).toBeGreaterThan(0);
    });
  });

  describe("fixture HTML content", () => {
    it("image-alt violations should have images without alt", async () => {
      const fixtures = await extractFixturesForRule("image-alt");
      const violations = fixtures.filter((f) => f.type === "violation");

      for (const fixture of violations) {
        expect(fixture.html).toContain("<img");
        // Violation should either have no alt or empty alt
        const hasProperAlt = fixture.html.match(/alt=["'][^"']+["']/);
        expect(hasProperAlt).toBeFalsy();
      }
    });

    it("button-name violations should have buttons without accessible names", async () => {
      const fixtures = await extractFixturesForRule("button-name");
      const violations = fixtures.filter((f) => f.type === "violation");

      for (const fixture of violations) {
        expect(fixture.html.toLowerCase()).toContain("<button");
      }
    });

    it("label violations should have inputs without labels", async () => {
      const fixtures = await extractFixturesForRule("label");
      const violations = fixtures.filter((f) => f.type === "violation");

      for (const fixture of violations) {
        expect(fixture.html.toLowerCase()).toContain("<input");
        // Should not have a properly associated label
        expect(fixture.html).not.toMatch(/<label[^>]*for=["'][^"']+["'][^>]*>/);
      }
    });

    it("label passes should have inputs with labels", async () => {
      const fixtures = await extractFixturesForRule("label");
      const passes = fixtures.filter((f) => f.type === "pass");

      for (const fixture of passes) {
        const hasLabel = fixture.html.includes("<label") || fixture.html.includes("aria-label");
        expect(hasLabel).toBe(true);
      }
    });
  });

  describe("fixture structure", () => {
    it("each fixture should have required fields", async () => {
      const allFixtures = getBuiltinFixtures();

      for (const [ruleId, fixtures] of allFixtures) {
        for (const fixture of fixtures) {
          expect(fixture.ruleId).toBe(ruleId);
          expect(["violation", "pass"]).toContain(fixture.type);
          expect(fixture.html.length).toBeGreaterThan(0);
          expect(fixture.description.length).toBeGreaterThan(0);
          expect(fixture.source).toBe("builtin");
        }
      }
    });
  });
});
