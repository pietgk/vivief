/**
 * Fixture Extractor for axe-core Integration Tests
 *
 * Extracts HTML fixtures from axe-core's integration test directory.
 * These fixtures provide examples of violations and passes for each rule.
 *
 * Since the npm package doesn't include test fixtures, this module can:
 * 1. Use built-in sample fixtures for common rules
 * 2. Fetch fixtures from GitHub (axe-core repo) on demand
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Extracted fixture from axe-core tests
 */
export interface ExtractedFixture {
  /** Rule ID this fixture tests */
  ruleId: string;
  /** Type of fixture */
  type: "violation" | "pass";
  /** HTML content of the fixture */
  html: string;
  /** Description of what this fixture demonstrates */
  description: string;
  /** Source of the fixture */
  source: "builtin" | "github" | "local";
}

/**
 * Options for fixture extraction
 */
export interface ExtractorOptions {
  /** Path to local axe-core repo (optional) */
  localAxeCorePath?: string;
  /** Cache directory for downloaded fixtures */
  cacheDir?: string;
  /** Whether to fetch from GitHub if local not available */
  fetchFromGitHub?: boolean;
  /** GitHub branch to fetch from */
  githubBranch?: string;
}

const DEFAULT_GITHUB_BRANCH = "develop";
const AXE_CORE_REPO = "dequelabs/axe-core";

/**
 * Built-in fixtures for common rules when GitHub fetch is not available
 */
const BUILTIN_FIXTURES: Record<string, ExtractedFixture[]> = {
  "image-alt": [
    {
      ruleId: "image-alt",
      type: "violation",
      html: '<img src="test.png">',
      description: "Image without alt attribute",
      source: "builtin",
    },
    {
      ruleId: "image-alt",
      type: "violation",
      html: '<img src="test.png" alt="">',
      description: "Image with empty alt (when not decorative)",
      source: "builtin",
    },
    {
      ruleId: "image-alt",
      type: "pass",
      html: '<img src="test.png" alt="A test image">',
      description: "Image with descriptive alt text",
      source: "builtin",
    },
    {
      ruleId: "image-alt",
      type: "pass",
      html: '<img src="test.png" alt="" role="presentation">',
      description: "Decorative image with role=presentation",
      source: "builtin",
    },
  ],
  "button-name": [
    {
      ruleId: "button-name",
      type: "violation",
      html: "<button></button>",
      description: "Button without text or accessible name",
      source: "builtin",
    },
    {
      ruleId: "button-name",
      type: "violation",
      html: '<button><span aria-hidden="true">×</span></button>',
      description: "Button with only hidden content",
      source: "builtin",
    },
    {
      ruleId: "button-name",
      type: "pass",
      html: "<button>Submit</button>",
      description: "Button with text content",
      source: "builtin",
    },
    {
      ruleId: "button-name",
      type: "pass",
      html: '<button aria-label="Close"><span aria-hidden="true">×</span></button>',
      description: "Icon button with aria-label",
      source: "builtin",
    },
  ],
  "link-name": [
    {
      ruleId: "link-name",
      type: "violation",
      html: '<a href="/"></a>',
      description: "Link without text or accessible name",
      source: "builtin",
    },
    {
      ruleId: "link-name",
      type: "violation",
      html: '<a href="/"><img src="logo.png"></a>',
      description: "Link with image that has no alt",
      source: "builtin",
    },
    {
      ruleId: "link-name",
      type: "pass",
      html: '<a href="/">Home</a>',
      description: "Link with text content",
      source: "builtin",
    },
    {
      ruleId: "link-name",
      type: "pass",
      html: '<a href="/" aria-label="Go to home page"><img src="home.png" alt=""></a>',
      description: "Link with aria-label and decorative image",
      source: "builtin",
    },
  ],
  label: [
    {
      ruleId: "label",
      type: "violation",
      html: '<input type="text" placeholder="Enter name">',
      description: "Input without label",
      source: "builtin",
    },
    {
      ruleId: "label",
      type: "violation",
      html: '<input type="email">',
      description: "Email input without label",
      source: "builtin",
    },
    {
      ruleId: "label",
      type: "pass",
      html: '<label for="name">Name</label><input id="name" type="text">',
      description: "Input with associated label",
      source: "builtin",
    },
    {
      ruleId: "label",
      type: "pass",
      html: '<label>Name <input type="text"></label>',
      description: "Input wrapped in label",
      source: "builtin",
    },
    {
      ruleId: "label",
      type: "pass",
      html: '<input type="text" aria-label="Enter your name">',
      description: "Input with aria-label",
      source: "builtin",
    },
  ],
  "color-contrast": [
    {
      ruleId: "color-contrast",
      type: "violation",
      html: '<p style="color: #aaa; background-color: #fff;">Low contrast text</p>',
      description: "Text with insufficient color contrast",
      source: "builtin",
    },
    {
      ruleId: "color-contrast",
      type: "pass",
      html: '<p style="color: #333; background-color: #fff;">High contrast text</p>',
      description: "Text with sufficient color contrast",
      source: "builtin",
    },
  ],
  "heading-order": [
    {
      ruleId: "heading-order",
      type: "violation",
      html: "<h1>Title</h1><h3>Skipped h2</h3>",
      description: "Heading level skipped from h1 to h3",
      source: "builtin",
    },
    {
      ruleId: "heading-order",
      type: "pass",
      html: "<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>",
      description: "Proper heading hierarchy",
      source: "builtin",
    },
  ],
  "duplicate-id": [
    {
      ruleId: "duplicate-id",
      type: "violation",
      html: '<div id="same">First</div><div id="same">Second</div>',
      description: "Two elements with same ID",
      source: "builtin",
    },
    {
      ruleId: "duplicate-id",
      type: "pass",
      html: '<div id="first">First</div><div id="second">Second</div>',
      description: "Elements with unique IDs",
      source: "builtin",
    },
  ],
  list: [
    {
      ruleId: "list",
      type: "violation",
      html: "<ul><div>Not a list item</div></ul>",
      description: "List with non-li child",
      source: "builtin",
    },
    {
      ruleId: "list",
      type: "pass",
      html: "<ul><li>List item 1</li><li>List item 2</li></ul>",
      description: "Proper list structure",
      source: "builtin",
    },
  ],
  listitem: [
    {
      ruleId: "listitem",
      type: "violation",
      html: "<li>Orphan list item</li>",
      description: "List item outside of list",
      source: "builtin",
    },
    {
      ruleId: "listitem",
      type: "pass",
      html: "<ul><li>Proper list item</li></ul>",
      description: "List item inside list",
      source: "builtin",
    },
  ],
  "aria-hidden-focus": [
    {
      ruleId: "aria-hidden-focus",
      type: "violation",
      html: '<div aria-hidden="true"><button>Focusable but hidden</button></div>',
      description: "Focusable element inside aria-hidden container",
      source: "builtin",
    },
    {
      ruleId: "aria-hidden-focus",
      type: "violation",
      html: '<button aria-hidden="true">Hidden button</button>',
      description: "Button with aria-hidden",
      source: "builtin",
    },
    {
      ruleId: "aria-hidden-focus",
      type: "pass",
      html: '<div aria-hidden="true"><span>Decorative text</span></div>',
      description: "Non-focusable content in aria-hidden",
      source: "builtin",
    },
  ],
  "role-img-alt": [
    {
      ruleId: "role-img-alt",
      type: "violation",
      html: '<span role="img">🎉</span>',
      description: "Element with role=img but no accessible name",
      source: "builtin",
    },
    {
      ruleId: "role-img-alt",
      type: "pass",
      html: '<span role="img" aria-label="Celebration emoji">🎉</span>',
      description: "Element with role=img and aria-label",
      source: "builtin",
    },
  ],
  "select-name": [
    {
      ruleId: "select-name",
      type: "violation",
      html: "<select><option>Option 1</option></select>",
      description: "Select without label",
      source: "builtin",
    },
    {
      ruleId: "select-name",
      type: "pass",
      html: '<label for="choice">Choose:</label><select id="choice"><option>Option 1</option></select>',
      description: "Select with associated label",
      source: "builtin",
    },
  ],
  tabindex: [
    {
      ruleId: "tabindex",
      type: "violation",
      html: '<div tabindex="5">Custom tab order</div>',
      description: "Element with positive tabindex",
      source: "builtin",
    },
    {
      ruleId: "tabindex",
      type: "pass",
      html: '<div tabindex="0">Focusable in natural order</div>',
      description: "Element with tabindex=0",
      source: "builtin",
    },
    {
      ruleId: "tabindex",
      type: "pass",
      html: '<div tabindex="-1">Programmatically focusable</div>',
      description: "Element with tabindex=-1",
      source: "builtin",
    },
  ],
};

/**
 * Fetch a fixture from GitHub
 */
async function fetchFromGitHub(
  ruleId: string,
  branch: string = DEFAULT_GITHUB_BRANCH
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${AXE_CORE_REPO}/${branch}/test/integration/rules/${ruleId}/${ruleId}.html`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Parse HTML fixture to extract violation and pass examples
 */
function parseFixtureHtml(html: string, ruleId: string): ExtractedFixture[] {
  const fixtures: ExtractedFixture[] = [];

  // axe-core fixtures typically have structure like:
  // <!-- violations -->
  // <div id="violation">...</div>
  // <!-- passes -->
  // <div id="pass">...</div>

  // Simple regex-based parsing for common patterns
  const violationMatch = html.match(/<[^>]*id=["']?violation["']?[^>]*>[\s\S]*?<\/[^>]+>/gi);
  const passMatch = html.match(/<[^>]*id=["']?pass["']?[^>]*>[\s\S]*?<\/[^>]+>/gi);

  if (violationMatch) {
    fixtures.push({
      ruleId,
      type: "violation",
      html: violationMatch[0] ?? "",
      description: `Violation example for ${ruleId}`,
      source: "github",
    });
  }

  if (passMatch) {
    fixtures.push({
      ruleId,
      type: "pass",
      html: passMatch[0] ?? "",
      description: `Pass example for ${ruleId}`,
      source: "github",
    });
  }

  return fixtures;
}

/**
 * Get fixtures from local axe-core repository
 */
function getLocalFixtures(ruleId: string, localPath: string): ExtractedFixture[] {
  const fixturePath = join(localPath, "test", "integration", "rules", ruleId, `${ruleId}.html`);

  if (!existsSync(fixturePath)) {
    return [];
  }

  try {
    const html = readFileSync(fixturePath, "utf-8");
    const fixtures = parseFixtureHtml(html, ruleId);
    return fixtures.map((f) => ({ ...f, source: "local" as const }));
  } catch {
    return [];
  }
}

/**
 * Extract fixtures for a specific rule
 */
export async function extractFixturesForRule(
  ruleId: string,
  options: ExtractorOptions = {}
): Promise<ExtractedFixture[]> {
  // Try local path first if provided
  if (options.localAxeCorePath) {
    const localFixtures = getLocalFixtures(ruleId, options.localAxeCorePath);
    if (localFixtures.length > 0) {
      return localFixtures;
    }
  }

  // Try built-in fixtures
  const builtinFixtures = BUILTIN_FIXTURES[ruleId];
  if (builtinFixtures) {
    return builtinFixtures;
  }

  // Try GitHub if enabled
  if (options.fetchFromGitHub) {
    const html = await fetchFromGitHub(ruleId, options.githubBranch ?? DEFAULT_GITHUB_BRANCH);
    if (html) {
      const fixtures = parseFixtureHtml(html, ruleId);
      if (fixtures.length > 0) {
        // Cache the fixtures if cache directory is provided
        if (options.cacheDir) {
          cacheFixtures(ruleId, fixtures, options.cacheDir);
        }
        return fixtures;
      }
    }
  }

  return [];
}

/**
 * Extract fixtures for multiple rules
 */
export async function extractFixturesForRules(
  ruleIds: string[],
  options: ExtractorOptions = {}
): Promise<Map<string, ExtractedFixture[]>> {
  const results = new Map<string, ExtractedFixture[]>();

  for (const ruleId of ruleIds) {
    const fixtures = await extractFixturesForRule(ruleId, options);
    results.set(ruleId, fixtures);
  }

  return results;
}

/**
 * Get all available built-in fixtures
 */
export function getBuiltinFixtures(): Map<string, ExtractedFixture[]> {
  return new Map(Object.entries(BUILTIN_FIXTURES));
}

/**
 * Get list of rules with built-in fixtures
 */
export function getBuiltinFixtureRules(): string[] {
  return Object.keys(BUILTIN_FIXTURES);
}

/**
 * Cache fixtures to disk
 */
function cacheFixtures(ruleId: string, fixtures: ExtractedFixture[], cacheDir: string): void {
  try {
    const cachePath = join(cacheDir, `${ruleId}.json`);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(fixtures, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Load cached fixtures
 */
export function loadCachedFixtures(ruleId: string, cacheDir: string): ExtractedFixture[] | null {
  try {
    const cachePath = join(cacheDir, `${ruleId}.json`);
    if (existsSync(cachePath)) {
      const content = readFileSync(cachePath, "utf-8");
      return JSON.parse(content) as ExtractedFixture[];
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}
