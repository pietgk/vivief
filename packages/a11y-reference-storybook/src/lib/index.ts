/**
 * Library exports for a11y-reference-storybook
 */

export {
  extractAllRules,
  extractRulesByLevel,
  extractComponentRules,
  extractPageRules,
  getExtractionSummary,
  getAxeCoreVersion,
  findRuleById,
  findRulesByCriterion,
  type AxeRuleMetadata,
  type ExtractionSummary,
} from "./axe-rule-extractor.js";

export {
  extractFixturesForRule,
  extractFixturesForRules,
  getBuiltinFixtures,
  getBuiltinFixtureRules,
  loadCachedFixtures,
  type ExtractedFixture,
  type ExtractorOptions,
} from "./fixture-extractor.js";

export {
  generateStoryForRule,
  generateStories,
  generateIndexFile,
  type StoryGeneratorOptions,
  type GeneratedStory,
  type GenerationResult,
} from "./story-generator.js";

export {
  generateManifest,
  writeManifest,
  generateAndWriteManifest,
  formatManifestSummary,
  type ManifestRuleEntry,
  type ManifestSummary,
  type A11yRuleManifest,
} from "./manifest-generator.js";
