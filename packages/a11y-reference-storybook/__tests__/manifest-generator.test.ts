/**
 * Tests for manifest generator
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxeRuleMetadata } from "../src/lib/axe-rule-extractor.js";
import {
  formatManifestSummary,
  generateAndWriteManifest,
  generateManifest,
  writeManifest,
} from "../src/lib/manifest-generator.js";
import type { GeneratedStory } from "../src/lib/story-generator.js";

describe("manifest-generator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `manifest-gen-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const sampleRules: AxeRuleMetadata[] = [
    {
      ruleId: "image-alt",
      description: "Images must have alternate text",
      help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      tags: ["wcag2a", "wcag111"],
      impact: "critical",
      wcagCriteria: ["1.1.1"],
      wcagLevel: "A",
      category: "component",
      enabled: true,
    },
    {
      ruleId: "button-name",
      description: "Buttons must have discernible text",
      help: "Buttons must have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
      tags: ["wcag2a", "wcag412"],
      impact: "critical",
      wcagCriteria: ["4.1.2"],
      wcagLevel: "A",
      category: "component",
      enabled: true,
    },
    {
      ruleId: "document-title",
      description: "Documents must have a title element",
      help: "Documents must have a title element",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/document-title",
      tags: ["wcag2a", "wcag242"],
      impact: "serious",
      wcagCriteria: ["2.4.2"],
      wcagLevel: "A",
      category: "page",
      enabled: true,
    },
  ];

  const sampleStories: GeneratedStory[] = [
    {
      ruleId: "image-alt",
      filePath: "images/image-alt.stories.tsx",
      category: "images",
      violationCount: 2,
      passCount: 2,
      written: true,
    },
    {
      ruleId: "button-name",
      filePath: "buttons/button-name.stories.tsx",
      category: "buttons",
      violationCount: 1,
      passCount: 1,
      written: true,
    },
  ];

  describe("generateManifest", () => {
    it("should generate manifest with correct structure", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.axeCoreVersion).toBeDefined();
      expect(manifest.rules).toBeDefined();
      expect(manifest.summary).toBeDefined();
    });

    it("should include all rules in manifest", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      expect(manifest.rules.length).toBe(3);
      const ruleIds = manifest.rules.map((r) => r.ruleId);
      expect(ruleIds).toContain("image-alt");
      expect(ruleIds).toContain("button-name");
      expect(ruleIds).toContain("document-title");
    });

    it("should sort rules by ID", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      const ruleIds = manifest.rules.map((r) => r.ruleId);
      expect(ruleIds).toEqual([...ruleIds].sort());
    });

    it("should include correct story names for rules with stories", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      const imageAlt = manifest.rules.find((r) => r.ruleId === "image-alt");
      expect(imageAlt?.stories.violations).toEqual(["Violation1", "Violation2"]);
      expect(imageAlt?.stories.passes).toEqual(["Pass1", "Pass2"]);

      const buttonName = manifest.rules.find((r) => r.ruleId === "button-name");
      expect(buttonName?.stories.violations).toEqual(["Violation"]);
      expect(buttonName?.stories.passes).toEqual(["Pass"]);
    });

    it("should handle rules without stories", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      const docTitle = manifest.rules.find((r) => r.ruleId === "document-title");
      expect(docTitle?.stories.violations).toEqual([]);
      expect(docTitle?.stories.passes).toEqual([]);
    });

    it("should calculate correct summary statistics", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      expect(manifest.summary.totalRules).toBe(3);
      expect(manifest.summary.componentLevel).toBe(2);
      expect(manifest.summary.pageLevel).toBe(1);
      expect(manifest.summary.storiesGenerated).toBe(6); // 2+2+1+1
      expect(manifest.summary.violationStories).toBe(3); // 2+1
      expect(manifest.summary.passStories).toBe(3); // 2+1
    });

    it("should include rule metadata", () => {
      const manifest = generateManifest(sampleRules, sampleStories);

      const imageAlt = manifest.rules.find((r) => r.ruleId === "image-alt");
      expect(imageAlt?.description).toBe("Images must have alternate text");
      expect(imageAlt?.wcag).toContain("1.1.1");
      expect(imageAlt?.impact).toBe("critical");
      expect(imageAlt?.helpUrl).toContain("dequeuniversity.com");
      expect(imageAlt?.category).toBe("component");
    });
  });

  describe("writeManifest", () => {
    it("should write manifest to file", () => {
      const manifest = generateManifest(sampleRules, sampleStories);
      const outputPath = join(tempDir, "test-manifest.json");

      writeManifest(manifest, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });

    it("should write valid JSON", () => {
      const manifest = generateManifest(sampleRules, sampleStories);
      const outputPath = join(tempDir, "test-manifest.json");

      writeManifest(manifest, outputPath);

      const content = readFileSync(outputPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.rules.length).toBe(3);
    });

    it("should format JSON with indentation", () => {
      const manifest = generateManifest(sampleRules, sampleStories);
      const outputPath = join(tempDir, "test-manifest.json");

      writeManifest(manifest, outputPath);

      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("  "); // Has indentation
      expect(content.split("\n").length).toBeGreaterThan(10); // Multiple lines
    });
  });

  describe("generateAndWriteManifest", () => {
    it("should generate and write manifest in one step", () => {
      const manifest = generateAndWriteManifest(sampleRules, sampleStories, tempDir);

      const outputPath = join(tempDir, "a11y-rule-manifest.json");
      expect(existsSync(outputPath)).toBe(true);
      expect(manifest.rules.length).toBe(3);
    });
  });

  describe("formatManifestSummary", () => {
    it("should format summary for console output", () => {
      const manifest = generateManifest(sampleRules, sampleStories);
      const summary = formatManifestSummary(manifest);

      expect(summary).toContain("A11y Reference Manifest Generated");
      expect(summary).toContain("Total rules: 3");
      expect(summary).toContain("Component-level: 2");
      expect(summary).toContain("Page-level: 1");
      expect(summary).toContain("axe-core version:");
    });
  });
});
