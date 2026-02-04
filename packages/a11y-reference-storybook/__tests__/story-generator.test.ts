/**
 * Tests for story generator
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxeRuleMetadata } from "../src/lib/axe-rule-extractor.js";
import type { ExtractedFixture } from "../src/lib/fixture-extractor.js";
import {
  generateIndexFile,
  generateStories,
  generateStoryForRule,
} from "../src/lib/story-generator.js";

describe("story-generator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `story-gen-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const sampleRule: AxeRuleMetadata = {
    ruleId: "image-alt",
    description: "Images must have alternate text",
    help: "Images must have alternate text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    tags: ["wcag2a", "wcag111", "section508", "cat.text-alternatives"],
    impact: "critical",
    wcagCriteria: ["1.1.1"],
    wcagLevel: "A",
    category: "component",
    enabled: true,
  };

  const sampleFixtures: ExtractedFixture[] = [
    {
      ruleId: "image-alt",
      type: "violation",
      html: '<img src="test.png">',
      description: "Image without alt attribute",
      source: "builtin",
    },
    {
      ruleId: "image-alt",
      type: "pass",
      html: '<img src="test.png" alt="A test image">',
      description: "Image with descriptive alt text",
      source: "builtin",
    },
  ];

  describe("generateStoryForRule", () => {
    it("should generate a story file", () => {
      const result = generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      expect(result.ruleId).toBe("image-alt");
      expect(result.written).toBe(true);
      expect(result.violationCount).toBe(1);
      expect(result.passCount).toBe(1);
    });

    it("should create file in correct category directory", () => {
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      const expectedPath = join(tempDir, "images", "image-alt.stories.tsx");
      expect(existsSync(expectedPath)).toBe(true);
    });

    it("should generate valid TypeScript/JSX content", () => {
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      const filePath = join(tempDir, "images", "image-alt.stories.tsx");
      const content = readFileSync(filePath, "utf-8");

      // Check for required imports
      expect(content).toContain("import type { Meta, StoryObj }");

      // Check for rule metadata in comments
      expect(content).toContain("Rule: `image-alt`");

      // Check for meta export
      expect(content).toContain("const meta: Meta");
      expect(content).toContain("export default meta");

      // Check for story exports
      expect(content).toContain("export const Violation: Story");
      expect(content).toContain("export const Pass: Story");
    });

    it("should include a11yReference parameters", () => {
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      const filePath = join(tempDir, "images", "image-alt.stories.tsx");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("a11yReference");
      expect(content).toContain('ruleId: "image-alt"');
      expect(content).toContain("shouldViolate: true");
      expect(content).toContain("shouldViolate: false");
    });

    it("should use dangerouslySetInnerHTML for fixtures", () => {
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      const filePath = join(tempDir, "images", "image-alt.stories.tsx");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("dangerouslySetInnerHTML");
      expect(content).toContain('<img src="test.png">');
    });

    it("should not overwrite existing files without force", () => {
      // Generate first time
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      // Try to generate again
      const result = generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
        force: false,
      });

      expect(result.written).toBe(false);
    });

    it("should overwrite with force option", () => {
      // Generate first time
      generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      // Generate again with force
      const result = generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
        force: true,
      });

      expect(result.written).toBe(true);
    });

    it("should not write files in dry run mode", () => {
      const result = generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
        dryRun: true,
      });

      expect(result.written).toBe(true); // Reports as "would be written"
      const expectedPath = join(tempDir, "images", "image-alt.stories.tsx");
      expect(existsSync(expectedPath)).toBe(false);
    });

    it("should return empty result for rules with no fixtures", () => {
      const result = generateStoryForRule(sampleRule, [], {
        outputDir: tempDir,
      });

      expect(result.written).toBe(false);
      expect(result.violationCount).toBe(0);
      expect(result.passCount).toBe(0);
    });
  });

  describe("generateStories", () => {
    it("should generate stories for multiple rules", () => {
      const rules: AxeRuleMetadata[] = [
        sampleRule,
        {
          ...sampleRule,
          ruleId: "button-name",
          description: "Buttons must have accessible names",
        },
      ];

      const fixturesMap = new Map<string, ExtractedFixture[]>();
      fixturesMap.set("image-alt", sampleFixtures);
      fixturesMap.set("button-name", [
        {
          ruleId: "button-name",
          type: "violation",
          html: "<button></button>",
          description: "Empty button",
          source: "builtin",
        },
        {
          ruleId: "button-name",
          type: "pass",
          html: "<button>Click me</button>",
          description: "Button with text",
          source: "builtin",
        },
      ]);

      const result = generateStories(rules, fixturesMap, {
        outputDir: tempDir,
      });

      expect(result.stories.length).toBe(2);
      expect(result.filesWritten).toBe(2);
      expect(result.totalStories).toBe(4);
    });

    it("should handle missing fixtures gracefully", () => {
      const rules: AxeRuleMetadata[] = [sampleRule];
      const fixturesMap = new Map<string, ExtractedFixture[]>();
      // No fixtures in map

      const result = generateStories(rules, fixturesMap, {
        outputDir: tempDir,
      });

      expect(result.stories.length).toBe(1);
      expect(result.filesWritten).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("generateIndexFile", () => {
    it("should generate an index file", () => {
      const stories = [
        {
          ruleId: "image-alt",
          filePath: "images/image-alt.stories.tsx",
          category: "images",
          violationCount: 1,
          passCount: 1,
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

      generateIndexFile(stories, tempDir, false);

      const indexPath = join(tempDir, "index.ts");
      expect(existsSync(indexPath)).toBe(true);

      const content = readFileSync(indexPath, "utf-8");
      expect(content).toContain("GENERATED_STORY_COUNT");
      expect(content).toContain("GENERATED_RULES");
      expect(content).toContain("STORIES_BY_CATEGORY");
      expect(content).toContain('"image-alt"');
      expect(content).toContain('"button-name"');
    });

    it("should not write in dry run mode", () => {
      generateIndexFile([], tempDir, true);

      const indexPath = join(tempDir, "index.ts");
      expect(existsSync(indexPath)).toBe(false);
    });
  });

  describe("category assignment", () => {
    it("should assign image rules to images category", () => {
      const result = generateStoryForRule(sampleRule, sampleFixtures, {
        outputDir: tempDir,
      });

      expect(result.category).toBe("images");
    });

    it("should assign button rules to buttons category", () => {
      const buttonRule: AxeRuleMetadata = {
        ...sampleRule,
        ruleId: "button-name",
      };

      const fixture = sampleFixtures[0];
      if (!fixture) throw new Error("Missing fixture");
      const result = generateStoryForRule(buttonRule, [{ ...fixture, ruleId: "button-name" }], {
        outputDir: tempDir,
      });

      expect(result.category).toBe("buttons");
    });

    it("should assign unknown rules to other category", () => {
      const unknownRule: AxeRuleMetadata = {
        ...sampleRule,
        ruleId: "unknown-rule",
      };

      const fixture = sampleFixtures[0];
      if (!fixture) throw new Error("Missing fixture");
      const result = generateStoryForRule(unknownRule, [{ ...fixture, ruleId: "unknown-rule" }], {
        outputDir: tempDir,
      });

      expect(result.category).toBe("other");
    });
  });
});
